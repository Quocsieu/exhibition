export const AUDIO_TTS_START_TIMEOUT_MS = 2000;

export type HybridPlaybackState =
  | 'IDLE'
  | 'WAITING_AUDIO'
  | 'AUDIO_PLAYING'
  | 'DIRECT_TTS_PLAYING'
  | 'PAUSED'
  | 'STOPPED'
  | 'ERROR';

export type BoothFallbackMode = 'AUDIO_TTS' | 'DIRECT_TTS';

export type BoothLockState = 'UNLOCKED' | 'AUDIO_TTS_LOCKED' | 'DIRECT_TTS_LOCKED';

export type FallbackReason =
  | 'timeout_2000ms'
  | 'audio_error'
  | 'booth_locked'
  | 'readiness_not_consistent'
  | 'none';

export interface LockedAudioVoiceConfig {
  engine: 'backend-audio-tts';
  provider: string;
  modelId: string;
  voiceId: string;
  voiceSignature: string;
}

export interface HybridPlaybackMetrics {
  boothId: string;
  modeUsed: BoothFallbackMode;
  fallbackReason: FallbackReason;
  clickedAtMs: number;
  clickToPlayMs: number | null;
  fallbackTriggerMs: number | null;
  directTtsStartMs: number | null;
}

export interface LockedDirectVoiceConfig {
  engine: 'hybrid-piper';
  voiceId: 'vi_VN-vais1000-medium';
  voiceProfile: 'female_soft_fast';
  modelVersion: 'v2-soft-fast';
  lengthScale: number;
  noiseScale: number;
  noiseW: number;
  pitchSemitones: number;
}

export const DIRECT_TTS_LOCKED_VOICE: LockedDirectVoiceConfig = {
  engine: 'hybrid-piper',
  voiceId: 'vi_VN-vais1000-medium',
  voiceProfile: 'female_soft_fast',
  modelVersion: 'v2-soft-fast',
  lengthScale: 0.87,
  noiseScale: 0.45,
  noiseW: 0.65,
  pitchSemitones: 0,
};

export interface BoothFallbackLockEntry {
  boothId: string;
  lockState: BoothLockState;
  mode: BoothFallbackMode;
  reason: FallbackReason;
  lockedAtMs: number;
  voiceConfig: LockedDirectVoiceConfig;
  audioVoiceConfig?: LockedAudioVoiceConfig;
}

/**
 * Per-visitor, in-memory Two-Way Booth-Level Voice Lock (Phase 1.7.4).
 *
 * Guarantees (ONE BOOTH — ONE VOICE):
 * - 3 states: UNLOCKED -> AUDIO_TTS_LOCKED | DIRECT_TTS_LOCKED.
 * - Isolated per controller instance (visitor A never affects visitor B).
 * - Never persisted to global database.
 * - Once AUDIO_TTS_LOCKED is established, NEVER silently falls back to DIRECT_TTS or another voice.
 * - Once DIRECT_TTS_LOCKED is established, NEVER calls Gemini/Vbee/Edge/Supertonic.
 * - Resets to UNLOCKED ONLY when leaving the booth or switching to another booth.
 */
export class BoothPlaybackLockManager {
  private readonly locks = new Map<string, BoothFallbackLockEntry>();
  private readonly now: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.now = nowFn;
  }

  public getLockState(boothId: string): BoothLockState {
    if (!boothId) return 'UNLOCKED';
    return this.locks.get(boothId)?.lockState ?? 'UNLOCKED';
  }

  public getBoothMode(boothId: string): BoothFallbackMode {
    if (!boothId) return 'AUDIO_TTS';
    return this.locks.get(boothId)?.mode ?? 'AUDIO_TTS';
  }

  public getLockEntry(boothId: string): BoothFallbackLockEntry | null {
    if (!boothId) return null;
    return this.locks.get(boothId) ?? null;
  }

  public getLockedVoiceConfig(boothId: string): LockedDirectVoiceConfig | null {
    const entry = this.getLockEntry(boothId);
    return entry?.lockState === 'DIRECT_TTS_LOCKED' ? entry.voiceConfig : null;
  }

  public getLockedAudioVoiceConfig(boothId: string): LockedAudioVoiceConfig | null {
    const entry = this.getLockEntry(boothId);
    return entry?.lockState === 'AUDIO_TTS_LOCKED' ? entry.audioVoiceConfig ?? null : null;
  }

  public matchesLockedAudioSignature(boothId: string, voiceSignature: string): boolean {
    const locked = this.getLockedAudioVoiceConfig(boothId);
    if (!locked) return true; // UNLOCKED allows initial selection
    return locked.voiceSignature === voiceSignature;
  }

  public lockBoothToAudioTts(boothId: string, audioVoice: LockedAudioVoiceConfig): boolean {
    if (!boothId) return false;
    const existing = this.locks.get(boothId);
    if (existing?.lockState === 'DIRECT_TTS_LOCKED') return false;
    if (existing?.lockState === 'AUDIO_TTS_LOCKED') return true;
    this.locks.set(boothId, {
      boothId,
      lockState: 'AUDIO_TTS_LOCKED',
      mode: 'AUDIO_TTS',
      reason: 'none',
      lockedAtMs: this.now(),
      voiceConfig: { ...DIRECT_TTS_LOCKED_VOICE },
      audioVoiceConfig: { ...audioVoice },
    });
    return true;
  }

  public lockBoothToDirectTts(
    boothId: string,
    reason: FallbackReason = 'timeout_2000ms',
    voiceConfig: LockedDirectVoiceConfig = DIRECT_TTS_LOCKED_VOICE
  ): boolean {
    if (!boothId) return false;
    const existing = this.locks.get(boothId);
    // Strict ONE BOOTH - ONE VOICE: never overwrite an already locked AUDIO_TTS_LOCKED session!
    if (existing?.lockState === 'AUDIO_TTS_LOCKED') return false;
    if (existing?.lockState === 'DIRECT_TTS_LOCKED') return true;
    this.locks.set(boothId, {
      boothId,
      lockState: 'DIRECT_TTS_LOCKED',
      mode: 'DIRECT_TTS',
      reason,
      lockedAtMs: this.now(),
      voiceConfig: { ...voiceConfig },
    });
    return true;
  }

  public resetBooth(boothId: string): void {
    if (!boothId) return;
    this.locks.delete(boothId);
  }

  public resetAll(): void {
    this.locks.clear();
  }
}

export interface AttemptAudioContext {
  sessionToken: number;
  audioAttemptToken: number;
  /** Signal aborted when the entire session/request is superseded or stopped. */
  sessionSignal: AbortSignal;
  /** Signal aborted when either session ends OR 2000ms fallback triggers. */
  audioPlaybackSignal: AbortSignal;
  /** Must be called ONLY when actual audio playback starts (e.g. WebAudio onStartPlayback / audio.onplaying). */
  markAudioStarted: (audioVoice?: LockedAudioVoiceConfig) => boolean;
  /** Returns true if this audio attempt is still authorized to start playing. */
  isAudioAuthorized: () => boolean;
}

export interface AttemptDirectTtsContext {
  sessionToken: number;
  sessionSignal: AbortSignal;
  reason: FallbackReason;
  /** Must be called when Direct TTS (Hybrid Piper) actually begins playing audio. */
  markDirectStarted: () => boolean;
  isSessionActive: () => boolean;
}

export interface HybridStartParams {
  boothId: string;
  timeoutMs?: number;
  runAudioTts: (ctx: AttemptAudioContext) => Promise<void>;
  runDirectTts: (ctx: AttemptDirectTtsContext) => Promise<void>;
  onStateChange?: (state: HybridPlaybackState, metrics: HybridPlaybackMetrics) => void;
  onFallbackTriggered?: (reason: FallbackReason, boothId: string, metrics: HybridPlaybackMetrics) => void;
}

/**
 * Coordinates Audio TTS vs Direct TTS (Hybrid Piper) with:
 * - Strict 2,000ms deadline measured from click time to ACTUAL audio playback start.
 * - Booth-level DIRECT_TTS lock on timeout or error.
 * - Generation tokens (`sessionToken` + `audioAttemptToken`) preventing stale callbacks
 *   or late Audio TTS responses from barging in over Direct TTS or newer clicks.
 */
export class HybridPlaybackCoordinator {
  public readonly lockManager: BoothPlaybackLockManager;
  private readonly now: () => number;

  private state: HybridPlaybackState = 'IDLE';
  private sessionToken = 0;
  private audioAttemptToken = 0;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSessionController: AbortController | null = null;
  private activeAudioPlaybackController: AbortController | null = null;
  private lastMetrics: HybridPlaybackMetrics | null = null;

  constructor(options?: {
    lockManager?: BoothPlaybackLockManager;
    nowFn?: () => number;
  }) {
    this.now = options?.nowFn ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.lockManager = options?.lockManager ?? new BoothPlaybackLockManager(this.now);
  }

  public getState(): HybridPlaybackState {
    return this.state;
  }

  public getSessionToken(): number {
    return this.sessionToken;
  }

  public getLastMetrics(): HybridPlaybackMetrics | null {
    return this.lastMetrics ? { ...this.lastMetrics } : null;
  }

  private clearTimer(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }

  public pause(): void {
    this.sessionToken += 1;
    this.audioAttemptToken += 1;
    this.clearTimer();
    this.activeAudioPlaybackController?.abort();
    this.activeSessionController?.abort();
    this.state = 'PAUSED';
  }

  /**
   * Stops active audio playback (e.g., when closing Product Modal) WITHOUT resetting
   * the Booth-Level Fallback Lock for the active booth.
   */
  public stopPlaybackOnly(): void {
    this.sessionToken += 1;
    this.audioAttemptToken += 1;
    this.clearTimer();
    this.activeAudioPlaybackController?.abort();
    this.activeSessionController?.abort();
    this.state = 'STOPPED';
  }

  public stop(options?: { resetBoothId?: string; resetAllLocks?: boolean }): void {
    this.stopPlaybackOnly();
    if (options?.resetAllLocks) {
      this.lockManager.resetAll();
    } else if (options?.resetBoothId) {
      this.lockManager.resetBooth(options.resetBoothId);
    }
  }

  public setError(): void {
    this.clearTimer();
    this.state = 'ERROR';
  }

  public async start(params: HybridStartParams): Promise<HybridPlaybackMetrics> {
    this.sessionToken += 1;
    this.audioAttemptToken += 1;
    const mySessionToken = this.sessionToken;
    const myAudioToken = this.audioAttemptToken;

    this.clearTimer();
    this.activeAudioPlaybackController?.abort();
    this.activeSessionController?.abort();

    const sessionController = new AbortController();
    const audioPlaybackController = new AbortController();
    this.activeSessionController = sessionController;
    this.activeAudioPlaybackController = audioPlaybackController;

    const clickedAtMs = this.now();
    const timeoutMs = params.timeoutMs ?? AUDIO_TTS_START_TIMEOUT_MS;
    const initialLockState = this.lockManager.getLockState(params.boothId);
    const initialMode = this.lockManager.getBoothMode(params.boothId);

    const metrics: HybridPlaybackMetrics = {
      boothId: params.boothId,
      modeUsed: initialMode,
      fallbackReason: initialMode === 'DIRECT_TTS' ? 'booth_locked' : 'none',
      clickedAtMs,
      clickToPlayMs: null,
      fallbackTriggerMs: null,
      directTtsStartMs: null,
    };
    this.lastMetrics = metrics;

    const isSessionActive = () =>
      this.sessionToken === mySessionToken && !sessionController.signal.aborted;

    const isAudioAuthorized = () =>
      isSessionActive() &&
      this.audioAttemptToken === myAudioToken &&
      !audioPlaybackController.signal.aborted;

    let fallbackStarted = false;
    let audioStarted = false;

    const triggerDirectTts = async (reason: FallbackReason) => {
      if (fallbackStarted || audioStarted || !isSessionActive()) return;
      // Strict ONE BOOTH - ONE VOICE: If AUDIO_TTS_LOCKED is already established, NEVER switch to DIRECT_TTS!
      if (this.lockManager.getLockState(params.boothId) === 'AUDIO_TTS_LOCKED') {
        this.clearTimer();
        this.state = 'ERROR';
        params.onStateChange?.('ERROR', { ...metrics });
        return;
      }
      fallbackStarted = true;
      this.clearTimer();
      // Invalidate audio token so late Audio TTS cannot barge in!
      this.audioAttemptToken += 1;
      audioPlaybackController.abort();

      if (reason !== 'booth_locked') {
        this.lockManager.lockBoothToDirectTts(params.boothId, reason);
      }

      metrics.modeUsed = 'DIRECT_TTS';
      metrics.fallbackReason = reason;
      metrics.fallbackTriggerMs = Math.max(0, Math.round(this.now() - clickedAtMs));
      this.lastMetrics = { ...metrics };
      params.onFallbackTriggered?.(reason, params.boothId, { ...metrics });

      try {
        await params.runDirectTts({
          sessionToken: mySessionToken,
          sessionSignal: sessionController.signal,
          reason,
          isSessionActive,
          markDirectStarted: () => {
            if (!isSessionActive()) return false;
            const elapsed = Math.max(0, Math.round(this.now() - clickedAtMs));
            metrics.directTtsStartMs = elapsed;
            if (metrics.clickToPlayMs === null) {
              metrics.clickToPlayMs = elapsed;
            }
            this.state = 'DIRECT_TTS_PLAYING';
            this.lastMetrics = { ...metrics };
            params.onStateChange?.('DIRECT_TTS_PLAYING', { ...metrics });
            return true;
          },
        });
      } catch {
        if (isSessionActive()) {
          this.state = 'ERROR';
          params.onStateChange?.('ERROR', { ...metrics });
        }
      }
    };

    // Booth already locked to DIRECT_TTS -> skip Audio TTS & 2000ms wait completely!
    if (initialLockState === 'DIRECT_TTS_LOCKED') {
      await triggerDirectTts('booth_locked');
      return { ...metrics };
    }

    this.state = 'WAITING_AUDIO';
    params.onStateChange?.('WAITING_AUDIO', { ...metrics });

    let resolveDone!: () => void;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const onTimeout = () => {
      if (!isAudioAuthorized() || audioStarted || fallbackStarted) {
        return;
      }
      if (this.lockManager.getLockState(params.boothId) === 'AUDIO_TTS_LOCKED') {
        this.state = 'ERROR';
        params.onStateChange?.('ERROR', { ...metrics });
        resolveDone();
        return;
      }
      void triggerDirectTts('timeout_2000ms').finally(resolveDone);
    };

    // Only arm 2000ms fallback timer when UNLOCKED (if AUDIO_TTS_LOCKED, never switch to DIRECT_TTS)
    if (initialLockState === 'UNLOCKED') {
      this.activeTimer = setTimeout(onTimeout, timeoutMs);
    }

    const markAudioStarted = (audioVoice?: LockedAudioVoiceConfig): boolean => {
      if (!isAudioAuthorized() || fallbackStarted) {
        return false;
      }
      if (this.lockManager.getLockState(params.boothId) === 'DIRECT_TTS_LOCKED') {
        return false;
      }
      if (!audioStarted) {
        audioStarted = true;
        this.clearTimer();
        if (audioVoice) {
          this.lockManager.lockBoothToAudioTts(params.boothId, audioVoice);
        }
        metrics.modeUsed = 'AUDIO_TTS';
        metrics.clickToPlayMs = Math.max(0, Math.round(this.now() - clickedAtMs));
        this.state = 'AUDIO_PLAYING';
        this.lastMetrics = { ...metrics };
        params.onStateChange?.('AUDIO_PLAYING', { ...metrics });
      }
      return true;
    };

    void params
      .runAudioTts({
        sessionToken: mySessionToken,
        audioAttemptToken: myAudioToken,
        sessionSignal: sessionController.signal,
        audioPlaybackSignal: audioPlaybackController.signal,
        markAudioStarted,
        isAudioAuthorized,
      })
      .then(() => {
        if (audioStarted || !isSessionActive() || fallbackStarted) {
          resolveDone();
          return;
        }
        // Audio TTS returned without ever starting playback -> immediate fallback!
        void triggerDirectTts('audio_error').finally(resolveDone);
      })
      .catch(() => {
        if (audioStarted || !isSessionActive() || fallbackStarted) {
          resolveDone();
          return;
        }
        void triggerDirectTts('audio_error').finally(resolveDone);
      });

    sessionController.signal.addEventListener(
      'abort',
      () => {
        this.clearTimer();
        resolveDone();
      },
      { once: true }
    );

    await donePromise;
    return { ...metrics };
  }
}
