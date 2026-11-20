import { API_BASE_URL } from '../config/apiConfig';

export interface V28Company {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  logoUrl: string;
  bannerUrl: string;
  contactEmail: string;
  contactUrl: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
  boothCount?: number;
  productCount?: number;
}

export interface V28BoothSummary {
  id: string;
  name: string;
  companyName: string;
  companyId: string | null;
  category: string;
  status: 'active' | 'archived';
}

export interface V28Product {
  id: string;
  companyId: string;
  boothId: string | null;
  name: string;
  sku: string;
  price: number;
  currency: string;
  description: string;
  images: string[];
  videoUrl: string;
  modelUrl: string;
  sourceUrl: string;
  contactUrl: string;
  inStock: boolean;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ExcelRowValidationItem {
  rowNumber: number;
  status: 'valid' | 'duplicate_in_file' | 'duplicate_in_db' | 'error';
  errors: string[];
  existingProductId?: string;
  data?: {
    name: string;
    sku: string;
    price: number;
    currency: string;
    description: string;
    imageUrl: string;
    sourceUrl: string;
    inStock?: boolean;
  };
  raw?: Record<string, string>;
}

export interface ExcelPreviewResponse {
  jobId: string;
  previewToken: string;
  expiresAt: string;
  companyId: string;
  filename: string;
  summary: {
    totalRows: number;
    validCount: number;
    duplicateInFileCount: number;
    duplicateInDbCount: number;
    errorCount: number;
  };
  rows: ExcelRowValidationItem[];
}

export interface ImportJobReport {
  jobId: string;
  companyId: string;
  sourceType: 'excel' | 'url';
  filename: string;
  status: 'committed' | 'failed';
  duplicateStrategy: 'skip' | 'update' | 'create';
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  durationMs: number;
  errors: Array<{ rowNumber: number; sku?: string; reason: string }>;
  createdAt: string;
}

async function v28Request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('expo_admin_token') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE_URL}/api/v28${path}`, {
    ...init,
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Lỗi máy chủ (${res.status})`);
  }
  return body as T;
}

export const v28Api = {
  // Companies
  listCompanies: (params?: { q?: string; status?: 'all' | 'active' | 'inactive' }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return v28Request<{ companies: V28Company[] }>(`/companies${suffix}`);
  },
  getCompany: (id: string) =>
    v28Request<{ company: V28Company & { booths: V28BoothSummary[]; productCount: number } }>(
      `/companies/${encodeURIComponent(id)}`
    ),
  createCompany: (payload: {
    name: string;
    slug?: string;
    category?: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string;
    contactEmail?: string;
    contactUrl?: string;
  }) =>
    v28Request<{ company: V28Company }>('/companies', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCompany: (id: string, patch: Partial<V28Company>) =>
    v28Request<{ company: V28Company }>(`/companies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Independent Product Catalog
  listProducts: (params?: {
    companyId?: string;
    q?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.companyId) qs.set('companyId', params.companyId);
    if (params?.q) qs.set('q', params.q);
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return v28Request<{
      items: V28Product[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/products${suffix}`);
  },
  createProduct: (payload: {
    companyId: string;
    boothId?: string | null;
    name: string;
    sku?: string;
    price: number;
    currency?: string;
    description?: string;
    images?: string[];
    sourceUrl?: string;
    contactUrl?: string;
    inStock?: boolean;
  }) =>
    v28Request<{ product: V28Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProduct: (id: string, patch: Partial<V28Product>) =>
    v28Request<{ product: V28Product }>(`/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Booths & Slots
  listBooths: (companyId?: string) => {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}&includeArchived=true` : '?includeArchived=true';
    return v28Request<{
      booths: V28BoothSummary[];
      slots: Array<{ boothId: string; slotId: string; productId: string }>;
    }>(`/booths${qs}`);
  },
  assignSlot: (boothId: string, slotId: string, productId: string) =>
    v28Request<{ assignment: { boothId: string; slotId: string; productId: string } }>(
      `/booths/${encodeURIComponent(boothId)}/slots/${encodeURIComponent(slotId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ productId }),
      }
    ),

  // Excel Import
  previewExcel: (payload: { companyId: string; filename: string; fileBase64: string }) =>
    v28Request<ExcelPreviewResponse>('/imports/excel/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  commitExcel: (payload: { previewToken: string; duplicateStrategy: 'skip' | 'update' | 'create' }) =>
    v28Request<{ report: ImportJobReport }>('/imports/excel/commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getErrorCsvUrl: (jobId: string) =>
    `${API_BASE_URL}/api/v28/imports/${encodeURIComponent(jobId)}/report?format=csv`,

  // URL Import into Company Catalog
  importFromUrl: (payload: { companyId: string; url: string; saveToCatalog?: boolean }) =>
    v28Request<{ product?: V28Product; draft: Record<string, unknown>; saved: boolean }>('/imports/url', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 2: Dynamic Exhibitions, Versions, Zones, Placements & Publish
  listArchetypes: () => v28Request<{ archetypes: V28ArchetypeSpec[] }>('/archetypes'),
  getActiveWorld: (previewVersionId?: string | null) => {
    const qs = previewVersionId ? `?previewVersionId=${encodeURIComponent(previewVersionId)}` : '';
    return v28Request<{ world: V28ExhibitionVersionDetail }>(`/exhibitions/active${qs}`);
  },
  listExhibitions: () => v28Request<{ exhibitions: V28ExhibitionSummary[] }>('/exhibitions'),
  createExhibition: (payload: { name: string; targetBoothCount?: number; preferredZoneCapacity?: number }) =>
    v28Request<{ exhibition: V28ExhibitionSummary }>('/exhibitions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createDraftVersion: (
    exhibitionId: string,
    payload: { targetBoothCount: number; preferredZoneCapacity?: number; layoutSeed?: number; baseVersionId?: string }
  ) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/drafts`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  getVersionDetail: (exhibitionId: string, versionId: string) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}`
    ),
  updateDraftZone: (
    exhibitionId: string,
    versionId: string,
    zoneId: string,
    patch: { displayName?: string; categoryTag?: string }
  ) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/zones/${encodeURIComponent(zoneId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),
  updateDraftBooth: (
    exhibitionId: string,
    versionId: string,
    boothId: string,
    patch: {
      positionX?: number;
      positionZ?: number;
      rotationY?: number;
      archetypeId?: V28ArchetypeId;
      companyId?: string;
      boothName?: string;
    }
  ) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/booths/${encodeURIComponent(boothId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),
  publishVersion: (exhibitionId: string, versionId: string) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/publish`,
      {
        method: 'POST',
      }
    ),
  rollbackVersion: (exhibitionId: string, targetVersionId: string) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/rollback`,
      {
        method: 'POST',
        body: JSON.stringify({ targetVersionId }),
      }
    ),
};

export type V28ArchetypeId =
  | 'signature_ring'
  | 'organic_flow'
  | 'grand_portal'
  | 'wave_pavilion'
  | 'gallery_arch'
  | 'dynamic_frame';

export interface V28ArchetypeSpec {
  id: V28ArchetypeId;
  theme: 'living' | 'design' | 'tech' | 'energy' | 'coffee' | 'robotics';
  label: string;
  glbPath: string;
  width: number;
  depth: number;
  height: number;
}

export interface V28RectBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface V28ExhibitionSummary {
  id: string;
  name: string;
  status: string;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  activeBoothCount: number;
  activeZoneCount: number;
  latestDraftVersionId: string | null;
  latestDraftVersionNumber: number | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    status: 'draft' | 'published' | 'archived';
    targetBoothCount: number;
    createdAt: string;
    publishedAt: string | null;
  }>;
}

export interface V28ZoneRecord {
  id: string;
  versionId: string;
  code: string;
  displayName: string;
  categoryTag: string;
  bounds: V28RectBounds;
  sortOrder: number;
  boothCount: number;
}

export interface V28BoothPlacementView {
  versionId: string;
  boothId: string;
  boothName: string;
  tagline: string;
  description: string;
  category: string;
  color: string;
  companyId: string | null;
  companyName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  slotIndex: number;
  positionX: number;
  positionZ: number;
  rotationY: number;
  archetypeId: V28ArchetypeId;
  archetypeLabel: string;
  archetypeTheme: string;
  glbPath: string;
  footprintWidth: number;
  footprintDepth: number;
  approachPoint: { x: number; z: number };
  focusCameraPoint: { x: number; z: number };
  placementStatus: string;
  slots: Array<{ slotId: string; product: V28Product | null }>;
  assignedSlotCount: number;
}

export interface V28ExhibitionVersionDetail {
  exhibitionId: string;
  exhibitionName: string;
  versionId: string;
  versionNumber: number;
  status: 'draft' | 'published' | 'archived';
  targetBoothCount: number;
  createdAt: string;
  publishedAt: string | null;
  hallWidth: number;
  hallDepth: number;
  hallBounds: V28RectBounds;
  walkableBounds: V28RectBounds;
  centralAvenueBounds: V28RectBounds;
  welcomeAreaBounds: V28RectBounds;
  spawnPoint: { x: number; z: number; rotationY: number };
  directoryPoint: { x: number; z: number };
  cameraOverviewBounds: {
    centerX: number;
    centerZ: number;
    radius: number;
    recommendedHeight: number;
    recommendedDistance: number;
  };
  roofBounds: {
    hallWidth: number;
    hallDepth: number;
    bounds: V28RectBounds;
    eaveHeight: number;
    roofRise: number;
    ribSpacing: number;
    skylightRatio: number;
  };
  zones: V28ZoneRecord[];
  booths: V28BoothPlacementView[];
  validation: {
    valid: boolean;
    errors: string[];
    stats: {
      boothCount: number;
      zoneCount: number;
      overlapCount: number;
      outOfBoundsCount: number;
      blockedWalkwayCount: number;
      unreachableBoothCount: number;
      focusClipCount: number;
    };
  };
}
