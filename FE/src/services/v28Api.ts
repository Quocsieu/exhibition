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
  clearSlot: (boothId: string, slotId: string) =>
    v28Request<{ cleared: boolean }>(
      `/booths/${encodeURIComponent(boothId)}/slots/${encodeURIComponent(slotId)}`,
      {
        method: 'DELETE',
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
    payload: {
      targetBoothCount?: number;
      zoneCount?: number;
      boothsPerZone?: number;
      preferredZoneCapacity?: number;
      layoutSeed?: number;
      baseVersionId?: string;
    }
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
  deleteDraftBooth: (
    exhibitionId: string,
    versionId: string,
    boothId: string,
    forceUnassign = false
  ) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/booths/${encodeURIComponent(boothId)}?forceUnassign=${forceUnassign ? 'true' : 'false'}`,
      {
        method: 'DELETE',
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

  // Phase 4.2: Categories & Allocation Planner
  listCategories: () => v28Request<{ categories: V28Category[] }>('/categories'),
  createCategory: (payload: { name: string; description?: string; color?: string }) =>
    v28Request<{ category: V28Category }>('/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  planCategoryZones: (payload: {
    targetBoothCount: number;
    allocations?: Array<{ categoryId: string; boothCount: number }>;
  }) =>
    v28Request<{ plan: V28CategoryAllocationPlan }>('/categories/plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 5: Pre-generated Cached Audio & URL / Website Discovery Import
  discoverWebsiteProducts: (payload: { companyId: string; url: string; maxPages?: number }) =>
    v28Request<{
      siteUrl: string;
      pagesScanned: number;
      discoveredProducts: Array<{
        name: string;
        sku: string;
        price: number;
        currency: string;
        description: string;
        images: string[];
        sourceUrl: string;
        inStock: boolean;
        alreadyInCatalog: boolean;
      }>;
      note: string;
    }>('/imports/website', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  importProductFromUrl: (payload: {
    companyId: string;
    boothId?: string;
    url: string;
    saveToCatalog?: boolean;
  }) =>
    v28Request<{
      draft: {
        name: string;
        sku?: string;
        price?: number;
        currency?: string;
        description?: string;
        images?: string[];
        videoUrl?: string;
        sourceUrl?: string;
        inStock?: boolean;
      };
      product?: V28Product;
      saved: boolean;
      duplicateWarning?: { existingProductId: string; existingProductName: string } | null;
    }>('/imports/url', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAudioOverview: (limit = 50) =>
    v28Request<{ overview: V28AdminAudioOverview }>(`/audio/overview?limit=${limit}`),
  retryBoothAudio: (boothId: string) =>
    v28Request<V28BoothAudioPack>(`/booths/${encodeURIComponent(boothId)}/audio/retry`, {
      method: 'POST',
    }),
  getBoothAudio: (boothId: string) =>
    v28Request<V28BoothAudioPack>(`/booths/${encodeURIComponent(boothId)}/audio`),

  // Phase 6: AI Chat & Voice Consultant
  getAiStatus: () => v28Request<V28AiStatusResponse>('/ai/status'),
  chatWithBoothNpc: (payload: { boothId: string; userId: string; message: string }) =>
    v28Request<V28AiChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  startVoiceSession: (payload: { boothId: string; userId: string }) =>
    v28Request<{ session: V28VoiceSessionInfo }>('/ai/voice/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendVoiceTurn: (sessionId: string, transcript: string) =>
    v28Request<V28AiChatResponse & { sessionId: string; remainingSec: number; pipelineMode: string }>(
      `/ai/voice/${encodeURIComponent(sessionId)}/turn`,
      {
        method: 'POST',
        body: JSON.stringify({ transcript }),
      }
    ),
  endVoiceSession: (sessionId: string) =>
    v28Request<{ ended: boolean; durationSec: number }>(
      `/ai/voice/${encodeURIComponent(sessionId)}/end`,
      { method: 'POST' }
    ),
};

export interface V28Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  sortOrder: number;
}

export interface V28CategoryAllocationPlan {
  targetBoothCount: number;
  allocatedTotal: number;
  mismatch: number;
  warnings: string[];
  canPublish: boolean;
  zones: Array<{
    code: string;
    categoryId: string;
    categoryName: string;
    displayName: string;
    boothCount: number;
    color: string;
  }>;
}

export interface V28AudioClip {
  audioId: string;
  entityType: 'booth' | 'product' | 'faq';
  entityId: string;
  slotKey: string;
  contentHash: string;
  language: string;
  voiceId: string;
  modelId: string;
  durationSec: number;
  transcript: string;
  status: string;
  audioUrl: string;
}

export interface V28BoothAudioPack {
  boothId: string;
  storageDriver: string;
  liveGeminiTtsEnabled: boolean;
  clips: V28AudioClip[];
  cacheHits: number;
  generatedCount: number;
}

export interface V28AdminAudioOverview {
  totalAssets: number;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  liveGeminiTtsEnabled: boolean;
  providerLabel: string;
  storageDriver: string;
  metrics: { cacheHits: number; cacheMisses: number; generationFailures: number };
  recentAssets: V28AudioClip[];
}

export interface V28AiStatusResponse {
  provider: string;
  liveGeminiVerified: boolean;
  liveStatusNote: string;
  verifiedModelIds: Record<string, string>;
  voicePipelineMode: string;
  trialQuotas: {
    maxVoiceSessionSec: number;
    maxVoiceSessionsPerUserPerHour: number;
    maxConcurrentVoiceSessions: number;
  };
}

export interface V28AiChatResponse {
  reply: string;
  provider: string;
  modelId: string;
  liveGeminiVerified: boolean;
  groundedBoothId: string;
  groundedCompanyId: string;
  disclosure: string;
}

export interface V28VoiceSessionInfo {
  sessionId: string;
  boothId: string;
  pipelineMode: 'FALLBACK_STT_CHAT_TTS' | 'GEMINI_LIVE_API';
  liveGeminiVerified: boolean;
  maxDurationSec: number;
  remainingSessionsThisHour: number;
}

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
  categoryId?: string | null;
  displayName: string;
  categoryTag: string;
  bounds: V28RectBounds;
  sortOrder: number;
  boothCount: number;
}

export interface V28ClusterSpec {
  clusterId: string;
  clusterIndex: number;
  zoneCode: string;
  zoneName: string;
  categoryId: string | null;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  boothCount: number;
  variationSeed: number;
  centerpieceKind: 'medallion_oasis' | 'landscape_lounge' | 'interactive_corner' | 'cafe_rest';
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
  walkableRegions?: V28RectBounds[];
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
  clusters?: V28ClusterSpec[];
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
