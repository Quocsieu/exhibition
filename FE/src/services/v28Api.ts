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
  batchCreateProducts: (payload: {
    companyId: string;
    duplicateStrategy?: 'skip' | 'update';
    products: Array<{
      name: string;
      sku?: string;
      price?: number;
      currency?: string;
      description?: string;
      images?: string[];
      sourceUrl?: string;
      contactUrl?: string;
      inStock?: boolean;
    }>;
  }) =>
    v28Request<{
      createdCount: number;
      updatedCount: number;
      skippedCount: number;
      failedCount: number;
      createdProductIds: string[];
      productIds: string[];
      errors: Array<{ index: number; name?: string; reason: string }>;
    }>('/products/batch', {
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
  getDemoConfig: () =>
    v28Request<{ demoEnabled: boolean; label?: string; username?: string; password?: string }>('/auth/demo-config'),
  getActiveWorld: (previewVersionId?: string | null, bypassCache = false) => {
    const qs = previewVersionId ? `?previewVersionId=${encodeURIComponent(previewVersionId)}` : '';
    return v28Request<{ world: V28ExhibitionVersionDetail }>(
      `/exhibitions/active${qs}`,
      bypassCache ? { cache: 'no-store' } : undefined
    );
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
      requireProductSource?: boolean;
      productSource?: 'url' | 'excel';
      sourceUrl?: string;
      sourceFilename?: string;
      ownerCompanyId?: string;
    }
  ) =>
    v28Request<{ version: V28ExhibitionVersionDetail }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/drafts`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  autoAllocateDraftProducts: (
    exhibitionId: string,
    versionId: string,
    payload?: {
      companyId?: string;
      productIds?: string[];
      categoryHints?: Record<string, string>;
      organizeZonesByCategory?: boolean;
    }
  ) =>
    v28Request<{
      version: V28ExhibitionVersionDetail;
      assignedSlots: number;
      boothsFilled: number;
      assignedProductIds: string[];
      overflowProductIds: string[];
      uncertainProducts: Array<{ productId: string; name: string; reason: string }>;
      classifiedCount: number;
      zoneDecisions?: Array<{
        zoneId: string;
        zoneCode: string;
        displayName: string;
        categoryName: string;
        productCount: number;
        status: 'assigned_category' | 'merged_general' | 'unassigned_empty';
      }>;
    }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/auto-allocate`,
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
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

  // Phase 5 + Phase 9: Pre-generated Cached Audio & Smart URL / Website Discovery Import
  discoverWebsiteProducts: (payload: {
    companyId?: string;
    url: string;
    targetCount?: number;
    maxPages?: number;
    autoDetectCompany?: boolean;
  }) =>
    v28Request<{
      siteUrl: string;
      pagesScanned: number;
      totalBytesRead?: number;
      detectedCompany?: {
        companyId: string | null;
        companyName: string;
        canonicalDomain: string;
        confidence: 'verified' | 'needs_confirmation';
        evidence: string;
        created: boolean;
        matchedBy: string;
      };
      coverageReport?: {
        targetCount?: number;
        shortfall?: number;
        stopReason?: 'TARGET_REACHED' | 'SOURCE_EXHAUSTED' | 'RESOURCE_LIMIT' | 'ACCESS_BLOCKED' | 'NETWORK_ERROR';
        pagesScanned: number;
        maxPagesBudget?: number;
        productUrlsDiscovered: number;
        extractedValidCount: number;
        newCount: number;
        duplicateCount: number;
        inCrawlDuplicatesSkipped?: number;
        errorCount: number;
        totalBytesRead: number;
        stopReasons: string[];
        coverageStatus: 'IMPORT_COMPLETED' | 'TARGET_REACHED' | 'PARTIAL' | 'EMPTY';
        fullCatalogVerified: boolean;
      };
      discoveredProducts: Array<{
        name: string;
        brand?: string;
        sku: string;
        price: number;
        currency: string;
        description: string;
        images: string[];
        category?: string;
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
  removeEmptyBooths: (
    exhibitionId: string,
    versionId: string,
    input: { mode: 'single' | 'zone' | 'all'; boothId?: string; zoneId?: string }
  ) =>
    v28Request<{
      version: V28ExhibitionVersionDetail;
      removedBoothIds: string[];
      removedCount: number;
      removedZoneCodes: string[];
      compacted: boolean;
      remainingBoothCount: number;
      remainingZoneCount: number;
    }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/empty-booths/remove`,
      { method: 'POST', body: JSON.stringify(input) }
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
  logoUrl?: string;
  contactUrl?: string;
  contactEmail?: string;
  companyId: string | null;
  companyName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  zoneCategoryTag?: string;
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
  ownerCompanyId?: string | null;
  ownerCompany?: {
    id: string;
    name: string;
    logoUrl: string;
    contactUrl: string;
    contactEmail: string;
  } | null;
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

export type V28VisitorInteractionType = 'booth_focus' | 'product_inspect' | 'npc_consult';

export interface V28VisitorSessionResponse {
  visitorToken: string;
  expiresAt: string;
  resumed: boolean;
}

export interface V28VisitorJourneyResponse {
  exhibitionId: string;
  versionId: string;
  totalBooths: number;
  visitedCount: number;
  visitedBoothIds: string[];
  visits: Array<{
    boothId: string;
    interactionType: V28VisitorInteractionType;
    firstVisitedAt: string;
  }>;
}

export interface V28RecordBoothVisitResponse extends V28VisitorJourneyResponse {
  boothId: string;
  recorded: boolean;
  duplicate: boolean;
  firstVisitedAt: string;
}

export interface V28StartBoothEngagementResponse {
  engagementToken: string;
  boothId: string;
  versionId: string;
  expiresAt: string;
  minDwellFocusMs: number;
  minDwellInteractMs: number;
  alreadyVisited: boolean;
}

const VISITOR_TOKEN_STORAGE_KEY = 'v28_visitor_token';

export function getStoredVisitorToken(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(VISITOR_TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function readStoredVisitorToken(): string | null {
  return getStoredVisitorToken();
}

function saveStoredVisitorToken(token: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VISITOR_TOKEN_STORAGE_KEY, token);
    }
  } catch {
    // ignore storage errors
  }
}

export const v28VisitorApi = {
  async ensureSession(): Promise<V28VisitorSessionResponse> {
    const existing = readStoredVisitorToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (existing) headers['X-Visitor-Token'] = existing;
    const res = await fetch(`${API_BASE_URL}/api/v28/visitor/session`, {
      method: 'POST',
      headers,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Lỗi phiên khách tham quan (${res.status})`);
    }
    const data = body as V28VisitorSessionResponse;
    saveStoredVisitorToken(data.visitorToken);
    return data;
  },

  async getJourney(versionId: string): Promise<V28VisitorJourneyResponse> {
    let token = readStoredVisitorToken();
    if (!token) {
      const s = await v28VisitorApi.ensureSession();
      token = s.visitorToken;
    }
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    let res = await fetch(`${API_BASE_URL}/api/v28/visitor/journey${qs}`, {
      headers: { 'X-Visitor-Token': token },
    });
    if (res.status === 401) {
      const s = await v28VisitorApi.ensureSession();
      token = s.visitorToken;
      res = await fetch(`${API_BASE_URL}/api/v28/visitor/journey${qs}`, {
        headers: { 'X-Visitor-Token': token },
      });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Không thể tải tiến độ tham quan (${res.status})`);
    }
    return body as V28VisitorJourneyResponse;
  },

  async startVisitEngagement(input: {
    versionId: string;
    boothId: string;
  }): Promise<V28StartBoothEngagementResponse> {
    let token = readStoredVisitorToken();
    if (!token) {
      const s = await v28VisitorApi.ensureSession();
      token = s.visitorToken;
    }
    const res = await fetch(`${API_BASE_URL}/api/v28/visitor/visits/engage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Visitor-Token': token,
      },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Không thể khởi tạo phiên tương tác (${res.status})`);
    }
    return body as V28StartBoothEngagementResponse;
  },

  async recordVisit(input: {
    versionId: string;
    boothId: string;
    interactionType: V28VisitorInteractionType;
    engagementToken: string;
  }): Promise<V28RecordBoothVisitResponse> {
    let token = readStoredVisitorToken();
    if (!token) {
      const s = await v28VisitorApi.ensureSession();
      token = s.visitorToken;
    }
    const res = await fetch(`${API_BASE_URL}/api/v28/visitor/visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Visitor-Token': token,
      },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Không thể ghi nhận lượt tham quan (${res.status})`);
    }
    return body as V28RecordBoothVisitResponse;
  },
};

export type V28RedemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
export type V28RewardRiskLevel = 'low' | 'medium' | 'high';

export interface V28VisitorRedemptionSummary {
  id: string;
  redemptionCode: string;
  status: V28RedemptionStatus;
  recipientName: string;
  maskedContact: string;
  recordedUniqueBooths: number;
  requiredUniqueBooths: number;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  fulfilledAt: string | null;
}

export interface V28VisitorRewardStatusResponse {
  exhibitionId: string;
  versionId: string;
  totalBooths: number;
  recordedUniqueBooths: number;
  requiredUniqueBooths: number;
  rewardTitle: string;
  rewardDescription: string;
  policyEnabled: boolean;
  eligibleToSubmit: boolean;
  redemption: V28VisitorRedemptionSummary | null;
}

export interface V28AdminRedemptionListItem {
  id: string;
  redemptionCode: string;
  exhibitionId: string;
  versionId: string;
  recipientName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  recordedUniqueBooths: number;
  requiredUniqueBooths: number;
  status: V28RedemptionStatus;
  riskLevel: V28RewardRiskLevel;
  riskFlags: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  fulfilledBy: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface V28AdminRedemptionDetail extends V28AdminRedemptionListItem {
  visitDurationSec: number;
  visits: Array<{
    boothId: string;
    boothNumber: number;
    zoneCode: string;
    interactionType: string;
    firstVisitedAt: string;
  }>;
  auditLogs: Array<{
    id: number;
    action: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    note: string;
    createdAt: string;
  }>;
}

export interface V28AdminRewardPolicyResponse {
  exhibitionId: string;
  versionId: string;
  totalActiveBooths: number;
  policy: {
    versionId: string;
    requiredUniqueBooths: number;
    rewardTitle: string;
    rewardDescription: string;
    enabled: boolean;
  };
  policyExceedsActiveBooths: boolean;
}

export const v28RewardApi = {
  async getVisitorRewardStatus(versionId: string): Promise<V28VisitorRewardStatusResponse> {
    let token = readStoredVisitorToken();
    if (!token) {
      const s = await v28VisitorApi.ensureSession();
      token = s.visitorToken;
    }
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    const res = await fetch(`${API_BASE_URL}/api/v28/visitor/reward-status${qs}`, {
      headers: { 'X-Visitor-Token': token },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Không thể kiểm tra điều kiện nhận quà (${res.status})`);
    }
    return body as V28VisitorRewardStatusResponse;
  },

  getAdminRewardPolicy: (versionId?: string) => {
    const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
    return v28Request<V28AdminRewardPolicyResponse>(`/admin/reward-policy${qs}`, {
      cache: 'no-store',
    });
  },

  updateAdminRewardPolicy: (input: {
    versionId?: string;
    requiredUniqueBooths: number;
    enabled?: boolean;
  }) =>
    v28Request<V28AdminRewardPolicyResponse>('/admin/reward-policy', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  async submitRedemption(input: {
    versionId: string;
    recipientName: string;
    contactPhone?: string;
    contactEmail?: string;
    consentAccepted: boolean;
  }): Promise<V28VisitorRewardStatusResponse> {
    let token = readStoredVisitorToken();
    if (!token) {
      const s = await v28VisitorApi.ensureSession();
      token = s.visitorToken;
    }
    const res = await fetch(`${API_BASE_URL}/api/v28/visitor/redemptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Visitor-Token': token,
      },
      body: JSON.stringify(input),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((body as { error?: string }).error || `Không thể gửi yêu cầu nhận quà (${res.status})`);
    }
    return body as V28VisitorRewardStatusResponse;
  },

  listAdminRedemptions: (params?: { versionId?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.versionId) qs.set('versionId', params.versionId);
    if (params?.status && params.status !== 'ALL') qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return v28Request<{ redemptions: V28AdminRedemptionListItem[] }>(`/admin/redemptions${suffix}`);
  },

  getAdminRedemptionDetail: (id: string) =>
    v28Request<{ redemption: V28AdminRedemptionDetail }>(`/admin/redemptions/${encodeURIComponent(id)}`),

  reviewRedemption: (id: string, input: { decision: 'APPROVED' | 'REJECTED'; rejectionReason?: string }) =>
    v28Request<{ redemption: V28AdminRedemptionDetail }>(
      `/admin/redemptions/${encodeURIComponent(id)}/review`,
      { method: 'POST', body: JSON.stringify(input) }
    ),

  fulfillRedemption: (id: string, note?: string) =>
    v28Request<{ redemption: V28AdminRedemptionDetail }>(
      `/admin/redemptions/${encodeURIComponent(id)}/fulfill`,
      { method: 'POST', body: JSON.stringify({ note }) }
    ),

  setBoothVisibility: (exhibitionId: string, versionId: string, boothId: string, hidden: boolean) =>
    v28Request<{ version: V28ExhibitionVersionDetail; activeBoothCount: number }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/booths/${encodeURIComponent(boothId)}/visibility`,
      { method: 'PATCH', body: JSON.stringify({ hidden }) }
    ),

  removeEmptyBooths: (
    exhibitionId: string,
    versionId: string,
    input: { mode: 'single' | 'zone' | 'all'; boothId?: string; zoneId?: string }
  ) =>
    v28Request<{
      version: V28ExhibitionVersionDetail;
      removedBoothIds: string[];
      removedCount: number;
      removedZoneCodes: string[];
      compacted: boolean;
      remainingBoothCount: number;
      remainingZoneCount: number;
    }>(
      `/exhibitions/${encodeURIComponent(exhibitionId)}/versions/${encodeURIComponent(versionId)}/empty-booths/remove`,
      { method: 'POST', body: JSON.stringify(input) }
    ),
};
