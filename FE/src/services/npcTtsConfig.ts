export type NpcTtsMode = 'legacy' | 'hybrid';

export const DEFAULT_NPC_TTS_MODE: NpcTtsMode = 'legacy';
export const NPC_TTS_MODE_STORAGE_KEY = 'v28_npc_tts_mode';

declare global {
  interface Window {
    __V28_CONFIG__?: {
      npcTtsMode?: string;
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
