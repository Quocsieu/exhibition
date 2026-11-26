import type { V28AudioClip } from './v28Api';

let cachedLiveTtsConfigured: boolean | null = null;

export function setCachedLiveTtsConfigured(enabled: boolean): void {
  cachedLiveTtsConfigured = enabled;
}

export function getCachedLiveTtsConfigured(): boolean | null {
  return cachedLiveTtsConfigured;
}

/**
 * P0 Guard: Backend `audioCacheService` generates a 440Hz chime placeholder WAV (`*:local-fallback`)
 * for unauthenticated visitor GET requests even when `liveGeminiTtsEnabled` is true.
 * NEVER play `:local-fallback` chime WAVs as NPC speech; always route to real speech!
 */
export function isRealBackendSpeechClip(
  clip: (Pick<V28AudioClip, 'status' | 'modelId'> & { needsUpdate?: boolean; provider?: string }) | null | undefined
): boolean {
  if (!clip || clip.status !== 'ready') return false;
  if (clip.needsUpdate) return false;
  const provider = String(clip.provider || '').trim().toLowerCase();
  if (provider === 'local-fallback') return false;
  const modelId = String(clip.modelId || '').trim().toLowerCase();
  if (!modelId || modelId.includes('local-fallback') || modelId.includes('fallback')) {
    return false;
  }
  return true;
}
