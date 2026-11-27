export type PredictivePriority = 0 | 1 | 2 | 3;

export const PREDICTIVE_TTS_STORAGE_KEY = 'v28_predictive_tts';
const GOVERNOR_COOLDOWN_MS = 4_000;
const FRAME_TIME_SPIKE_THRESHOLD_MS = 45; // ~22 FPS threshold with hysteresis

export interface PredictivePreSynthConfigInput {
  search?: string;
  storedValue?: string | null;
  windowConfigValue?: boolean | string | null;
}

/**
 * Feature flag for Phase 2 Predictive Audio Pre-synthesis.
 * Defaults to `true`. Can be disabled instantly via `?predictiveTts=off`,
 * `localStorage.setItem('v28_predictive_tts', 'off')`, or `window.__V28_CONFIG__.predictiveTts = false`.
 */
export function resolvePredictivePreSynthEnabled(input?: PredictivePreSynthConfigInput): boolean {
  const parseFlag = (raw: unknown): boolean | null => {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw !== 'string') return null;
    const v = raw.trim().toLowerCase();
    if (v === 'off' || v === 'false' || v === '0' || v === 'no') return false;
    if (v === 'on' || v === 'true' || v === '1' || v === 'yes') return true;
    return null;
  };

  const searchStr =
    input?.search !== undefined
      ? input.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (searchStr) {
    try {
      const fromUrl = parseFlag(new URLSearchParams(searchStr).get('predictiveTts'));
      if (fromUrl !== null) return fromUrl;
    } catch {
      // ignore malformed query string
    }
  }

  let stored = input?.storedValue;
  if (stored === undefined && typeof localStorage !== 'undefined') {
    try {
      stored = localStorage.getItem(PREDICTIVE_TTS_STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  const fromStorage = parseFlag(stored);
  if (fromStorage !== null) return fromStorage;

  const winVal =
    input?.windowConfigValue !== undefined
      ? input.windowConfigValue
      : typeof window !== 'undefined'
        ? (window as unknown as { __V28_CONFIG__?: { predictiveTts?: boolean | string } }).__V28_CONFIG__
            ?.predictiveTts
        : null;
  const fromWin = parseFlag(winVal);
  if (fromWin !== null) return fromWin;

  return true;
}

export interface GovernorEnvSnapshot {
  visibilityState?: string;
  onLine?: boolean;
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export interface GovernorDecision {
  allowed: boolean;
  reason: string;
  maxBackgroundProducts: number;
}

/**
 * Adaptive Resource Governor:
 * Protects 3D frame rate, battery, and foreground TTS by pausing new background
 * jobs under CPU/frame pressure, user camera/avatar movement, hidden tabs, or constrained devices.
 */
export class PredictiveResourceGovernor {
  private userMoving = false;
  private cooldownUntilMs = 0;
  private recentFrameDeltaMs = 16.7;
  private foregroundPendingCount = 0;

  public setUserMoving(moving: boolean, nowMs = Date.now()): void {
    this.userMoving = moving;
    if (moving) {
      this.cooldownUntilMs = Math.max(this.cooldownUntilMs, nowMs + 800);
    }
  }

  public recordFrameDeltaMs(deltaMs: number, nowMs = Date.now()): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.recentFrameDeltaMs = deltaMs;
    if (deltaMs > FRAME_TIME_SPIKE_THRESHOLD_MS) {
      this.cooldownUntilMs = Math.max(this.cooldownUntilMs, nowMs + GOVERNOR_COOLDOWN_MS);
    }
  }

  public recordForegroundBlocked(blockedMs: number, nowMs = Date.now()): void {
    if (blockedMs > 500) {
      this.cooldownUntilMs = Math.max(this.cooldownUntilMs, nowMs + 6_000);
    }
  }

  public setForegroundPendingCount(count: number): void {
    this.foregroundPendingCount = Math.max(0, count);
  }

  public canRunBackgroundJob(env?: GovernorEnvSnapshot, nowMs = Date.now()): GovernorDecision {
    const vis =
      env?.visibilityState ??
      (typeof document !== 'undefined' ? document.visibilityState : 'visible');
    if (vis !== 'visible') {
      return { allowed: false, reason: 'tab_hidden', maxBackgroundProducts: 0 };
    }

    const onLine =
      env?.onLine ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);
    if (onLine === false) {
      return { allowed: false, reason: 'offline', maxBackgroundProducts: 0 };
    }

    const navConn =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
            .connection
        : undefined;
    const saveData = env?.saveData ?? Boolean(navConn?.saveData);
    if (saveData) {
      return { allowed: false, reason: 'save_data', maxBackgroundProducts: 0 };
    }

    const effectiveType = (env?.effectiveType ?? navConn?.effectiveType ?? '').toLowerCase();
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
      return { allowed: false, reason: `slow_network_${effectiveType}`, maxBackgroundProducts: 0 };
    }

    const rawMem =
      env?.deviceMemory ??
      (typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
        : undefined);
    if (typeof rawMem === 'number' && rawMem <= 2) {
      return { allowed: false, reason: 'low_device_memory', maxBackgroundProducts: 0 };
    }

    const cores =
      env?.hardwareConcurrency ??
      (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);
    if (typeof cores === 'number' && cores > 0 && cores < 2) {
      return { allowed: false, reason: 'low_cpu_cores', maxBackgroundProducts: 0 };
    }

    if (this.foregroundPendingCount > 0) {
      return { allowed: false, reason: 'foreground_active', maxBackgroundProducts: 0 };
    }

    if (this.userMoving) {
      return { allowed: false, reason: 'user_moving', maxBackgroundProducts: 0 };
    }

    if (nowMs < this.cooldownUntilMs) {
      return { allowed: false, reason: 'frame_spike_cooldown', maxBackgroundProducts: 0 };
    }

    // Conservative cap when deviceMemory is unavailable in Safari/Firefox
    const isDesktopCapable = typeof rawMem === 'number' ? rawMem >= 8 && (cores ?? 4) >= 4 : false;
    return {
      allowed: true,
      reason: 'ok',
      maxBackgroundProducts: isDesktopCapable ? 4 : 2,
    };
  }

  public resetForTests(): void {
    this.userMoving = false;
    this.cooldownUntilMs = 0;
    this.recentFrameDeltaMs = 16.7;
    this.foregroundPendingCount = 0;
  }
}

export interface PredictiveTtsTelemetrySnapshot {
  enabled: boolean;
  backgroundQueued: number;
  backgroundStarted: number;
  backgroundCompleted: number;
  backgroundCancelled: number;
  backgroundFailed: number;
  priorityPromotions: number;
  singleFlightReuses: number;
  duplicatePrevented: number;
  predictionHits: number;
  predictionMisses: number;
  governorBlocked: number;
  lastQueueWaitMs: number | null;
  lastForegroundBlockedMs: number | null;
  lastSynthMs: number | null;
  lastTriggerSource: string | null;
}

class PredictiveTelemetryTracker {
  private stats: PredictiveTtsTelemetrySnapshot = {
    enabled: true,
    backgroundQueued: 0,
    backgroundStarted: 0,
    backgroundCompleted: 0,
    backgroundCancelled: 0,
    backgroundFailed: 0,
    priorityPromotions: 0,
    singleFlightReuses: 0,
    duplicatePrevented: 0,
    predictionHits: 0,
    predictionMisses: 0,
    governorBlocked: 0,
    lastQueueWaitMs: null,
    lastForegroundBlockedMs: null,
    lastSynthMs: null,
    lastTriggerSource: null,
  };

  public record(patch: Partial<PredictiveTtsTelemetrySnapshot>): void {
    Object.assign(this.stats, patch);
    this.publishDev();
  }

  public inc(key: keyof Pick<
    PredictiveTtsTelemetrySnapshot,
    | 'backgroundQueued'
    | 'backgroundStarted'
    | 'backgroundCompleted'
    | 'backgroundCancelled'
    | 'backgroundFailed'
    | 'priorityPromotions'
    | 'singleFlightReuses'
    | 'duplicatePrevented'
    | 'predictionHits'
    | 'predictionMisses'
    | 'governorBlocked'
  >): void {
    this.stats[key] += 1;
    this.publishDev();
  }

  public getSnapshot(): PredictiveTtsTelemetrySnapshot {
    return { ...this.stats, enabled: resolvePredictivePreSynthEnabled() };
  }

  public reset(): void {
    this.stats = {
      enabled: resolvePredictivePreSynthEnabled(),
      backgroundQueued: 0,
      backgroundStarted: 0,
      backgroundCompleted: 0,
      backgroundCancelled: 0,
      backgroundFailed: 0,
      priorityPromotions: 0,
      singleFlightReuses: 0,
      duplicatePrevented: 0,
      predictionHits: 0,
      predictionMisses: 0,
      governorBlocked: 0,
      lastQueueWaitMs: null,
      lastForegroundBlockedMs: null,
      lastSynthMs: null,
      lastTriggerSource: null,
    };
    this.publishDev();
  }

  private publishDev(): void {
    if (import.meta.env?.DEV && typeof window !== 'undefined') {
      (window as unknown as { __V28_PREDICTIVE_TTS_STATS__?: PredictiveTtsTelemetrySnapshot }).__V28_PREDICTIVE_TTS_STATS__ =
        this.getSnapshot();
    }
  }
}

export const predictiveResourceGovernor = new PredictiveResourceGovernor();
export const predictiveTtsTelemetry = new PredictiveTelemetryTracker();
