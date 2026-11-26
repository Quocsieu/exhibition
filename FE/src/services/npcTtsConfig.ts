export type NpcTtsMode = 'legacy' | 'hybrid';
export type NpcTtsProvider = 'supertonic' | 'hybrid-piper' | 'legacy-piper';
export type SupertonicFemaleVoice = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

export const DEFAULT_NPC_TTS_MODE: NpcTtsMode = 'legacy';
export const DEFAULT_NPC_TTS_PROVIDER: NpcTtsProvider = 'supertonic';
export const DEFAULT_SUPERTONIC_VOICE: SupertonicFemaleVoice = 'F3';
export const DEFAULT_SUPERTONIC_SPEED = 1.32;
export const MIN_SUPERTONIC_SPEED = 0.85;
export const MAX_SUPERTONIC_SPEED = 1.8;
export const NPC_TTS_MODE_STORAGE_KEY = 'v28_npc_tts_mode';
export const NPC_TTS_PROVIDER_STORAGE_KEY = 'v28_npc_tts_provider';
export const SUPERTONIC_VOICE_STORAGE_KEY = 'v28_supertonic_voice';
export const SUPERTONIC_SPEED_STORAGE_KEY = 'v28_supertonic_speed';

declare global {
  interface Window {
    __V28_CONFIG__?: {
      npcTtsMode?: string;
      npcTtsProvider?: string;
      supertonicVoice?: string;
      supertonicSpeed?: number | string;
    };
  }
}

/**
 * Strictly validates an NPC TTS mode string.
 * Any unknown, empty, or malformed value returns `null` so callers safely fall back to `'legacy'`.
 */
export function normalizeNpcTtsMode(raw: unknown): NpcTtsMode | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'legacy' || cleaned === 'hybrid') {
    return cleaned;
  }
  return null;
}

export interface ResolveNpcTtsModeInput {
  search?: string;
  storedValue?: string | null;
  windowConfigValue?: string | null;
  envValue?: string | null;
}

/**
 * Resolves the active NPC TTS mode with safe fail-closed fallback to `'legacy'`.
 *
 * Precedence (highest to lowest):
 * 1. URL query parameter `?npcTtsMode=legacy|hybrid` (instant QA/rollback without rebuild)
 * 2. localStorage key `v28_npc_tts_mode` (instant browser-level toggle/rollback without rebuild)
 * 3. Runtime global `window.__V28_CONFIG__?.npcTtsMode` (runtime config without rebuild)
 * 4. Build-time Vite env `VITE_NPC_TTS_MODE` (requires FE rebuild + redeploy when changed)
 * 5. Safe default: `'legacy'` (untouched Piper WASM)
 */
export function resolveNpcTtsMode(input?: ResolveNpcTtsModeInput): NpcTtsMode {
  const searchStr =
    input?.search !== undefined
      ? input.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';

  if (searchStr) {
    try {
      const params = new URLSearchParams(searchStr);
      const fromUrl = normalizeNpcTtsMode(params.get('npcTtsMode'));
      if (fromUrl) return fromUrl;
    } catch {
      // ignore malformed query string
    }
  }

  let storedRaw: string | null | undefined = input?.storedValue;
  if (storedRaw === undefined && typeof localStorage !== 'undefined') {
    try {
      storedRaw = localStorage.getItem(NPC_TTS_MODE_STORAGE_KEY);
    } catch {
      storedRaw = null;
    }
  }
  const fromStorage = normalizeNpcTtsMode(storedRaw);
  if (fromStorage) return fromStorage;

  const winRaw =
    input?.windowConfigValue !== undefined
      ? input.windowConfigValue
      : typeof window !== 'undefined'
        ? window.__V28_CONFIG__?.npcTtsMode
        : null;
  const fromWin = normalizeNpcTtsMode(winRaw);
  if (fromWin) return fromWin;

  const envRaw =
    input?.envValue !== undefined
      ? input.envValue
      : (import.meta.env?.VITE_NPC_TTS_MODE as string | undefined);
  const fromEnv = normalizeNpcTtsMode(envRaw);
  if (fromEnv) return fromEnv;

  return DEFAULT_NPC_TTS_MODE;
}

/**
 * Sets or clears the runtime browser override for NPC TTS mode (zero-rebuild toggle / rollback).
 */
export function setRuntimeNpcTtsMode(mode: NpcTtsMode | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (mode === null) {
      localStorage.removeItem(NPC_TTS_MODE_STORAGE_KEY);
    } else {
      localStorage.setItem(NPC_TTS_MODE_STORAGE_KEY, mode);
    }
  } catch {
    // ignore storage quota/privacy errors
  }
}

export function normalizeNpcTtsProvider(raw: unknown): NpcTtsProvider | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'supertonic' || cleaned === 'supertonic3') return 'supertonic';
  if (cleaned === 'hybrid-piper' || cleaned === 'hybrid' || cleaned === 'piper') return 'hybrid-piper';
  if (cleaned === 'legacy-piper' || cleaned === 'legacy') return 'legacy-piper';
  return null;
}

export function resolveNpcTtsProvider(input?: {
  search?: string;
  storedValue?: string | null;
  windowConfigValue?: string | null;
  envValue?: string | null;
}): NpcTtsProvider {
  const searchStr =
    input?.search !== undefined
      ? input.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (searchStr) {
    try {
      const fromUrl = normalizeNpcTtsProvider(new URLSearchParams(searchStr).get('npcTtsProvider'));
      if (fromUrl) return fromUrl;
    } catch {
      // ignore
    }
  }

  let storedRaw: string | null | undefined = input?.storedValue;
  if (storedRaw === undefined && typeof localStorage !== 'undefined') {
    try {
      storedRaw = localStorage.getItem(NPC_TTS_PROVIDER_STORAGE_KEY);
    } catch {
      storedRaw = null;
    }
  }
  const fromStorage = normalizeNpcTtsProvider(storedRaw);
  if (fromStorage) return fromStorage;

  const winRaw =
    input?.windowConfigValue !== undefined
      ? input.windowConfigValue
      : typeof window !== 'undefined'
        ? window.__V28_CONFIG__?.npcTtsProvider
        : null;
  const fromWin = normalizeNpcTtsProvider(winRaw);
  if (fromWin) return fromWin;

  const envRaw =
    input?.envValue !== undefined
      ? input.envValue
      : (import.meta.env?.VITE_NPC_TTS_PROVIDER as string | undefined);
  const fromEnv = normalizeNpcTtsProvider(envRaw);
  if (fromEnv) return fromEnv;

  return DEFAULT_NPC_TTS_PROVIDER;
}

export function resolveSupertonicVoicePreset(input?: {
  search?: string;
  storedValue?: string | null;
  envValue?: string | null;
}): SupertonicFemaleVoice {
  const isValid = (v: unknown): v is SupertonicFemaleVoice =>
    typeof v === 'string' && ['F1', 'F2', 'F3', 'F4', 'F5'].includes(v.trim().toUpperCase());

  const searchStr =
    input?.search !== undefined
      ? input.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (searchStr) {
    try {
      const q = new URLSearchParams(searchStr).get('supertonicVoice');
      if (isValid(q)) return q.trim().toUpperCase() as SupertonicFemaleVoice;
    } catch {
      // ignore
    }
  }

  let stored = input?.storedValue;
  if (stored === undefined && typeof localStorage !== 'undefined') {
    try {
      stored = localStorage.getItem(SUPERTONIC_VOICE_STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  if (isValid(stored)) return stored.trim().toUpperCase() as SupertonicFemaleVoice;

  const envRaw =
    input?.envValue !== undefined
      ? input.envValue
      : (import.meta.env?.VITE_SUPERTONIC_VOICE as string | undefined);
  if (isValid(envRaw)) return envRaw.trim().toUpperCase() as SupertonicFemaleVoice;

  return DEFAULT_SUPERTONIC_VOICE;
}

function parseClampedSupertonicSpeed(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Number(Math.max(MIN_SUPERTONIC_SPEED, Math.min(MAX_SUPERTONIC_SPEED, num)).toFixed(2));
}

export function resolveSupertonicSpeed(input?: {
  search?: string;
  storedValue?: string | null;
  windowConfigValue?: number | string | null;
  envValue?: string | null;
}): number {
  const searchStr =
    input?.search !== undefined
      ? input.search
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (searchStr) {
    try {
      const params = new URLSearchParams(searchStr);
      const fromUrl = parseClampedSupertonicSpeed(
        params.get('supertonicSpeed') ?? params.get('npcSpeed')
      );
      if (fromUrl !== null) return fromUrl;
    } catch {
      // ignore
    }
  }

  let stored = input?.storedValue;
  if (stored === undefined && typeof localStorage !== 'undefined') {
    try {
      stored = localStorage.getItem(SUPERTONIC_SPEED_STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  const fromStorage = parseClampedSupertonicSpeed(stored);
  if (fromStorage !== null) return fromStorage;

  const winRaw =
    input?.windowConfigValue !== undefined
      ? input.windowConfigValue
      : typeof window !== 'undefined'
        ? window.__V28_CONFIG__?.supertonicSpeed
        : null;
  const fromWin = parseClampedSupertonicSpeed(winRaw);
  if (fromWin !== null) return fromWin;

  const envRaw =
    input?.envValue !== undefined
      ? input.envValue
      : (import.meta.env?.VITE_SUPERTONIC_SPEED as string | undefined);
  const fromEnv = parseClampedSupertonicSpeed(envRaw);
  if (fromEnv !== null) return fromEnv;

  return DEFAULT_SUPERTONIC_SPEED;
}
