import { useCallback, useEffect, useRef, useState } from 'react';
import {
  v28Api,
  type V28BoothAudioPack,
  type V28BoothPlacementView,
} from '../services/v28Api';
import {
  buildPiperStepPlanFromDisplayText,
  piperBrowserTts,
} from '../services/hybridTtsAdapter';
import { resolveNpcTtsMode } from '../services/npcTtsConfig';
import { npcHybridTtsEngine } from '../services/npcHybridTtsEngine';
import { npcWebAudioPlayer } from '../services/npcWebAudioPlayer';
import {
  buildBoothConsultationSteps,
  type BoothConsultationStep,
} from '../services/npcConsultationScript';
import { isRealBackendSpeechClip } from '../components/v28/V28NpcConsultantPanel';
import type { V28NpcAnimState } from '../scene/v28/DynamicBoothNpc3D';
import { API_BASE_URL } from '../config/apiConfig';

export type NpcSessionState = 'IDLE' | 'LOADING' | 'SPEAKING' | 'PAUSED' | 'COMPLETED' | 'ERROR';

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
  activeBoothId: string | null;
  animState: V28NpcAnimState;
  highlightedProduct: HighlightedBoothProduct | null;
  isMuted: boolean;
  errorMessage: string | null;
  handleNpcClick: (booth: V28BoothPlacementView) => void;
  pauseSession: () => void;
  stopSession: () => void;
  toggleMute: () => void;
}

/**
 * Headless NPC consultation state machine & audio lifecycle manager (Phase 1.1–1.4).
 *
 * State machine:
 *   IDLE -> LOADING -> SPEAKING -> PAUSED -> SPEAKING -> COMPLETED (and ERROR)
 *
 * Strictly preserves:
 * - Web Audio API Hybrid TTS (`npcWebAudioPlayer` + `npcHybridTtsEngine` + 85 WAV manifest)
 * - Cross-step off-main-thread pre-decoding
 * - HTMLAudioElement fallback & Legacy Piper WASM (`?npcTtsMode=legacy`)
 * - 440Hz `:local-fallback` chime guard (`isRealBackendSpeechClip`)
 * - Exact pause/resume cursor (`stepIndex`, `chunkIndex`, `offsetSec`)
 * - Synchronized 3D product highlight (`boothId`, `slotId`, `productId`)
 */
export function useNpcConsultationSession(): UseNpcConsultationSessionResult {
  const [sessionState, setSessionState] = useState<NpcSessionState>('IDLE');
  const [activeBoothId, setActiveBoothId] = useState<string | null>(null);
  const [animState, setAnimState] = useState<V28NpcAnimState>('idle');
  const [highlightedProduct, setHighlightedProduct] = useState<HighlightedBoothProduct | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionStateRef = useRef<NpcSessionState>('IDLE');
  sessionStateRef.current = sessionState;
  const activeBoothRef = useRef<V28BoothPlacementView | null>(null);
  const stepsRef = useRef<BoothConsultationStep[]>([]);
  const audioPackRef = useRef<V28BoothAudioPack | null>(null);
  const isMutedRef = useRef<boolean>(false);
  isMutedRef.current = isMuted;

  const isMountedRef = useRef<boolean>(true);
  const sessionNonceRef = useRef<number>(0);
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

  const stopSession = useCallback(() => {
    sessionNonceRef.current += 1;
    cleanupActiveAudio(false);
    activeBoothRef.current = null;
    stepsRef.current = [];
    audioPackRef.current = null;
    pausedCursorRef.current = null;
    currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };
    if (isMountedRef.current) {
      setActiveBoothId(null);
      setSessionState('IDLE');
      setAnimState('idle');
      setHighlightedProduct(null);
      setErrorMessage(null);
    }
    piperBrowserTts.scheduleIdleRelease(90_000);
  }, [cleanupActiveAudio]);

  const syncStepVisuals = useCallback((booth: V28BoothPlacementView, step: BoothConsultationStep) => {
    if (!isMountedRef.current) return;
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
  }, []);

  const playFromCursor = useCallback(
    async (
      booth: V28BoothPlacementView,
      steps: BoothConsultationStep[],
      pack: V28BoothAudioPack | null,
      startCursor: PlaybackCursor,
      runNonce: number
    ) => {
      const isStale = () => !isMountedRef.current || sessionNonceRef.current !== runNonce;

      const controller = new AbortController();
      abortControllerRef.current = controller;

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
            audio.onpause = null;
            audio.onended = null;
            audio.onerror = null;
          };

          audio.onplay = () => {
            if (!controller.signal.aborted && !isStale()) {
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

      try {
        for (let stepIdx = startCursor.stepIndex; stepIdx < steps.length; stepIdx += 1) {
          if (controller.signal.aborted || isStale()) return;
          const step = steps[stepIdx];
          if (!step) continue;

          syncStepVisuals(booth, step);

          const clip = Array.isArray(pack?.clips)
            ? pack.clips.find((c) => c.slotKey === step.slotKey) || null
            : null;

          // Mode 1: Real pre-generated Gemini TTS WAV cached on backend (excludes `:local-fallback` 440Hz chimes)
          if (pack?.liveGeminiTtsEnabled && isRealBackendSpeechClip(clip) && clip) {
            currentCursorRef.current = { stepIndex: stepIdx, chunkIndex: 0, offsetSec: 0 };
            await new Promise<void>((resolve, reject) => {
              const audio = new Audio(`${API_BASE_URL}${clip.audioUrl}`);
              audio.crossOrigin = 'anonymous';
              audio.preload = 'auto';
              audio.muted = isMutedRef.current;
              audioElRef.current = audio;

              audio.onplay = () => {
                if (!controller.signal.aborted && !isStale()) setSessionState('SPEAKING');
              };
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error('Backend audio playback error'));
              controller.signal.addEventListener('abort', () => { audio.pause(); resolve(); }, { once: true });

              const resumeOffset = stepIdx === startCursor.stepIndex ? startCursor.offsetSec : 0;
              if (resumeOffset > 0.05) {
                audio.addEventListener('loadedmetadata', () => {
                  try { audio.currentTime = resumeOffset; } catch { }
                  audio.play().catch(reject);
                }, { once: true });
                audio.load();
              } else {
                audio.play().catch(reject);
              }
            });
            continue;
          }

          const speechText = clip?.transcript || step.fallbackText;
          if (!speechText) continue;

          const { chunks } = buildPiperStepPlanFromDisplayText(speechText);
          const firstChunkIdx = stepIdx === startCursor.stepIndex ? startCursor.chunkIndex : 0;

          for (let chunkIdx = firstChunkIdx; chunkIdx < chunks.length; chunkIdx += 1) {
            if (controller.signal.aborted || isStale()) return;

            const resumeOffsetSec =
              stepIdx === startCursor.stepIndex && chunkIdx === startCursor.chunkIndex
                ? startCursor.offsetSec
                : 0;
            currentCursorRef.current = { stepIndex: stepIdx, chunkIndex: chunkIdx, offsetSec: resumeOffsetSec };

            const scheduleDeferredPrefetch = () => {
              if (controller.signal.aborted || isStale()) return;
              const prefetchNext = async (nextText: string) => {
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

              if (chunkIdx + 1 < chunks.length) {
                void prefetchNext(chunks[chunkIdx + 1]);
              } else if (stepIdx + 1 < steps.length) {
                const nextStep = steps[stepIdx + 1];
                const nextClip = Array.isArray(pack?.clips)
                  ? pack.clips.find((c) => c.slotKey === nextStep.slotKey) || null
                  : null;
                const nextSpeechText = nextClip?.transcript || nextStep.fallbackText;
                const nextFirstChunk = buildPiperStepPlanFromDisplayText(nextSpeechText).chunks[0];
                if (nextFirstChunk) {
                  void prefetchNext(nextFirstChunk);
                }
              }
            };

            // Hybrid fast-path (Web Audio API real-time OS audio thread + cross-step pre-decode)
            if (ttsMode === 'hybrid') {
              const pregen = await npcHybridTtsEngine.tryFetchPregenAudio(chunks[chunkIdx], controller.signal);
              if (controller.signal.aborted || isStale()) return;
              if (pregen) {
                try {
                  if (npcWebAudioPlayer.isSupported()) {
                    const handled = await npcWebAudioPlayer.playBlob(pregen.hash, pregen.blob, {
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
            await playHtmlAudio(result.blob, resumeOffsetSec, scheduleDeferredPrefetch);
          }
        }

        if (!controller.signal.aborted && !isStale()) {
          pausedCursorRef.current = null;
          currentCursorRef.current = { stepIndex: 0, chunkIndex: 0, offsetSec: 0 };
          setSessionState('COMPLETED');
          setAnimState('idle');
          setHighlightedProduct(null);
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
      setErrorMessage(null);
      setHighlightedProduct(null);
      setSessionState('LOADING');
      setAnimState('greet');

      const ttsMode = resolveNpcTtsMode();
      if (ttsMode === 'hybrid') {
        void playFromCursor(booth, steps, null, { stepIndex: 0, chunkIndex: 0, offsetSec: 0 }, runNonce);
        return;
      }

      // Legacy mode: check backend audio metadata first, then fall back cleanly to Piper WASM
      v28Api
        .getBoothAudio(booth.boothId)
        .then((pack) => {
          if (!isMountedRef.current || sessionNonceRef.current !== runNonce) return;
          audioPackRef.current = pack;
          void playFromCursor(booth, steps, pack, { stepIndex: 0, chunkIndex: 0, offsetSec: 0 }, runNonce);
        })
        .catch(() => {
          if (!isMountedRef.current || sessionNonceRef.current !== runNonce) return;
          audioPackRef.current = null;
          void playFromCursor(booth, steps, null, { stepIndex: 0, chunkIndex: 0, offsetSec: 0 }, runNonce);
        });
    },
    [cleanupActiveAudio, playFromCursor]
  );

  const pauseSession = useCallback(() => {
    const curState = sessionStateRef.current;
    if (curState !== 'SPEAKING' && curState !== 'LOADING') return;
    sessionNonceRef.current += 1;
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
    void playFromCursor(booth, steps, audioPackRef.current, cursor, runNonce);
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

  return {
    sessionState,
    activeBoothId,
    animState,
    highlightedProduct,
    isMuted,
    errorMessage,
    handleNpcClick,
    pauseSession,
    stopSession,
    toggleMute,
  };
}
