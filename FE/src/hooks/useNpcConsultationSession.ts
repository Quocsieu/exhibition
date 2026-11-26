import { useCallback, useEffect, useRef, useState } from 'react';
import {
  v28Api,
  type V28BoothAudioPack,
  type V28BoothPlacementView,
  type V28Product,
} from '../services/v28Api';
import {
  buildPiperStepPlanFromDisplayText,
  piperBrowserTts,
  shouldAllowPiperBackgroundPrewarm,
} from '../services/hybridTtsAdapter';
import {
  HybridPlaybackCoordinator,
  type AttemptAudioContext,
  type AttemptDirectTtsContext,
  type LockedAudioVoiceConfig,
} from '../services/hybridPlaybackController';

function buildAudioVoiceSignature(
  provider?: string,
  modelId?: string,
  voiceId?: string,
  speed?: number,
  style?: string,
  configVersion?: string
): string {
  const spd = Number(speed ?? 1.0).toFixed(2);
  const stylePart = style || configVersion ? `|${(style || '').trim()}|${configVersion || 'v1'}` : '';
  return `${provider || 'gemini'}|${modelId || 'unknown'}|${voiceId || 'unknown'}|${spd}${stylePart}`;
}
import {
  resolveNpcTtsMode,
  resolveNpcTtsProvider,
  resolveSupertonicSpeed,
  resolveSupertonicVoicePreset,
} from '../services/npcTtsConfig';
import { npcHybridTtsEngine } from '../services/npcHybridTtsEngine';
import {
  buildSupertonicStepChunks,
  supertonicTtsAdapter,
} from '../services/supertonicTtsAdapter';
import { npcWebAudioPlayer } from '../services/npcWebAudioPlayer';
import { npcAudioFirstService } from '../services/npcAudioFirstService';
import {
  buildBoothConsultationSteps,
  buildProductConsultationSteps,
  type BoothConsultationStep,
} from '../services/npcConsultationScript';
import { isRealBackendSpeechClip } from '../components/v28/V28NpcConsultantPanel';
import type { V28NpcAnimState } from '../scene/v28/DynamicBoothNpc3D';
import { API_BASE_URL } from '../config/apiConfig';

export type NpcSessionState = 'IDLE' | 'LOADING' | 'SPEAKING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
export type NpcConsultationMode = 'idle' | 'booth' | 'product';

export interface HighlightedBoothProduct {
  boothId: string;
  slotId: string;
  productId: string;
  productName: string;
}

interface PlaybackCursor {
  stepIndex: number;
  chunkIndex: number;
  offsetSec: number;
}

export interface UseNpcConsultationSessionResult {
  sessionState: NpcSessionState;
  consultationMode: NpcConsultationMode;
  activeBoothId: string | null;
  activeProductId: string | null;
  animState: V28NpcAnimState;
  highlightedProduct: HighlightedBoothProduct | null;
  currentSubtitle: string | null;
  isMuted: boolean;
  errorMessage: string | null;
  handleNpcClick: (booth: V28BoothPlacementView) => void;
  startProductConsultation: (
    booth: V28BoothPlacementView,
    product: V28Product,
    slotId: string,
    options?: { forceReplay?: boolean }
  ) => void;
  pauseSession: () => void;
  stopPlaybackOnly: () => void;
  stopSession: () => void;
  toggleMute: () => void;
}

/**
 * Headless NPC consultation state machine & audio lifecycle manager (Phase 1.1–1.4 + Phase A).
 *
 * State machine:
 *   IDLE -> LOADING -> SPEAKING -> PAUSED -> SPEAKING -> COMPLETED (and ERROR)
 *
 * Strictly preserves:
 * - Audio-First + Multi-Provider Hybrid TTS (Gemini -> Vbee -> Edge Neural; FPT disabled by default)
 * - Web Audio API Hybrid TTS (`npcWebAudioPlayer` + `npcHybridTtsEngine` + 85 WAV manifest)
 * - Cross-step off-main-thread pre-decoding
 * - HTMLAudioElement fallback & Legacy Piper WASM (`?npcTtsMode=legacy`)
 * - 440Hz `:local-fallback` chime guard (`isRealBackendSpeechClip`)
 * - Exact pause/resume cursor (`stepIndex`, `chunkIndex`, `offsetSec`)
 * - Synchronized 3D product highlight (`boothId`, `slotId`, `productId`) & subtitle
 */
export function useNpcConsultationSession(): UseNpcConsultationSessionResult {
  const [sessionState, setSessionState] = useState<NpcSessionState>('IDLE');
  const [consultationMode, setConsultationMode] = useState<NpcConsultationMode>('idle');
  const [activeBoothId, setActiveBoothId] = useState<string | null>(null);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [animState, setAnimState] = useState<V28NpcAnimState>('idle');
  const [highlightedProduct, setHighlightedProduct] = useState<HighlightedBoothProduct | null>(null);
  const [currentSubtitle, setCurrentSubtitle] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionStateRef = useRef<NpcSessionState>('IDLE');
  sessionStateRef.current = sessionState;
  const consultationModeRef = useRef<NpcConsultationMode>('idle');
  consultationModeRef.current = consultationMode;
  const activeProductIdRef = useRef<string | null>(null);
  activeProductIdRef.current = activeProductId;
  const activeBoothRef = useRef<V28BoothPlacementView | null>(null);
  const stepsRef = useRef<BoothConsultationStep[]>([]);
  const audioPackRef = useRef<V28BoothAudioPack | null>(null);
  const isMutedRef = useRef<boolean>(false);
  isMutedRef.current = isMuted;

  const isMountedRef = useRef<boolean>(true);
  const sessionNonceRef = useRef<number>(0);
  const coordinatorRef = useRef<HybridPlaybackCoordinator>(new HybridPlaybackCoordinator());
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const currentCursorRef = useRef<PlaybackCursor>({ stepIndex: 0, chunkIndex: 0, offsetSec: 0 });
  const pausedCursorRef = useRef<PlaybackCursor | null>(null);

  const cleanupActiveAudio = useCallback((captureOffset: boolean): number => {
    let capturedOffset = 0;
    if (captureOffset) {
      if (audioElRef.current) {
        capturedOffset = audioElRef.current.currentTime || 0;
      } else {
        capturedOffset = npcWebAudioPlayer.getCurrentOffsetSec();
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    npcWebAudioPlayer.stop();

    if (audioElRef.current) {
      audioElRef.current.onplay = null;
      audioElRef.current.onpause = null;
      audioElRef.current.onended = null;
      audioElRef.current.onerror = null;
      try {
        audioElRef.current.pause();
      } catch {
        // ignore
      }
      audioElRef.current = null;
    }

    if (activeObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      } catch {
        // ignore
      }
      activeObjectUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    return capturedOffset;
  }, []);

  const prewarmDirectTts = useCallback(() => {
    void npcHybridTtsEngine.warmManifest().catch(() => false);
    if (shouldAllowPiperBackgroundPrewarm().allowed) {
      void piperBrowserTts.prewarmInBackground().catch(() => false);
    }
  }, []);

  /**
   * Phase 1.7.3 Fast Fallback: While waiting up to 2,000ms for Audio TTS, prepare ONLY the opening
   * Piper chunk in background (preferring pregen manifest, else low-priority Worker synthesis).
   * If 2,000ms expires, DIRECT_TTS starts immediately from RAM cache without cold-starting.
   */
  const prepareOpeningDirectChunk = useCallback((steps: BoothConsultationStep[], signal: AbortSignal) => {
    const firstText = steps[0]?.fallbackText;
    if (!firstText || signal.aborted) return;
    const openingChunk = buildPiperStepPlanFromDisplayText(firstText).chunks[0];
    if (!openingChunk) return;
    void (async () => {
      try {
        const pregen = await npcHybridTtsEngine.tryFetchPregenAudio(openingChunk, signal).catch(() => null);
        if (pregen || signal.aborted) return;
        await piperBrowserTts
          .synthesizeNormalizedChunk({
            normalizedText: openingChunk,
            priority: 'low',
            signal,
          })
          .catch(() => null);
      } catch {
        // Best-effort predictive pre-synthesis; never throws
      }
    })();
  }, []);

  const stopPlaybackOnly = useCallback(() => {
    sessionNonceRef.current += 1;
    coordinatorRef.current.stopPlaybackOnly();
    cleanupActiveAudio(false);
    pausedCursorRef.current = null;
    currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };
    if (isMountedRef.current) {
      setActiveProductId(null);
      setConsultationMode('idle');
      setSessionState('IDLE');
      setAnimState('idle');
      setHighlightedProduct(null);
      setCurrentSubtitle(null);
      setErrorMessage(null);
    }
  }, [cleanupActiveAudio]);

  const stopSession = useCallback(() => {
    sessionNonceRef.current += 1;
    coordinatorRef.current.stop({ resetAllLocks: true });
    cleanupActiveAudio(false);
    activeBoothRef.current = null;
    stepsRef.current = [];
    audioPackRef.current = null;
    pausedCursorRef.current = null;
    currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };
    if (isMountedRef.current) {
      setActiveBoothId(null);
      setActiveProductId(null);
      setConsultationMode('idle');
      setSessionState('IDLE');
      setAnimState('idle');
      setHighlightedProduct(null);
      setCurrentSubtitle(null);
      setErrorMessage(null);
    }
    piperBrowserTts.scheduleIdleRelease(90_000);
  }, [cleanupActiveAudio]);

  const syncStepVisuals = useCallback(
    (booth: V28BoothPlacementView, step: BoothConsultationStep, overrideSubtitle?: string | null) => {
      if (!isMountedRef.current) return;
      const subtitleText =
        (overrideSubtitle && overrideSubtitle.trim()) ||
        step.naturalSpeechText ||
        step.fallbackText ||
        null;
      setCurrentSubtitle(subtitleText);

      if (step.type === 'GREETING') {
        setAnimState('greet');
        setHighlightedProduct(null);
      } else if (step.type === 'PRODUCT' && step.product) {
        setAnimState('point');
        setHighlightedProduct({
          boothId: booth.boothId,
          slotId: step.slotKey,
          productId: step.product.id,
          productName: step.product.name,
        });
      } else {
        setAnimState('talk');
        setHighlightedProduct(null);
      }
    },
    []
  );

  const playFromCursor = useCallback(
    async (
      booth: V28BoothPlacementView,
      steps: BoothConsultationStep[],
      pack: V28BoothAudioPack | null,
      startCursor: PlaybackCursor,
      runNonce: number,
      playOptions?: {
        skipBackendSynth?: boolean;
        allowLegacyFallback?: boolean;
        directTtsOnly?: boolean;
        hybridAudioCtx?: AttemptAudioContext;
        directTtsCtx?: AttemptDirectTtsContext;
      }
    ) => {
      const isStale = () => !isMountedRef.current || sessionNonceRef.current !== runNonce;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const audioCtx = playOptions?.hybridAudioCtx;
      const directCtx = playOptions?.directTtsCtx;
      let effectiveDirectOnly = Boolean(playOptions?.directTtsOnly);

      if (audioCtx) {
        audioCtx.audioPlaybackSignal.addEventListener(
          'abort',
          () => {
            controller.abort();
          },
          { once: true }
        );
      }
      if (directCtx) {
        directCtx.sessionSignal.addEventListener(
          'abort',
          () => {
            controller.abort();
          },
          { once: true }
        );
      }

      const playHtmlAudio = (blob: Blob, startOffsetSec: number, onStartPlayback: () => void) =>
        new Promise<void>((resolve, reject) => {
          const objUrl = URL.createObjectURL(blob);
          const audio = new Audio(objUrl);
          audio.preload = 'auto';
          if (activeObjectUrlRef.current && activeObjectUrlRef.current !== objUrl) {
            try {
              URL.revokeObjectURL(activeObjectUrlRef.current);
            } catch {
              // ignore
            }
          }
          activeObjectUrlRef.current = objUrl;
          audio.muted = isMutedRef.current;
          audioElRef.current = audio;

          const cleanup = () => {
            audio.onplay = null;
            audio.onplaying = null;
            audio.onpause = null;
            audio.onended = null;
            audio.onerror = null;
          };

          let playSignaled = false;
          audio.onplaying = () => {
            if (playSignaled) return;
            playSignaled = true;
            if (!controller.signal.aborted && !isStale()) {
              if (audioCtx && !effectiveDirectOnly) {
                if (!audioCtx.markAudioStarted()) {
                  cleanup();
                  audio.pause();
                  resolve();
                  return;
                }
              } else if (directCtx) {
                directCtx.markDirectStarted();
              }
              setSessionState('SPEAKING');
              onStartPlayback();
            }
          };
          audio.onended = () => {
            cleanup();
            resolve();
          };
          audio.onerror = () => {
            cleanup();
            reject(new Error('Audio playback error'));
          };

          controller.signal.addEventListener(
            'abort',
            () => {
              cleanup();
              audio.pause();
              resolve();
            },
            { once: true }
          );

          const startPlay = () => {
            if (startOffsetSec > 0.05 && Number.isFinite(audio.duration) && startOffsetSec < audio.duration - 0.05) {
              try {
                audio.currentTime = startOffsetSec;
              } catch {
                // ignore seek error
              }
            }
            audio.play().catch((err: unknown) => {
              cleanup();
              if (controller.signal.aborted || isStale() || audioElRef.current !== audio) {
                resolve();
                return;
              }
              reject(err);
            });
          };

          if (startOffsetSec > 0.05) {
            audio.addEventListener('loadedmetadata', startPlay, { once: true });
            audio.load();
          } else {
            startPlay();
          }
        });

      const ttsMode = resolveNpcTtsMode();
      const ttsProvider = resolveNpcTtsProvider();
      const supertonicVoice = resolveSupertonicVoicePreset();
      const supertonicSpeed = resolveSupertonicSpeed();

      const resolveStepSpeechForActiveProvider = (
        step: BoothConsultationStep,
        clip: { transcript?: string } | null
      ): string => {
        if (clip?.transcript) return clip.transcript;
        if (!effectiveDirectOnly && ttsProvider === 'supertonic' && !supertonicTtsAdapter.isCircuitOpen()) {
          return step.naturalSpeechText || step.fallbackText;
        }
        return step.fallbackText;
      };

      const buildChunksForStep = (stepSpeechText: string): string[] => {
        if (!effectiveDirectOnly && ttsProvider === 'supertonic' && !supertonicTtsAdapter.isCircuitOpen()) {
          return buildSupertonicStepChunks(stepSpeechText);
        }
        return buildPiperStepPlanFromDisplayText(stepSpeechText).chunks;
      };

      const getUpcomingChunks = (fromStepIdx: number, fromChunkIdx: number, currentChunks: string[], count: number): string[] => {
        const upcoming: string[] = [];
        for (let ci = fromChunkIdx + 1; ci < currentChunks.length && upcoming.length < count; ci += 1) {
          if (currentChunks[ci]) upcoming.push(currentChunks[ci]);
        }
        for (let si = fromStepIdx + 1; si < steps.length && upcoming.length < count; si += 1) {
          const nextStep = steps[si];
          const nextClip = Array.isArray(pack?.clips)
            ? pack.clips.find((c) => c.slotKey === nextStep.slotKey) || null
            : null;
          if (pack?.liveGeminiTtsEnabled && isRealBackendSpeechClip(nextClip)) continue;
          const nextSpeechText = resolveStepSpeechForActiveProvider(nextStep, nextClip);
          if (!nextSpeechText) continue;
          const nextStepChunks = buildChunksForStep(nextSpeechText);
          for (const nc of nextStepChunks) {
            if (nc) {
              upcoming.push(nc);
              if (upcoming.length >= count) break;
            }
          }
        }
        return upcoming;
      };

      try {
        for (let stepIdx = startCursor.stepIndex; stepIdx < steps.length; stepIdx += 1) {
          if (controller.signal.aborted || isStale()) return;
          const step = steps[stepIdx];
          if (!step) continue;

          syncStepVisuals(booth, step);

          const clip = Array.isArray(pack?.clips)
            ? pack.clips.find((c) => c.slotKey === step.slotKey) || null
            : null;

          // Bounded next-step prefetch (at most 1 upcoming step while current step speaks)
          const prefetchNextStep = (nextIdx: number) => {
            const nextStep = steps[nextIdx];
            if (!nextStep || controller.signal.aborted || isStale()) return;
            const nextClip = Array.isArray(pack?.clips)
              ? pack.clips.find((c) => c.slotKey === nextStep.slotKey) || null
              : null;
            if (isRealBackendSpeechClip(nextClip) && nextClip) {
              const nextMeta = nextClip as typeof nextClip & { provider?: string; sourceType?: string };
              void npcAudioFirstService.fetchAudioBlobFromUrl({
                audioId: nextClip.audioId,
                audioUrl: nextClip.audioUrl,
                source:
                  nextMeta.sourceType === 'uploaded'
                    ? 'uploaded'
                    : nextMeta.sourceType === 'cached'
                      ? 'cached'
                      : 'pre_generated',
                provider: nextMeta.provider || 'edge',
                voiceId: nextClip.voiceId,
                signal: controller.signal,
              });
            } else if (!playOptions?.skipBackendSynth) {
              const nextText = nextStep.naturalSpeechText || nextStep.fallbackText;
              if (nextText) {
                void npcAudioFirstService.trySynthesizeViaBackendHybrid({
                  text: nextText,
                  entityType: nextStep.type === 'PRODUCT' && nextStep.product ? 'product' : 'booth',
                  entityId: nextStep.type === 'PRODUCT' && nextStep.product ? nextStep.product.id : booth.boothId,
                  slotKey: nextStep.slotKey,
                  signal: controller.signal,
                });
              }
            }
          };

          // Mode 1 (Audio-First): Admin uploaded / pre-generated / cached real backend audio
          // Plays via Web Audio API (with LRU cache so pause/resume NEVER re-fetches or re-calls TTS!)
          if (!effectiveDirectOnly && isRealBackendSpeechClip(clip) && clip) {
            const clipMeta = clip as typeof clip & { provider?: string; sourceType?: string };
            const clipProvider = clipMeta.provider || 'gemini';
            const clipSig = buildAudioVoiceSignature(clipProvider, clip.modelId, clip.voiceId);
            if (!coordinatorRef.current.lockManager.matchesLockedAudioSignature(booth.boothId, clipSig)) {
              // Strict ONE BOOTH - ONE VOICE: reject clip with mismatched voice signature
              if (audioCtx && stepIdx === startCursor.stepIndex) return;
              return;
            }
            const audioVoiceIdentity: LockedAudioVoiceConfig = {
              engine: 'backend-audio-tts',
              provider: clipProvider,
              modelId: clip.modelId,
              voiceId: clip.voiceId,
              voiceSignature: clipSig,
            };
            currentCursorRef.current = { stepIndex: stepIdx, chunkIndex: 0, offsetSec: 0 };
            const resumeOffset = stepIdx === startCursor.stepIndex ? startCursor.offsetSec : 0;
            const resolvedBlob = await npcAudioFirstService.fetchAudioBlobFromUrl({
              audioId: clip.audioId,
              audioUrl: clip.audioUrl,
              source:
                clipMeta.sourceType === 'uploaded'
                  ? 'uploaded'
                  : clipMeta.sourceType === 'cached'
                    ? 'cached'
                    : 'pre_generated',
              provider: clipProvider,
              voiceId: clip.voiceId,
              signal: audioCtx ? audioCtx.sessionSignal : controller.signal,
            });
            if (controller.signal.aborted || isStale() || (audioCtx && !audioCtx.isAudioAuthorized())) return;
            if (resolvedBlob) {
              const mode1Log = {
                requestedProvider: 'backend-audio-tts',
                actualProvider: clipProvider,
                voicePreset: clip.voiceId,
                voiceSignature: clipSig,
                lockState: coordinatorRef.current.lockManager.getLockState(booth.boothId),
                cacheStatus: resolvedBlob.source,
                audioId: clip.audioId,
                bytes: resolvedBlob.blob.size,
              };
              if (typeof window !== 'undefined') {
                (window as unknown as { __V28_LAST_TTS_EVENT__?: unknown }).__V28_LAST_TTS_EVENT__ = mode1Log;
              }
              console.info('[V28 NPC TTS]', mode1Log);
              if (npcWebAudioPlayer.isSupported()) {
                const handled = await npcWebAudioPlayer.playBlob(resolvedBlob.cacheKey, resolvedBlob.blob, {
                  signal: controller.signal,
                  muted: isMutedRef.current,
                  startOffsetSec: resumeOffset,
                  onStartPlayback: () => {
                    if (!controller.signal.aborted && !isStale()) {
                      if (audioCtx && !audioCtx.markAudioStarted(audioVoiceIdentity)) return;
                      coordinatorRef.current.lockManager.lockBoothToAudioTts(booth.boothId, audioVoiceIdentity);
                      setSessionState('SPEAKING');
                      prefetchNextStep(stepIdx + 1);
                    }
                  },
                });
                if (handled) continue;
              }
              await playHtmlAudio(resolvedBlob.blob, resumeOffset, () => prefetchNextStep(stepIdx + 1));
              continue;
            }
          }

          // Mode 2 (Backend Multi-Provider Hybrid TTS: Gemini -> Vbee -> Edge with persistent cache)
          // Skipped when caller already resolved via /booths/:id/products/:productId/consultation or when booth is locked!
          const stepEntityType = step.type === 'PRODUCT' && step.product ? 'product' : 'booth';
          const stepEntityId = step.type === 'PRODUCT' && step.product ? step.product.id : booth.boothId;
          const hybridStepText = step.naturalSpeechText || step.fallbackText;
          if (!effectiveDirectOnly && !playOptions?.skipBackendSynth && hybridStepText) {
            const resumeOffset = stepIdx === startCursor.stepIndex ? startCursor.offsetSec : 0;
            const hybridBlob = await npcAudioFirstService.trySynthesizeViaBackendHybrid({
              text: hybridStepText,
              entityType: stepEntityType,
              entityId: stepEntityId,
              slotKey: step.slotKey,
              signal: audioCtx ? audioCtx.sessionSignal : controller.signal,
            });
            if (controller.signal.aborted || isStale() || (audioCtx && !audioCtx.isAudioAuthorized())) return;
            if (hybridBlob) {
              const hybridSig = buildAudioVoiceSignature(hybridBlob.provider, hybridBlob.provider, hybridBlob.voiceId);
              if (!coordinatorRef.current.lockManager.matchesLockedAudioSignature(booth.boothId, hybridSig)) {
                if (audioCtx && stepIdx === startCursor.stepIndex) return;
                return;
              }
              const hybridVoiceIdentity: LockedAudioVoiceConfig = {
                engine: 'backend-audio-tts',
                provider: hybridBlob.provider,
                modelId: hybridBlob.provider,
                voiceId: hybridBlob.voiceId,
                voiceSignature: hybridSig,
              };
              currentCursorRef.current = { stepIndex: stepIdx, chunkIndex: 0, offsetSec: resumeOffset };
              const mode2Log = {
                requestedProvider: 'backend-audio-tts',
                actualProvider: hybridBlob.provider,
                voicePreset: hybridBlob.voiceId,
                voiceSignature: hybridSig,
                lockState: coordinatorRef.current.lockManager.getLockState(booth.boothId),
                cacheStatus: hybridBlob.source,
                audioId: hybridBlob.audioId,
                bytes: hybridBlob.blob.size,
              };
              if (typeof window !== 'undefined') {
                (window as unknown as { __V28_LAST_TTS_EVENT__?: unknown }).__V28_LAST_TTS_EVENT__ = mode2Log;
              }
              console.info('[V28 NPC TTS]', mode2Log);
              if (npcWebAudioPlayer.isSupported()) {
                const handled = await npcWebAudioPlayer.playBlob(hybridBlob.cacheKey, hybridBlob.blob, {
                  signal: controller.signal,
                  muted: isMutedRef.current,
                  startOffsetSec: resumeOffset,
                  onStartPlayback: () => {
                    if (!controller.signal.aborted && !isStale()) {
                      if (audioCtx && !audioCtx.markAudioStarted(hybridVoiceIdentity)) return;
                      coordinatorRef.current.lockManager.lockBoothToAudioTts(booth.boothId, hybridVoiceIdentity);
                      setSessionState('SPEAKING');
                      prefetchNextStep(stepIdx + 1);
                    }
                  },
                });
                if (handled) continue;
              }
              await playHtmlAudio(hybridBlob.blob, resumeOffset, () => prefetchNextStep(stepIdx + 1));
              continue;
            }
          }

          // Strict ONE BOOTH - ONE VOICE:
          // - If AUDIO_TTS_LOCKED is already established, NEVER silently fall back to Piper/Supertonic!
          // - If UNLOCKED on initial step with audioCtx, return so coordinator handles 2000ms/DIRECT_TTS fallback.
          if (!effectiveDirectOnly) {
            if (coordinatorRef.current.lockManager.getLockState(booth.boothId) === 'AUDIO_TTS_LOCKED') {
              if (stepIdx === startCursor.stepIndex) {
                setSessionState('ERROR');
                setErrorMessage('Không thể phát đúng giọng đã khóa của gian hàng.');
              }
              return;
            }
            if (audioCtx && stepIdx === startCursor.stepIndex) {
              return;
            }
            coordinatorRef.current.lockManager.lockBoothToDirectTts(booth.boothId, 'audio_error');
            effectiveDirectOnly = true;
          }

          // Respect legacyFallbackEnabled=false: keep subtitle visible & complete cleanly without calling legacy TTS
          if (playOptions?.allowLegacyFallback === false) {
            continue;
          }

          const speechText = resolveStepSpeechForActiveProvider(step, clip);
          if (!speechText) continue;

          const chunks = buildChunksForStep(speechText);
          const firstChunkIdx = stepIdx === startCursor.stepIndex ? startCursor.chunkIndex : 0;

          for (let chunkIdx = firstChunkIdx; chunkIdx < chunks.length; chunkIdx += 1) {
            if (controller.signal.aborted || isStale()) return;

            const resumeOffsetSec =
              stepIdx === startCursor.stepIndex && chunkIdx === startCursor.chunkIndex
                ? startCursor.offsetSec
                : 0;
            currentCursorRef.current = { stepIndex: stepIdx, chunkIndex: chunkIdx, offsetSec: resumeOffsetSec };

            let prefetchedForCurrentChunk = false;
            const scheduleDeferredPrefetch = () => {
              if (prefetchedForCurrentChunk || controller.signal.aborted || isStale()) return;
              prefetchedForCurrentChunk = true;

              // When Supertonic 3 is active and healthy (and NOT locked to DIRECT_TTS Piper), prefetch 2 upcoming chunks
              if (!effectiveDirectOnly && ttsProvider === 'supertonic' && !supertonicTtsAdapter.isCircuitOpen()) {
                const upcoming = getUpcomingChunks(stepIdx, chunkIdx, chunks, 2);
                if (upcoming.length === 0) return;
                void (async () => {
                  for (const nextText of upcoming) {
                    if (controller.signal.aborted || isStale() || supertonicTtsAdapter.isCircuitOpen()) break;
                    const nextSt = await supertonicTtsAdapter
                      .trySynthesizeChunk(nextText, {
                        voicePreset: supertonicVoice,
                        speed: supertonicSpeed,
                        signal: controller.signal,
                      })
                      .catch(() => null);
                    if (nextSt && !controller.signal.aborted && !isStale() && npcWebAudioPlayer.isSupported()) {
                      await npcWebAudioPlayer.predecodeBlob(nextSt.cacheKey, nextSt.blob).catch(() => null);
                    }
                  }
                })();
                return;
              }

              const prefetchNextFallback = async (nextText: string) => {
                if (ttsMode === 'hybrid' && (await npcHybridTtsEngine.hasPregenEntry(nextText))) {
                  const nextPregen = await npcHybridTtsEngine
                    .tryFetchPregenAudio(nextText, controller.signal)
                    .catch(() => null);
                  if (nextPregen && !controller.signal.aborted && !isStale() && npcWebAudioPlayer.isSupported()) {
                    void npcWebAudioPlayer.predecodeBlob(nextPregen.hash, nextPregen.blob);
                  }
                  return;
                }
                void piperBrowserTts
                  .synthesizeNormalizedChunk({
                    normalizedText: nextText,
                    priority: 'low',
                    signal: controller.signal,
                  })
                  .catch(() => { });
              };

              const nextFallbackChunk = getUpcomingChunks(stepIdx, chunkIdx, chunks, 1)[0];
              if (nextFallbackChunk) {
                void prefetchNextFallback(nextFallbackChunk);
              }
            };

            // Phase B: Supertonic 3 Vietnamese Female Voice Adapter (skipped when booth is locked to DIRECT_TTS Piper!)
            let supertonicFallbackReason: string | null = null;
            if (!effectiveDirectOnly && ttsProvider === 'supertonic') {
              if (supertonicTtsAdapter.isCircuitOpen() || !(await supertonicTtsAdapter.ensureServerReady(controller.signal))) {
                supertonicFallbackReason =
                  supertonicTtsAdapter.getLastFailureReason() || 'Supertonic circuit-breaker open';
              } else {
                // Start prefetching chunk+1 while chunk 0 is synthesizing on initial start so backend queue stays warm!
                const stRes = await supertonicTtsAdapter.trySynthesizeChunk(chunks[chunkIdx], {
                  voicePreset: supertonicVoice,
                  speed: supertonicSpeed,
                  signal: controller.signal,
                });
                if (controller.signal.aborted || isStale()) return;
                if (stRes) {
                  // Kick off lookahead synthesis of k+1 & k+2 immediately (even while decoding k) to guarantee 0ms inter-chunk gap!
                  scheduleDeferredPrefetch();
                  try {
                    const logPayload = {
                      requestedProvider: ttsProvider,
                      actualProvider: 'supertonic3',
                      voicePreset: stRes.voicePreset,
                      speed: stRes.speed,
                      fallbackReason: null as string | null,
                      cacheStatus: stRes.cacheStatus,
                      synthMs: stRes.synthMs,
                      bytes: stRes.blob.size,
                      audioContextState: npcWebAudioPlayer.getDebugState().contextState,
                    };
                    if (typeof window !== 'undefined') {
                      (window as unknown as { __V28_LAST_TTS_EVENT__?: unknown }).__V28_LAST_TTS_EVENT__ = logPayload;
                    }
                    console.info('[V28 NPC TTS]', logPayload);

                    if (npcWebAudioPlayer.isSupported()) {
                      const handled = await npcWebAudioPlayer.playBlob(stRes.cacheKey, stRes.blob, {
                        signal: controller.signal,
                        muted: isMutedRef.current,
                        startOffsetSec: resumeOffsetSec,
                        onStartPlayback: () => {
                          if (!controller.signal.aborted && !isStale()) {
                            setSessionState('SPEAKING');
                            scheduleDeferredPrefetch();
                          }
                        },
                      });
                      if (handled) continue;
                    }
                    await playHtmlAudio(stRes.blob, resumeOffsetSec, scheduleDeferredPrefetch);
                    continue;
                  } catch (stPlayErr: unknown) {
                    if (controller.signal.aborted || isStale()) return;
                    if ((stPlayErr as { name?: string })?.name === 'NotAllowedError') {
                      throw stPlayErr;
                    }
                    supertonicFallbackReason =
                      stPlayErr instanceof Error ? stPlayErr.message : 'Supertonic audio decode/playback failed';
                  }
                } else {
                  supertonicFallbackReason =
                    supertonicTtsAdapter.getLastFailureReason() || 'Supertonic unavailable';
                }
              }
            }

            // Hybrid fast-path (Web Audio API real-time OS audio thread + cross-step pre-decode)
            if (effectiveDirectOnly || ttsMode === 'hybrid' || ttsProvider === 'hybrid-piper' || Boolean(supertonicFallbackReason)) {
              const pregen = await npcHybridTtsEngine.tryFetchPregenAudio(chunks[chunkIdx], controller.signal);
              if (controller.signal.aborted || isStale()) return;
              if (pregen) {
                const logPayload = {
                  requestedProvider: ttsProvider,
                  actualProvider: 'hybrid-piper-pregen',
                  voicePreset: 'vi_VN-vais1000-medium',
                  fallbackReason: supertonicFallbackReason,
                  cacheStatus: pregen.cacheStatus,
                  synthMs: Math.round(pregen.fetchMs),
                  bytes: pregen.bytes,
                  audioContextState: npcWebAudioPlayer.getDebugState().contextState,
                };
                if (typeof window !== 'undefined') {
                  (window as unknown as { __V28_LAST_TTS_EVENT__?: unknown }).__V28_LAST_TTS_EVENT__ = logPayload;
                }
                console.info('[V28 NPC TTS]', logPayload);
                try {
                  if (npcWebAudioPlayer.isSupported()) {
                    const handled = await npcWebAudioPlayer.playBlob(pregen.hash, pregen.blob, {
                      signal: controller.signal,
                      muted: isMutedRef.current,
                      startOffsetSec: resumeOffsetSec,
                      onStartPlayback: () => {
                        if (!controller.signal.aborted && !isStale()) {
                          directCtx?.markDirectStarted();
                          setSessionState('SPEAKING');
                          scheduleDeferredPrefetch();
                        }
                      },
                    });
                    if (handled) continue;
                  }
                  await playHtmlAudio(pregen.blob, resumeOffsetSec, scheduleDeferredPrefetch);
                  continue;
                } catch (pregenErr: unknown) {
                  if (controller.signal.aborted || isStale()) return;
                  if ((pregenErr as { name?: string })?.name === 'NotAllowedError') {
                    throw pregenErr;
                  }
                  npcHybridTtsEngine.markHashFailed(pregen.hash);
                }
              }
            }

            // Legacy Piper WASM path (untouched original voice & Hybrid fallback)
            const result = await piperBrowserTts.synthesizeNormalizedChunk({
              normalizedText: chunks[chunkIdx],
              priority: 'high',
              signal: controller.signal,
            });
            if (controller.signal.aborted || isStale()) return;
            const piperLog = {
              requestedProvider: ttsProvider,
              actualProvider: 'browser-piper-wasm',
              voicePreset: result.voice,
              fallbackReason: supertonicFallbackReason,
              cacheStatus: result.cacheStatus,
              synthMs: result.synthMs,
              bytes: result.blob.size,
              audioContextState: npcWebAudioPlayer.getDebugState().contextState,
            };
            if (typeof window !== 'undefined') {
              (window as unknown as { __V28_LAST_TTS_EVENT__?: unknown }).__V28_LAST_TTS_EVENT__ = piperLog;
            }
            console.info('[V28 NPC TTS]', piperLog);
            await playHtmlAudio(result.blob, resumeOffsetSec, scheduleDeferredPrefetch);
          }
        }

        if (!controller.signal.aborted && !isStale()) {
          pausedCursorRef.current = null;
          currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };
          setSessionState('COMPLETED');
          setAnimState('idle');
          // Keep product highlight active in product mode until visitor closes product card or exits booth
          if (consultationModeRef.current !== 'product') {
            setHighlightedProduct(null);
          }
        }
      } catch (err: unknown) {
        if (controller.signal.aborted || isStale()) return;
        const isNotAllowed = (err as { name?: string })?.name === 'NotAllowedError';
        setAnimState('idle');
        if (isNotAllowed) {
          pausedCursorRef.current = { ...currentCursorRef.current };
          setSessionState('PAUSED');
          setErrorMessage('Trình duyệt tạm chặn âm thanh. Bấm vào nhân viên tư vấn để tiếp tục.');
        } else {
          setSessionState('ERROR');
          setErrorMessage('Tạm thời chưa phát được giọng đọc tiếng Việt.');
        }
      }
    },
    [syncStepVisuals]
  );

  const startBoothSession = useCallback(
    (booth: V28BoothPlacementView) => {
      // Unlock Web Audio AudioContext synchronously during user gesture before async Supertonic fetch
      npcWebAudioPlayer.unlockFromUserGesture();
      prewarmDirectTts();
      const prevBoothId = activeBoothRef.current?.boothId;
      if (prevBoothId && prevBoothId !== booth.boothId) {
        coordinatorRef.current.lockManager.resetBooth(prevBoothId);
      }
      sessionNonceRef.current += 1;
      const runNonce = sessionNonceRef.current;
      cleanupActiveAudio(false);

      const steps = buildBoothConsultationSteps(booth);
      activeBoothRef.current = booth;
      stepsRef.current = steps;
      audioPackRef.current = null;
      pausedCursorRef.current = null;
      currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };

      setActiveBoothId(booth.boothId);
      setActiveProductId(null);
      setConsultationMode('booth');
      setErrorMessage(null);
      setHighlightedProduct(null);
      setSessionState('LOADING');
      setAnimState('greet');

      // Phase 1.7: 2,000ms Audio TTS deadline + Booth-Level DIRECT_TTS lock
      void coordinatorRef.current.start({
        boothId: booth.boothId,
        runAudioTts: async (audioCtx) => {
          prepareOpeningDirectChunk(steps, audioCtx.audioPlaybackSignal);
          const pack = await v28Api.getBoothAudio(booth.boothId);
          if (!isMountedRef.current || sessionNonceRef.current !== runNonce || audioCtx.sessionSignal.aborted) {
            return;
          }
          // Phase 1.7.4 Case B: If booth audio is missing, stale, or mixed-voice, lock DIRECT_TTS immediately
          if (pack.voiceReadiness && !pack.voiceReadiness.ready) {
            coordinatorRef.current.lockManager.lockBoothToDirectTts(booth.boothId, 'readiness_not_consistent');
            return;
          }
          audioPackRef.current = pack;
          if (!audioCtx.isAudioAuthorized()) {
            return;
          }
          await playFromCursor(booth, steps, pack, { stepIndex: 0, chunkIndex: 0, offsetSec: 0 }, runNonce, {
            hybridAudioCtx: audioCtx,
          });
        },
        runDirectTts: async (directCtx) => {
          if (!isMountedRef.current || sessionNonceRef.current !== runNonce || directCtx.sessionSignal.aborted) {
            return;
          }
          await playFromCursor(booth, steps, null, { stepIndex: 0, chunkIndex: 0, offsetSec: 0 }, runNonce, {
            directTtsOnly: true,
            directTtsCtx: directCtx,
          });
        },
      });
    },
    [cleanupActiveAudio, playFromCursor, prepareOpeningDirectChunk, prewarmDirectTts]
  );

  const pauseSession = useCallback(() => {
    const curState = sessionStateRef.current;
    if (curState !== 'SPEAKING' && curState !== 'LOADING') return;
    sessionNonceRef.current += 1;
    coordinatorRef.current.pause();
    const exactOffset = cleanupActiveAudio(true);
    pausedCursorRef.current = {
      stepIndex: currentCursorRef.current.stepIndex,
      chunkIndex: currentCursorRef.current.chunkIndex,
      offsetSec: exactOffset,
    };
    setSessionState('PAUSED');
    setAnimState('idle');
    // Keep highlightedProduct while paused so visitor can still see which product was being discussed!
  }, [cleanupActiveAudio]);

  const resumeSession = useCallback(() => {
    npcWebAudioPlayer.unlockFromUserGesture();
    const booth = activeBoothRef.current;
    const steps = stepsRef.current;
    if (!booth || steps.length === 0) return;
    sessionNonceRef.current += 1;
    const runNonce = sessionNonceRef.current;
    cleanupActiveAudio(false);

    const cursor = pausedCursorRef.current ?? currentCursorRef.current;
    pausedCursorRef.current = null;
    setErrorMessage(null);
    setSessionState('LOADING');
    const isProductMode = consultationModeRef.current === 'product';
    const lockedDirect = coordinatorRef.current.lockManager.getBoothMode(booth.boothId) === 'DIRECT_TTS';
    void playFromCursor(booth, steps, lockedDirect ? null : audioPackRef.current, cursor, runNonce, {
      skipBackendSynth: isProductMode || lockedDirect,
      directTtsOnly: lockedDirect,
    });
  }, [cleanupActiveAudio, playFromCursor]);

  const handleNpcClick = useCallback(
    (booth: V28BoothPlacementView) => {
      const isSameBooth = activeBoothRef.current?.boothId === booth.boothId;
      const curState = sessionStateRef.current;

      if (!isSameBooth) {
        startBoothSession(booth);
        return;
      }

      if (curState === 'SPEAKING' || curState === 'LOADING') {
        pauseSession();
      } else if (curState === 'PAUSED') {
        resumeSession();
      } else {
        // IDLE, COMPLETED, ERROR -> start from beginning
        startBoothSession(booth);
      }
    },
    [pauseSession, resumeSession, startBoothSession]
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    npcWebAudioPlayer.setMuted(nextMuted);
    if (audioElRef.current) {
      audioElRef.current.muted = nextMuted;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sessionNonceRef.current += 1;
      cleanupActiveAudio(false);
    };
  }, [cleanupActiveAudio]);

  const startProductConsultation = useCallback(
    (
      booth: V28BoothPlacementView,
      product: V28Product,
      slotId: string,
      options?: { forceReplay?: boolean }
    ) => {
      // Unlock Web Audio AudioContext synchronously inside the product click/touch gesture
      npcWebAudioPlayer.unlockFromUserGesture();

      const steps = buildProductConsultationSteps(booth, product, slotId);
      const firstStep = steps[0];
      const resolvedProduct = firstStep?.product ?? product;
      const resolvedSlotId = firstStep?.slotKey ?? slotId;

      const isSameProduct =
        consultationModeRef.current === 'product' &&
        activeBoothRef.current?.boothId === booth.boothId &&
        activeProductIdRef.current === resolvedProduct.id;

      // Clicking the same product again: resume if paused, ignore duplicate click if already playing/loading
      if (isSameProduct && !options?.forceReplay) {
        if (sessionStateRef.current === 'PAUSED') {
          resumeSession();
          return;
        }
        if (sessionStateRef.current === 'SPEAKING' || sessionStateRef.current === 'LOADING') {
          return;
        }
      }

      // Explicit replay with existing valid cached audioPack -> replay from 0 with ZERO redundant API/TTS calls!
      // Always honor Booth-Level DIRECT_TTS lock so replay NEVER reverts to Gemini/Supertonic!
      const lockedDirect = coordinatorRef.current.lockManager.getBoothMode(booth.boothId) === 'DIRECT_TTS';
      if (isSameProduct && options?.forceReplay && (lockedDirect || audioPackRef.current) && stepsRef.current.length > 0) {
        sessionNonceRef.current += 1;
        const replayNonce = sessionNonceRef.current;
        cleanupActiveAudio(false);
        pausedCursorRef.current = null;
        currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };
        setErrorMessage(null);
        setSessionState('LOADING');
        setAnimState('point');
        void playFromCursor(
          booth,
          stepsRef.current,
          lockedDirect ? null : audioPackRef.current,
          { stepIndex: 0, chunkIndex: 0, offsetSec: 0 },
          replayNonce,
          {
            skipBackendSynth: true,
            directTtsOnly: lockedDirect,
          }
        );
        return;
      }

      const prevBoothId = activeBoothRef.current?.boothId;
      if (prevBoothId && prevBoothId !== booth.boothId) {
        coordinatorRef.current.lockManager.resetBooth(prevBoothId);
      }
      prewarmDirectTts();

      sessionNonceRef.current += 1;
      const runNonce = sessionNonceRef.current;
      cleanupActiveAudio(false);

      activeBoothRef.current = booth;
      activeProductIdRef.current = resolvedProduct.id;
      stepsRef.current = steps;
      audioPackRef.current = null;
      pausedCursorRef.current = null;
      currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };

      setActiveBoothId(booth.boothId);
      setActiveProductId(resolvedProduct.id);
      setConsultationMode('product');
      setErrorMessage(null);
      setHighlightedProduct({
        boothId: booth.boothId,
        slotId,
        productId: product.id,
        productName: product.name,
      });
      setCurrentSubtitle(firstStep?.naturalSpeechText || firstStep?.fallbackText || null);
      setSessionState('LOADING');
      setAnimState('point');

      const fetchController = new AbortController();
      abortControllerRef.current = fetchController;

      void coordinatorRef.current.start({
        boothId: booth.boothId,
        runAudioTts: async (audioCtx) => {
          prepareOpeningDirectChunk(steps, audioCtx.audioPlaybackSignal);
          const res = await v28Api
            .getProductConsultation(booth.boothId, resolvedProduct.id, fetchController.signal);
          // Strict stale-response guard: if user clicked another product or closed, drop immediately!
          if (!isMountedRef.current || sessionNonceRef.current !== runNonce || fetchController.signal.aborted) {
            return;
          }
          const syncedScript = (res.script || '').trim();
          const effectiveSteps: BoothConsultationStep[] = firstStep
            ? [
              {
                ...firstStep,
                naturalSpeechText: syncedScript || firstStep.naturalSpeechText,
                fallbackText: syncedScript || firstStep.fallbackText,
              },
            ]
            : steps;
          stepsRef.current = effectiveSteps;
          if (syncedScript) {
            setCurrentSubtitle(syncedScript);
          }

          let syntheticPack: V28BoothAudioPack | null = null;
          if (res.audio && isRealBackendSpeechClip(res.audio)) {
            const alignedClip = {
              ...res.audio,
              entityType: 'product' as const,
              slotKey: resolvedSlotId,
              transcript: syncedScript || res.audio.transcript,
              contentHash: (res.audio as { contentHash?: string }).contentHash || res.audio.audioId,
              language: (res.audio as { language?: string }).language || 'vi-VN',
            };
            syntheticPack = {
              boothId: booth.boothId,
              storageDriver: res.source || 'cached',
              liveGeminiTtsEnabled: true,
              clips: [alignedClip],
              cacheHits: res.cacheHit ? 1 : 0,
              generatedCount: res.cacheHit ? 0 : 1,
            };
          }
          audioPackRef.current = syntheticPack;
          if (!audioCtx.isAudioAuthorized()) {
            return;
          }
          await playFromCursor(
            booth,
            effectiveSteps,
            syntheticPack,
            { stepIndex: 0, chunkIndex: 0, offsetSec: 0 },
            runNonce,
            {
              skipBackendSynth: true,
              allowLegacyFallback: res.legacyFallbackEnabled !== false,
              hybridAudioCtx: audioCtx,
            }
          );
        },
        runDirectTts: async (directCtx) => {
          if (!isMountedRef.current || sessionNonceRef.current !== runNonce || directCtx.sessionSignal.aborted) {
            return;
          }
          await playFromCursor(
            booth,
            steps,
            null,
            { stepIndex: 0, chunkIndex: 0, offsetSec: 0 },
            runNonce,
            {
              skipBackendSynth: true,
              directTtsOnly: true,
              directTtsCtx: directCtx,
            }
          );
        },
      });
    },
    [cleanupActiveAudio, playFromCursor, prepareOpeningDirectChunk, prewarmDirectTts, resumeSession]
  );

  return {
    sessionState,
    consultationMode,
    activeBoothId,
    activeProductId: highlightedProduct?.productId ?? null,
    animState,
    highlightedProduct,
    currentSubtitle: null,
    isMuted,
    errorMessage,
    handleNpcClick,
    startProductConsultation,
    pauseSession,
    stopPlaybackOnly,
    stopSession,
    toggleMute,
  };
}
