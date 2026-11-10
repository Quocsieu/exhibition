import type {
  Booth,
  CreateBoothInput,
  UpdateBoothInput,
  Product,
  CreateProductInput,
  UpdateProductInput,
  ExtractedProductDraft,
} from '../types/expo';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('expo_admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

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
    return res.booth;
  },

  async updateBooth(id: string, input: UpdateBoothInput): Promise<Booth> {
    const res = await requestJson<{ booth: Booth }>(`/api/booths/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return res.booth;
  },

  async deleteBooth(id: string): Promise<void> {
    await requestJson<{ success: boolean }>(`/api/booths/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async createProduct(input: CreateProductInput): Promise<Product> {
    const res = await requestJson<{ product: Product }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.product;
  },

  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const res = await requestJson<{ product: Product }>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return res.product;
  },

  async deleteProduct(id: string): Promise<void> {
    await requestJson<{ success: boolean }>(`/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
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
    return requestJson<{ importedCount: number; products: Product[] }>(
      '/api/integrations/import-batch',
      {
        method: 'POST',
        body: JSON.stringify({ boothId, format, content }),
      }
    );
  },
};
