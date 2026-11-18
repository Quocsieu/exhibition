import {
  type Booth,
  type CreateBoothInput,
  type UpdateBoothInput,
  type Product,
  type CreateProductInput,
  type UpdateProductInput,
  type ExtractedProductDraft,
  type BoothSlotDefinition,
  type BoothSlotAssignment,
  type BoothSlotView,
  BOOTH_SLOT_DEFINITIONS,
} from '../types/expo';
import { API_BASE_URL, buildApiUrl } from '../config/apiConfig';

export function buildBoothSlotViews(
  boothId: string,
  products: Product[],
  assignments: BoothSlotAssignment[]
): BoothSlotView[] {
  const boothAssignments = assignments.filter((a) => a.boothId === boothId);
  const assignmentBySlot = new Map<string, BoothSlotAssignment>();
  for (const a of boothAssignments) {
    assignmentBySlot.set(a.slotId, a);
  }

  const productById = new Map<string, Product>();
  for (const p of products) {
    productById.set(p.id, p);
  }

  return BOOTH_SLOT_DEFINITIONS.map((slot) => {
    const assignment = assignmentBySlot.get(slot.slotId);
    const product = assignment ? productById.get(assignment.productId) || null : null;
    return {
      boothId,
      slot,
      productId: product ? product.id : null,
      product,
      updatedAt: assignment?.updatedAt ?? null,
    };
  });
}

export const EXPO_DATA_SYNC_CHANNEL = 'virtual-expo-data-sync';
export const EXPO_DATA_UPDATED_STORAGE_KEY = 'expo_data_updated_at';
export const EXPO_DATA_MUTATED_EVENT = 'expo:data-mutated';

export function notifyExpoDataMutated(reason = 'mutation'): void {
  const timestamp = String(Date.now());
  try {
    localStorage.setItem(EXPO_DATA_UPDATED_STORAGE_KEY, `${timestamp}:${reason}`);
  } catch {
    // Ignore storage quota or private mode restrictions
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(EXPO_DATA_SYNC_CHANNEL);
      bc.postMessage({ type: 'EXPO_DATA_MUTATED', reason, timestamp });
      bc.close();
    }
  } catch {
    // Ignore BroadcastChannel unsupported environments
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXPO_DATA_MUTATED_EVENT, { detail: { reason, timestamp } }));
  }
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('expo_admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const primaryUrl = buildApiUrl(normalizedPath);
  const isGetRequest = !options.method || options.method.toUpperCase() === 'GET';
  const fetchOptions: RequestInit = {
    ...(isGetRequest ? { cache: 'no-store' as RequestCache } : {}),
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(primaryUrl, fetchOptions);
  } catch (err) {
    // If direct cross-origin request fails (e.g. CORS mismatch before Render redeploy),
    // fallback to same-origin relative path handled by Vercel Rewrites (/api/:path*).
    if (API_BASE_URL) {
      response = await fetch(normalizedPath, fetchOptions);
    } else {
      throw err;
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Lỗi kết nối máy chủ (HTTP ${response.status})`);
  }
  return data as T;
}

export const apiClient = {
  async getBooths(): Promise<Booth[]> {
    const res = await requestJson<{ booths: Booth[] }>('/api/booths');
    return res.booths;
  },

  async getProducts(boothId?: string): Promise<Product[]> {
    const query = boothId ? `?boothId=${encodeURIComponent(boothId)}` : '';
    const res = await requestJson<{ products: Product[] }>(`/api/products${query}`);
    return res.products;
  },

  async getSlots(boothId?: string): Promise<{
    slotDefinitions: BoothSlotDefinition[];
    assignments: BoothSlotAssignment[];
  }> {
    const query = boothId ? `?boothId=${encodeURIComponent(boothId)}` : '';
    return requestJson<{
      slotDefinitions: BoothSlotDefinition[];
      assignments: BoothSlotAssignment[];
    }>(`/api/slots${query}`);
  },

  async getBoothSlots(boothId: string): Promise<{
    booth: Booth;
    slotDefinitions: BoothSlotDefinition[];
    slots: BoothSlotView[];
  }> {
    return requestJson<{
      booth: Booth;
      slotDefinitions: BoothSlotDefinition[];
      slots: BoothSlotView[];
    }>(`/api/booths/${encodeURIComponent(boothId)}/slots`);
  },

  async assignProductToSlot(
    boothId: string,
    slotId: string,
    productId: string | null
  ): Promise<{ slot: BoothSlotView; slots: BoothSlotView[] }> {
    const res = await requestJson<{ slot: BoothSlotView; slots: BoothSlotView[] }>(
      `/api/booths/${encodeURIComponent(boothId)}/slots/${encodeURIComponent(slotId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ productId }),
      }
    );
    notifyExpoDataMutated('assign-slot');
    return res;
  },

  async clearBoothSlot(
    boothId: string,
    slotId: string
  ): Promise<{ slot: BoothSlotView; slots: BoothSlotView[] }> {
    const res = await requestJson<{ slot: BoothSlotView; slots: BoothSlotView[] }>(
      `/api/booths/${encodeURIComponent(boothId)}/slots/${encodeURIComponent(slotId)}`,
      {
        method: 'DELETE',
      }
    );
    notifyExpoDataMutated('clear-slot');
    return res;
  },

  async loginAdmin(username: string, password: string): Promise<{ token: string; username: string }> {
    return requestJson<{ token: string; username: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  async verifyAdmin(): Promise<{ authenticated: boolean; username?: string }> {
    return requestJson<{ authenticated: boolean; username?: string }>('/api/admin/me');
  },

  async createBooth(input: CreateBoothInput): Promise<Booth> {
    const res = await requestJson<{ booth: Booth }>('/api/booths', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    notifyExpoDataMutated('create-booth');
    return res.booth;
  },

  async updateBooth(id: string, input: UpdateBoothInput): Promise<Booth> {
    const res = await requestJson<{ booth: Booth }>(`/api/booths/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    notifyExpoDataMutated('update-booth');
    return res.booth;
  },

  async deleteBooth(id: string): Promise<void> {
    await requestJson<{ success: boolean }>(`/api/booths/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    notifyExpoDataMutated('delete-booth');
  },

  async createProduct(input: CreateProductInput): Promise<Product> {
    const res = await requestJson<{ product: Product }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    notifyExpoDataMutated('create-product');
    return res.product;
  },

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const res = await requestJson<{ product: Product }>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    notifyExpoDataMutated('update-product');
    return res.product;
  },

  async deleteProduct(id: string): Promise<void> {
    await requestJson<{ success: boolean }>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    notifyExpoDataMutated('delete-product');
  },

  async extractProductFromUrl(url: string): Promise<ExtractedProductDraft> {
    const res = await requestJson<{ draft: ExtractedProductDraft }>('/api/integrations/extract-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
    return res.draft;
  },

  async importProductsBatch(
    boothId: string,
    format: 'json' | 'csv',
    content: string
  ): Promise<{ importedCount: number; products: Product[] }> {
    const res = await requestJson<{ importedCount: number; products: Product[] }>(
      '/api/integrations/import-batch',
      {
        method: 'POST',
        body: JSON.stringify({ boothId, format, content }),
      }
    );
    notifyExpoDataMutated('import-batch');
    return res;
  },

  async getNpcSpeechManifest(
    params: {
      boothId: string;
      stepType: 'GREETING' | 'PRODUCT' | 'CLOSING';
      slotId?: string | null;
      productId?: string | null;
    },
    signal?: AbortSignal
  ): Promise<{
    provider: string;
    voice: string;
    workerState: 'stopped' | 'starting' | 'ready' | 'failed';
    totalChunks: number;
    fullText: string;
    chunks: Array<{ chunkIndex: number; charLength: number; cached: boolean }>;
  }> {
    const normalizedPath = '/api/npc/tts';
    const primaryUrl = buildApiUrl(normalizedPath);
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...params, mode: 'manifest' }),
      signal,
    };

    const isLocalHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const candidateUrls = isLocalHost
      ? Array.from(
          new Set([primaryUrl, normalizedPath, `http://localhost:4000${normalizedPath}`].filter(Boolean))
        )
      : Array.from(new Set([primaryUrl, normalizedPath].filter(Boolean)));

    let response: Response | null = null;
    let lastError: unknown = null;

    for (let i = 0; i < candidateUrls.length; i++) {
      const url = candidateUrls[i];
      try {
        const res = await fetch(url, fetchOptions);
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const isHtmlFallback404 = res.status === 404 && contentType.includes('text/html');
        // Never retry on structured JSON business responses from Backend
        const isDeadDevProxy =
          isLocalHost &&
          (res.status === 502 || res.status === 504) &&
          !contentType.includes('application/json');

        if ((isHtmlFallback404 || isDeadDevProxy) && i < candidateUrls.length - 1) {
          continue;
        }
        response = res;
        break;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          throw err;
        }
        lastError = err;
      }
    }

    if (!response) {
      throw lastError || new Error('Không thể kết nối tới dịch vụ âm thanh TTS.');
    }

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      const error = new Error(
        errData.error || `Không thể chuẩn bị lời thoại từ máy chủ (HTTP ${response.status})`
      ) as Error & { code?: string; status?: number };
      error.code = errData.code || `HTTP_${response.status}`;
      error.status = response.status;
      throw error;
    }

    return (await response.json()) as {
      provider: string;
      voice: string;
      workerState: 'stopped' | 'starting' | 'ready' | 'failed';
      totalChunks: number;
      fullText: string;
      chunks: Array<{ chunkIndex: number; charLength: number; cached: boolean }>;
    };
  },

  async synthesizeNpcSpeech(
    params: {
      boothId: string;
      stepType: 'GREETING' | 'PRODUCT' | 'CLOSING';
      slotId?: string | null;
      productId?: string | null;
      chunkIndex?: number;
      priority?: 'ACTIVE_PLAYBACK' | 'NEXT_CHUNK' | 'PREFETCH';
    },
    signal?: AbortSignal
  ): Promise<{
    blob: Blob;
    cacheStatus: string;
    provider: string;
    voice: string;
    chunkIndex?: number;
    totalChunks?: number;
  }> {
    const normalizedPath = '/api/npc/tts';
    const primaryUrl = buildApiUrl(normalizedPath);
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal,
    };

    const isLocalHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const candidateUrls = isLocalHost
      ? Array.from(
          new Set([
            primaryUrl,
            normalizedPath,
            `http://localhost:4000${normalizedPath}`,
          ].filter(Boolean))
        )
      : Array.from(new Set([primaryUrl, normalizedPath].filter(Boolean)));

    let response: Response | null = null;
    let lastError: unknown = null;

    for (let i = 0; i < candidateUrls.length; i++) {
      const url = candidateUrls[i];
      try {
        const res = await fetch(url, fetchOptions);
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const isHtmlFallback404 =
          res.status === 404 && contentType.includes('text/html');
        // ONLY fallback if Vite dev proxy itself returned a non-JSON 502/504 gateway error;
        // NEVER retry when Backend returned a JSON business error (TTS_TIMEOUT, TTS_SYNTHESIS_FAILED, TTS_BUSY)!
        const isDeadDevProxy =
          isLocalHost &&
          (res.status === 502 || res.status === 504) &&
          !contentType.includes('application/json');

        if ((isHtmlFallback404 || isDeadDevProxy) && i < candidateUrls.length - 1) {
          continue;
        }
        response = res;
        break;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          throw err;
        }
        lastError = err;
      }
    }

    if (!response) {
      throw lastError || new Error('Không thể kết nối tới dịch vụ âm thanh TTS.');
    }

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      const error = new Error(
        errData.error || `Không thể tải âm thanh từ máy chủ (HTTP ${response.status})`
      ) as Error & { code?: string; status?: number };
      error.code = errData.code || `HTTP_${response.status}`;
      error.status = response.status;
      throw error;
    }

    const blob = await response.blob();
    if (!blob || blob.size < 32) {
      const error = new Error('Dữ liệu âm thanh trả về rỗng hoặc không hợp lệ.') as Error & {
        code?: string;
      };
      error.code = 'EMPTY_AUDIO_BLOB';
      throw error;
    }

    const rawChunkIdx = response.headers.get('X-TTS-Chunk-Index');
    const rawTotalChunks = response.headers.get('X-TTS-Total-Chunks');

    return {
      blob,
      cacheStatus: response.headers.get('X-TTS-Cache') || 'MISS',
      provider: response.headers.get('X-TTS-Provider') || 'cloud',
      voice: response.headers.get('X-TTS-Voice') || 'vi-female',
      chunkIndex: rawChunkIdx !== null ? Number(rawChunkIdx) : params.chunkIndex,
      totalChunks: rawTotalChunks !== null ? Number(rawTotalChunks) : undefined,
    };
  },
};
