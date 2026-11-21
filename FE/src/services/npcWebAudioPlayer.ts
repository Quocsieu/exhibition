/**
 * Real-time Web Audio API playback engine for pre-generated Hybrid Piper WAV clips.
 *
 * Why Web Audio API instead of HTMLAudioElement for pregen WAVs:
 * 1. `AudioContext.decodeAudioData()` decodes PCM off the main thread.
 * 2. `AudioBufferSourceNode` renders on the browser's high-priority OS audio thread
 *    (WASAPI/CoreAudio/AAudio), making mid-WAV playback immune to Three.js WebGL long tasks,
 *    React re-renders, GC pauses, and HTMLAudioElement `waiting`/`stalled` pipeline stalls.
 * 3. Decoded `AudioBuffer`s live in a bounded LRU cache keyed by content hash, so lookahead
 *    pre-decoding survives across both intra-step chunk transitions and cross-step boundaries.
 *
 * Legacy Piper WASM (`piperTtsWorker.ts`, `hybridTtsAdapter.ts`) is completely untouched.
 */

const MAX_DECODED_BUFFERS = 28;

export interface WebAudioPlayOptions {
  signal: AbortSignal;
  muted: boolean;
  onStartPlayback: () => void;
}

function createNotAllowedError(): Error {
  const err = new Error('AudioContext suspended by browser autoplay policy');
  err.name = 'NotAllowedError';
  return err;
}

class NpcWebAudioPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeResolve: (() => void) | null = null;
  private decodedCache = new Map<string, AudioBuffer>();
  private inFlightDecodes = new Map<string, Promise<AudioBuffer | null>>();
  private muted = false;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return Boolean(w.AudioContext || w.webkitAudioContext);
  }

  private getOrCreateContext(): AudioContext | null {
    if (!this.isSupported()) return null;
    if (this.ctx && this.ctx.state !== 'closed') {
      return this.ctx;
    }
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const gain = ctx.createGain();
      gain.gain.value = this.muted ? 0 : 1;
      gain.connect(ctx.destination);
      this.ctx = ctx;
      this.gainNode = gain;
      return ctx;
    } catch {
      return null;
    }
  }

  private putDecoded(hash: string, buffer: AudioBuffer): void {
    if (this.decodedCache.has(hash)) {
      this.decodedCache.delete(hash);
    } else if (this.decodedCache.size >= MAX_DECODED_BUFFERS) {
      const oldestKey = this.decodedCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.decodedCache.delete(oldestKey);
      }
    }
    this.decodedCache.set(hash, buffer);
  }

  public hasDecoded(hash: string): boolean {
    return this.decodedCache.has(hash);
  }

  /**
   * Decodes a WAV Blob into a PCM AudioBuffer off the main thread and stores it in LRU RAM cache.
   * Safe to call speculatively for the next chunk or the next step's first chunk.
   */
  public async predecodeBlob(hash: string, blob: Blob): Promise<AudioBuffer | null> {
    const cached = this.decodedCache.get(hash);
    if (cached) {
      // Refresh LRU recency
      this.putDecoded(hash, cached);
      return cached;
    }

    const existing = this.inFlightDecodes.get(hash);
    if (existing) return existing;

    const ctx = this.getOrCreateContext();
    if (!ctx) return null;

    const task = (async (): Promise<AudioBuffer | null> => {
      try {
        const arrayBuf = await blob.arrayBuffer();
        // Copy buffer before decodeAudioData because some browsers detach the passed ArrayBuffer
        const copy = arrayBuf.slice(0);
        const decoded = await ctx.decodeAudioData(copy);
        if (!decoded || decoded.duration <= 0) return null;
        this.putDecoded(hash, decoded);
        return decoded;
      } catch {
        return null;
      } finally {
        this.inFlightDecodes.delete(hash);
      }
    })();

    this.inFlightDecodes.set(hash, task);
    return task;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.gainNode && this.ctx && this.ctx.state !== 'closed') {
      try {
        this.gainNode.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
      } catch {
        this.gainNode.gain.value = muted ? 0 : 1;
      }
    }
  }

  public stop(): void {
    const src = this.activeSource;
    const resolve = this.activeResolve;
    this.activeSource = null;
    this.activeResolve = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // ignore
      }
    }
    if (resolve) {
      resolve();
    }
  }

  /**
   * Plays a pregen WAV via Web Audio API.
   * Returns `true` if playback was handled via Web Audio API (completed or aborted).
   * Returns `false` if Web Audio API is unavailable or decoding failed (caller should fall back).
   * Throws `NotAllowedError` if AudioContext remains suspended after resume().
   */
  public async playBlob(hash: string, blob: Blob, opts: WebAudioPlayOptions): Promise<boolean> {
    if (opts.signal.aborted) return true;
    const ctx = this.getOrCreateContext();
    if (!ctx || !this.gainNode) return false;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        throw createNotAllowedError();
      }
      if (opts.signal.aborted) return true;
      if ((ctx.state as AudioContextState) !== 'running') {
        throw createNotAllowedError();
      }
    }

    const buffer = await this.predecodeBlob(hash, blob);
    if (opts.signal.aborted) return true;
    if (!buffer) return false;

    this.setMuted(opts.muted);
    // Enforce strictly <= 1 active source at any time
    this.stop();

    return new Promise<boolean>((resolve) => {
      if (opts.signal.aborted) {
        resolve(true);
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode!);

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        opts.signal.removeEventListener('abort', onAbort);
        source.onended = null;
        if (this.activeSource === source) {
          this.activeSource = null;
          this.activeResolve = null;
        }
        try {
          source.disconnect();
        } catch {
          // ignore
        }
        resolve(true);
      };

      const onAbort = () => {
        try {
          source.stop();
        } catch {
          // ignore
        }
        finish();
      };

      source.onended = finish;
      opts.signal.addEventListener('abort', onAbort, { once: true });

      this.activeSource = source;
      this.activeResolve = finish;

      try {
        source.start(0);
        opts.onStartPlayback();
      } catch {
        finish();
      }
    });
  }
}

export const npcWebAudioPlayer = new NpcWebAudioPlayer();
