import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  v28Api,
  type V28ArchetypeId,
  type V28ArchetypeSpec,
  type V28BoothPlacementView,
  type V28CompanyMismatchWarning,
  type V28ExhibitionSummary,
  type V28ExhibitionVersionDetail,
  type V28OwnerCompanyState,
  type V28WebsiteCheckpointInfo,
  type V28WebsiteDiscoveryStats,
  type V28WebsiteDiscoveryStatus,
} from '../../services/v28Api';
import { BoothInspectorPanel } from './BoothInspectorPanel';
import { V28SvgIcon } from '../v28/V28SvgIcon';
import {
  mapRawDiscoveredItemsToEditable,
  validatePreviewProductItem,
  WebsiteProductPreviewPanel,
  type EditableDiscoveredProductItem,
} from './WebsiteProductPreviewPanel';

const V28_SYNC_CHANNEL = 'v28-expo-sync';

function notifyV28WorldSync(reason: string): void {
  try {
    const ch = new BroadcastChannel(V28_SYNC_CHANNEL);
    ch.postMessage({ type: 'v28:updated', reason, ts: Date.now() });
    ch.close();
  } catch {
    // BroadcastChannel unsupported
  }
}

export interface ExhibitionConfiguratorProps {
  onDataChanged?: () => void;
  onOpenDynamicWorld?: () => void;
  onManageCatalog?: (companyId?: string) => void;
  onManageCompanies?: () => void;
  externalNavRequest?: { mode: 'dashboard' | 'wizard'; step?: 1 | 2 | 3 | 4; nonce: number };
  refreshNonce?: number;
  onActiveVersionChange?: (
    meta: {
      exhibitionId?: string;
      versionId?: string;
      status: string;
      zones: number;
      booths: number;
      ownerName?: string;
    } | null
  ) => void;
  onViewStateChange?: (mode: 'dashboard' | 'wizard', step: 1 | 2 | 3 | 4) => void;
}

export const ExhibitionConfigurator: React.FC<ExhibitionConfiguratorProps> = ({
  onDataChanged,
  onOpenDynamicWorld: _onOpenDynamicWorld,
  onManageCatalog,
  onManageCompanies,
  externalNavRequest,
  refreshNonce = 0,
  onActiveVersionChange,
  onViewStateChange,
}) => {
  const [viewMode, setViewMode] = useState<'dashboard' | 'wizard'>('dashboard');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    if (!externalNavRequest || externalNavRequest.nonce === 0) return;
    setViewMode(externalNavRequest.mode);
    if (externalNavRequest.step) {
      setWizardStep(externalNavRequest.step);
    }
  }, [externalNavRequest]);

  useEffect(() => {
    onViewStateChange?.(viewMode, wizardStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, wizardStep]);
  const [lastImportSummary, setLastImportSummary] = useState<{
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
      stopReason?:
        | 'TARGET_REACHED'
        | 'DISCOVERY_COMPLETE'
        | 'SOURCE_EXHAUSTED'
        | 'RESOURCE_LIMIT'
        | 'ACCESS_BLOCKED'
        | 'NETWORK_ERROR';
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
      coverageStatus:
        | 'IMPORT_COMPLETED'
        | 'DISCOVERY_COMPLETE'
        | 'TARGET_REACHED'
        | 'PARTIAL'
        | 'BLOCKED'
        | 'FAILED'
        | 'EMPTY';
      fullCatalogVerified: boolean;
    };
    batchStats?: {
      createdCount: number;
      updatedCount: number;
      skippedCount: number;
      failedCount: number;
    };
    zoneDecisions?: Array<{
      zoneId: string;
      zoneCode: string;
      displayName: string;
      categoryName: string;
      productCount: number;
      status: 'assigned_category' | 'merged_general' | 'unassigned_empty';
    }>;
    assignedSlots: number;
    boothsFilled: number;
    emptySlotsRemaining?: number;
    overflowCount: number;
    uncertainProducts: Array<{ productId: string; name: string; reason: string }>;
  } | null>(null);
  const [exhibitions, setExhibitions] = useState<V28ExhibitionSummary[]>([]);
  const [selectedExhId, setSelectedExhId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [versionDetail, setVersionDetail] = useState<V28ExhibitionVersionDetail | null>(null);
  const [ownerState, setOwnerState] = useState<V28OwnerCompanyState | null>(null);
  const [archetypes, setArchetypes] = useState<V28ArchetypeSpec[]>([]);

  // String-backed numeric inputs (allow clearing completely, typing/pasting freely, zero wheel jumps or focus loss!)
  const [zoneCountInput, setZoneCountInput] = useState<string>('10');
  const [boothsPerZoneInput, setBoothsPerZoneInput] = useState<string>('10');
  const [sourceMode, setSourceMode] = useState<'url' | 'excel'>('url');
  const [sourceWebsiteUrl, setSourceWebsiteUrl] = useState<string>('');
  const [discoveryMode, setDiscoveryMode] = useState<'full' | 'target'>('full');
  const [targetProductCountInput, setTargetProductCountInput] = useState<string>('15');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update'>('skip');
  const [previewingWebsite, setPreviewingWebsite] = useState<boolean>(false);
  const [resumingCheckpoint, setResumingCheckpoint] = useState<boolean>(false);
  const [savingCatalogOnly, setSavingCatalogOnly] = useState<boolean>(false);
  const [websitePreview, setWebsitePreview] = useState<{
    forUrl: string;
    discoveryMode: 'full' | 'target';
    targetCount?: number;
    siteUrl: string;
    entryPageType?: string;
    discoveryStatus: V28WebsiteDiscoveryStatus;
    discoveryStats?: V28WebsiteDiscoveryStats;
    checkpoint?: V28WebsiteCheckpointInfo;
    companyMismatchWarning?: V28CompanyMismatchWarning | null;
    pagesScanned: number;
    totalBytesRead?: number;
    note: string;
    detectedCompany?: NonNullable<typeof lastImportSummary>['detectedCompany'];
    coverageReport?: NonNullable<typeof lastImportSummary>['coverageReport'];
    items: EditableDiscoveredProductItem[];
  } | null>(null);
  const [sourceExcelFile, setSourceExcelFile] = useState<{ name: string; base64: string } | null>(null);
  const [autoAllocateProducts, setAutoAllocateProducts] = useState<boolean>(true);
  const [showCreateConfirm, setShowCreateConfirm] = useState<boolean>(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState<boolean>(false);
  const [confirmDeleteBooth, setConfirmDeleteBooth] = useState<V28BoothPlacementView | null>(null);
  const [creationProgress, setCreationProgress] = useState<{
    open: boolean;
    running: boolean;
    error: string;
    summary: string;
    steps: Array<{ key: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string }>;
  } | null>(null);
  const [selectedBooth, setSelectedBooth] = useState<V28BoothPlacementView | null>(null);
  const [renamingZoneCode, setRenamingZoneCode] = useState<string | null>(null);
  const [renameZoneInput, setRenameZoneInput] = useState<string>('');
  const [renameZoneError, setRenameZoneError] = useState<string>('');
  const [renamingZoneBusy, setRenamingZoneBusy] = useState<boolean>(false);
  const [switchingDraftBusy, setSwitchingDraftBusy] = useState<boolean>(false);

  const parsedZoneCount = /^\d+$/.test(zoneCountInput.trim()) ? Number(zoneCountInput.trim()) : NaN;
  const parsedBoothsPerZone = /^\d+$/.test(boothsPerZoneInput.trim()) ? Number(boothsPerZoneInput.trim()) : NaN;
  const computedTotalBooths =
    Number.isFinite(parsedZoneCount) && Number.isFinite(parsedBoothsPerZone)
      ? parsedZoneCount * parsedBoothsPerZone
      : 0;
  const isSourceValid = (() => {
    if (sourceMode === 'url') {
      const raw = sourceWebsiteUrl.trim();
      if (!raw) return false;
      try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }
    if (sourceMode === 'excel') {
      const fn = (sourceExcelFile?.name || '').toLowerCase();
      return Boolean(sourceExcelFile?.base64 && (fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')));
    }
    return false;
  })();

  const configValidationError = (() => {
    if (ownerState && ownerState.state !== 'bound') {
      return ownerState.state === 'selection_required'
        ? 'Vui lòng vào mục "Thông tin doanh nghiệp" để xác nhận 1 doanh nghiệp chủ sở hữu duy nhất trước khi tạo triển lãm.'
        : 'Chưa có doanh nghiệp chủ sở hữu. Vui lòng tạo thông tin doanh nghiệp trong mục "Thông tin doanh nghiệp" trước.';
    }
    if (!zoneCountInput.trim()) return 'Vui lòng nhập số khu triển lãm.';
    if (!Number.isFinite(parsedZoneCount) || parsedZoneCount < 1 || parsedZoneCount > 30) {
      return 'Số khu phải là số nguyên từ 1 đến 30.';
    }
    if (!boothsPerZoneInput.trim()) return 'Vui lòng nhập số gian hàng mỗi khu.';
    if (!Number.isFinite(parsedBoothsPerZone) || parsedBoothsPerZone < 1 || parsedBoothsPerZone > 50) {
      return 'Số gian mỗi khu phải là số nguyên từ 1 đến 50.';
    }
    if (computedTotalBooths > 300) {
      return `Tổng số gian (${computedTotalBooths}) vượt quá giới hạn an toàn 300 gian của hệ thống.`;
    }
    if (!isSourceValid) {
      return sourceMode === 'url'
        ? 'Bắt buộc nhập URL website hợp lệ (http:// hoặc https://) để lấy dữ liệu sản phẩm.'
        : 'Bắt buộc chọn tệp Excel hợp lệ (.xlsx, .xls hoặc .csv) để nhập dữ liệu sản phẩm.';
    }
    return '';
  })();

  // Search, Filter & Pagination for Zone-first Booth Management (Phase 4: '' = no zone selected yet)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterZoneCode, setFilterZoneCode] = useState<string>('');
  const [filterAssign, setFilterAssign] = useState<
    'all' | 'full_slots' | 'partial_slots' | 'empty_slots' | 'has_products' | 'assigned' | 'unassigned'
  >('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const loadExhibitions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [exhRes, ownerRes, archRes] = await Promise.all([
        v28Api.listExhibitions(),
        v28Api.getOwnerCompany(),
        v28Api.listArchetypes(),
      ]);
      setExhibitions(exhRes.exhibitions);
      setOwnerState(ownerRes);
      setArchetypes(archRes.archetypes);
      const first = exhRes.exhibitions[0];
      if (first) {
        setSelectedExhId((prev) => prev || first.id);
        // Single-version Admin: always load the active published exhibition directly
        const defaultVer =
          first.activeVersionId || first.versions[0]?.id || '';
        setSelectedVersionId((prev) => prev || defaultVer);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExhibitions();
  }, [loadExhibitions]);

  const loadVersionDetail = useCallback(async (exhId: string, verId: string) => {
    if (!exhId || !verId) return;
    setLoading(true);
    setError('');
    try {
      const { version } = await v28Api.getVersionDetail(exhId, verId);
      setVersionDetail(version);
      setSelectedBooth((prev) =>
        prev ? version.booths.find((b) => b.boothId === prev.boothId) || null : null
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedExhId && selectedVersionId) {
      loadVersionDetail(selectedExhId, selectedVersionId);
    }
  }, [selectedExhId, selectedVersionId, loadVersionDetail]);

  // V28-AUDIT-003: Reload fresh exhibitions, companies & versionDetail whenever returning from Products/Company sub-pages
  useEffect(() => {
    if (refreshNonce === 0) return;
    void loadExhibitions();
    if (selectedExhId && selectedVersionId) {
      void loadVersionDetail(selectedExhId, selectedVersionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  // V28-AUDIT-015: Sync currently viewed version status & counts up to Topbar & EmptyBoothManager
  useEffect(() => {
    if (!versionDetail) {
      onActiveVersionChange?.(null);
      return;
    }
    onActiveVersionChange?.({
      exhibitionId: versionDetail.exhibitionId,
      versionId: versionDetail.versionId,
      status: versionDetail.status,
      zones: versionDetail.zones.length,
      booths: versionDetail.booths.length,
      ownerName: versionDetail.ownerCompany?.name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionDetail]);

  // V28-AUDIT-019: Auto-select single zone ONLY when versionId changes
  useEffect(() => {
    if (!versionDetail) return;
    if (versionDetail.zones.length === 1) {
      setFilterZoneCode(versionDetail.zones[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionDetail?.versionId]);

  useEffect(() => {
    if (filterZoneCode && selectedBooth && selectedBooth.zoneCode !== filterZoneCode) {
      setSelectedBooth(null);
    }
  }, [filterZoneCode, selectedBooth]);

  const selectedExh = exhibitions.find((e) => e.id === selectedExhId) || null;
  const isDraft = Boolean(versionDetail && versionDetail.status !== 'archived');
  const activeSelectedZone = useMemo(
    () => (filterZoneCode ? versionDetail?.zones.find((z) => z.code === filterZoneCode) || null : null),
    [versionDetail, filterZoneCode]
  );

  // Dashboard statistics derived 100% from V28 DB
  const stats = useMemo(() => {
    const booths = versionDetail?.booths || [];
    const totalBooths = booths.length;
    const assignedCompanyCount = booths.filter((b) => Boolean(b.companyId)).length;
    const unassignedCompanyCount = totalBooths - assignedCompanyCount;
    const totalAssignedSlots = booths.reduce((sum, b) => sum + b.assignedSlotCount, 0);
    const boothsWithProducts = booths.filter((b) => b.assignedSlotCount > 0).length;
    return {
      totalBooths,
      zoneCount: versionDetail?.zones.length || 0,
      assignedCompanyCount,
      unassignedCompanyCount,
      totalAssignedSlots,
      totalSlotCapacity: totalBooths * 6,
      boothsWithProducts,
    };
  }, [versionDetail]);

  // Filtered & Paginated Booths (Phase 4: strictly scoped to selected Zone when filterZoneCode is set)
  const filteredBooths = useMemo(() => {
    const list = versionDetail?.booths || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((b) => {
      if (filterZoneCode && b.zoneCode !== filterZoneCode) return false;
      if (filterAssign === 'assigned' && !b.companyId) return false;
      if (filterAssign === 'unassigned' && b.companyId) return false;
      if (filterAssign === 'full_slots' && b.assignedSlotCount < 6) return false;
      if (filterAssign === 'partial_slots' && (b.assignedSlotCount === 0 || b.assignedSlotCount >= 6)) return false;
      if (filterAssign === 'has_products' && b.assignedSlotCount === 0) return false;
      if (filterAssign === 'empty_slots' && b.assignedSlotCount > 0) return false;
      if (!q) return true;
      return (
        b.boothName.toLowerCase().includes(q) ||
        b.boothId.toLowerCase().includes(q) ||
        (b.companyName || '').toLowerCase().includes(q) ||
        b.zoneName.toLowerCase().includes(q) ||
        b.archetypeLabel.toLowerCase().includes(q)
      );
    });
  }, [versionDetail, searchQuery, filterZoneCode, filterAssign]);

  const totalPages = Math.max(1, Math.ceil(filteredBooths.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedBooths = useMemo(
    () => filteredBooths.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredBooths, safePage, pageSize]
  );

  const handleSelectBooth = (b: V28BoothPlacementView) => {
    setSelectedBooth(b);
  };

  const handlePreviewWebsite = async () => {
    if (!ownerState?.company || !isSourceValid) return;
    const trimmedUrl = sourceWebsiteUrl.trim();
    const requiredProductCount = Math.max(1, Math.min(1800, computedTotalBooths * 6));
    setPreviewingWebsite(true);
    setError('');
    setMessage('');
    setShowCreateConfirm(false);
    try {
      const disc = await v28Api.discoverWebsiteProducts({
        companyId: ownerState.company.id,
        exhibitionId: selectedExhId || undefined,
        url: trimmedUrl,
        discoveryMode: 'full',
        targetCount: requiredProductCount,
        autoDetectCompany: false,
      });
      if (!disc.discoveredProducts || disc.discoveredProducts.length === 0) {
        setWebsitePreview(null);
        setError(
          disc.discoveryStats?.limitOrErrorReason ||
            disc.note ||
            'Không tìm thấy sản phẩm công khai có cấu trúc từ URL này. Bạn có thể nhập URL trang danh mục hoặc URL sản phẩm cụ thể.'
        );
        return;
      }
      setWebsitePreview({
        forUrl: trimmedUrl,
        discoveryMode: 'full',
        targetCount: requiredProductCount,
        siteUrl: disc.siteUrl,
        entryPageType: disc.entryPageType,
        discoveryStatus: disc.discoveryStatus,
        discoveryStats: disc.discoveryStats,
        checkpoint: disc.checkpoint,
        companyMismatchWarning: disc.companyMismatchWarning,
        pagesScanned: disc.pagesScanned,
        totalBytesRead: disc.totalBytesRead,
        note: disc.note,
        detectedCompany: disc.detectedCompany,
        coverageReport: disc.coverageReport,
        items: mapRawDiscoveredItemsToEditable(disc.discoveredProducts, 'wiz-prev'),
      });
    } catch (e) {
      setWebsitePreview(null);
      setError((e as Error).message || 'Không thể quét xem trước sản phẩm từ website.');
    } finally {
      setPreviewingWebsite(false);
    }
  };

  const handleResumeWebsiteCheckpoint = async () => {
    if (!ownerState?.company || !websitePreview?.checkpoint?.checkpointToken) return;
    const requiredProductCount = Math.max(1, Math.min(1800, computedTotalBooths * 6));
    setResumingCheckpoint(true);
    setError('');
    try {
      const disc = await v28Api.discoverWebsiteProducts({
        companyId: ownerState.company.id,
        exhibitionId: selectedExhId || undefined,
        url: websitePreview.forUrl,
        discoveryMode: 'full',
        targetCount: requiredProductCount,
        checkpointToken: websitePreview.checkpoint.checkpointToken,
        autoDetectCompany: false,
      });
      const moreEditable = mapRawDiscoveredItemsToEditable(
        disc.discoveredProducts || [],
        `wiz-b${disc.checkpoint?.batchIndex || 2}`
      );
      setWebsitePreview((prev) => {
        if (!prev) return prev;
        const existingUrls = new Set(prev.items.map((i) => i.sourceUrl.toLowerCase()));
        const dedupedNew = moreEditable.filter(
          (m) => !m.sourceUrl || !existingUrls.has(m.sourceUrl.toLowerCase())
        );
        const totalScanned = (prev.discoveryStats?.pagesScanned || prev.pagesScanned) + disc.pagesScanned;
        return {
          ...prev,
          discoveryStatus: disc.discoveryStatus,
          discoveryStats: disc.discoveryStats
            ? { ...disc.discoveryStats, pagesScanned: totalScanned }
            : prev.discoveryStats,
          checkpoint: disc.checkpoint,
          pagesScanned: totalScanned,
          note: disc.note,
          coverageReport: disc.coverageReport || prev.coverageReport,
          items: [...prev.items, ...dedupedNew],
        };
      });
    } catch (e) {
      setError((e as Error).message || 'Không thể tiếp tục quét batch kế tiếp từ checkpoint.');
    } finally {
      setResumingCheckpoint(false);
    }
  };

  const handleSavePreviewOnlyToCatalog = async () => {
    if (!ownerState?.company || !websitePreview) return;
    const chosenItems = websitePreview.items.filter(
      (item) => item.selected && validatePreviewProductItem(item) === null
    );
    if (chosenItems.length === 0) {
      setError('Vui lòng chọn ít nhất 1 sản phẩm hợp lệ để lưu vào Kho sản phẩm.');
      return;
    }
    setSavingCatalogOnly(true);
    setError('');
    setMessage('');
    try {
      const batchRes = await v28Api.batchCreateProducts({
        companyId: ownerState.company.id,
        exhibitionId: selectedExhId || undefined,
        replaceCompanyCatalog: true,
        duplicateStrategy: 'update',
        products: chosenItems.map((item) => ({
          name: item.name.trim(),
          sku: item.sku.trim(),
          price: item.priceStatus === 'listed' ? item.price : null,
          priceStatus: item.priceStatus,
          currency: item.priceStatus === 'listed' ? item.currency || 'VND' : '',
          category: item.category.trim(),
          description: item.description.trim(),
          images: item.images,
          videoUrl: item.videoUrl,
          modelUrl: item.modelUrl,
          sourceUrl: item.sourceUrl.trim(),
          inStock: item.inStock,
        })),
      });
      const savedUrls = new Set(chosenItems.map((c) => c.sourceUrl.toLowerCase()));
      setWebsitePreview((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                savedUrls.has(it.sourceUrl.toLowerCase())
                  ? { ...it, alreadyInCatalog: true, selected: false }
                  : it
              ),
            }
          : prev
      );
      setMessage(
        `Đã lưu sản phẩm vào Kho của "${ownerState.company.name}": Tạo mới ${batchRes.createdCount} · Cập nhật ${batchRes.updatedCount} · Bỏ qua (trùng) ${batchRes.skippedCount} · Thất bại ${batchRes.failedCount}. Bạn có thể bấm "Tạo không gian triển lãm" để phân bổ vào gian hàng.`
      );
      await loadExhibitions();
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message || 'Không thể lưu sản phẩm vào Kho.');
    } finally {
      setSavingCatalogOnly(false);
    }
  };

  const handleCreateDraft = async () => {
    if (!selectedExhId || configValidationError || creationProgress?.running) return;
    if (!ownerState?.company) {
      setError('Vui lòng thiết lập hoặc xác nhận 1 doanh nghiệp chủ sở hữu trước khi tạo triển lãm.');
      return;
    }
    setShowCreateConfirm(false);
    setViewMode('wizard');
    setWizardStep(2);
    setLastImportSummary(null);
    setLoading(true);
    setError('');
    setMessage('');

    const initSteps = [
      { key: 'validate', label: '1. Kiểm tra cấu hình khu & doanh nghiệp sở hữu', status: 'running' as const, detail: `${ownerState.company.name} · ${parsedZoneCount} khu × ${parsedBoothsPerZone} gian = ${computedTotalBooths} gian` },
      { key: 'source', label: '2. Lưu sản phẩm đã xác nhận xem trước', status: 'pending' as const, detail: sourceMode === 'url' ? sourceWebsiteUrl : sourceMode === 'excel' ? sourceExcelFile?.name : 'Sử dụng Catalog hiện có' },
      { key: 'categorize', label: '3. Phân tích danh mục & chuẩn bị phân khu chữ U', status: 'pending' as const },
      { key: 'layout', label: '4. Tạo bản Draft & bố cục 2D hai dãy chữ U', status: 'pending' as const },
      { key: 'allocate', label: '5. Tự động phân bổ sản phẩm vào 6 slot/gian', status: 'pending' as const },
    ];

    const setStepState = (
      key: string,
      status: 'pending' | 'running' | 'done' | 'error',
      detail?: string
    ) => {
      setCreationProgress((prev) =>
        prev
          ? {
              ...prev,
              steps: prev.steps.map((s) =>
                s.key === key ? { ...s, status, detail: detail ?? s.detail } : s
              ),
            }
          : prev
      );
    };

    setCreationProgress({
      open: true,
      running: true,
      error: '',
      summary: '',
      steps: initSteps,
    });

    try {
      // Step 1: Validate configuration & mandatory product source (URL or Excel)
      if (!isSourceValid) {
        throw new Error(
          sourceMode === 'url'
            ? 'Vui lòng nhập URL website doanh nghiệp hợp lệ (http:// hoặc https://).'
            : 'Vui lòng chọn tệp Excel (.xlsx, .xls hoặc .csv) hợp lệ.'
        );
      }
      setStepState('validate', 'done', `Hợp lệ: ${ownerState.company.name} (${parsedZoneCount} khu × ${parsedBoothsPerZone} gian)`);

      // Step 2: Persist confirmed preview products strictly into the bound single owner company
      setStepState('source', 'running');
      let importedCount = 0;
      const importedProductIds: string[] = [];
      const categoryHints: Record<string, string> = {};
      const targetCompanyId = ownerState.company.id;
      let detectedCompanyMeta: NonNullable<typeof lastImportSummary>['detectedCompany'] | undefined;
      let coverageReportMeta: NonNullable<typeof lastImportSummary>['coverageReport'] | undefined;

      let batchStatsMeta: NonNullable<typeof lastImportSummary>['batchStats'] | undefined;

      if (sourceMode === 'url') {
        const trimmedUrl = sourceWebsiteUrl.trim();
        const requiredProductCount = Math.max(1, Math.min(1800, computedTotalBooths * 6));
        let activePreview =
          websitePreview &&
          websitePreview.forUrl === trimmedUrl &&
          websitePreview.targetCount === requiredProductCount
            ? websitePreview
            : null;

        if (!activePreview) {
          const disc = await v28Api.discoverWebsiteProducts({
            companyId: targetCompanyId,
            exhibitionId: selectedExhId,
            url: trimmedUrl,
            discoveryMode: 'full',
            targetCount: requiredProductCount,
            autoDetectCompany: false,
          });
          if (!disc.discoveredProducts || disc.discoveredProducts.length === 0) {
            throw new Error(
              disc.discoveryStats?.limitOrErrorReason ||
                disc.note ||
                'Không tìm thấy sản phẩm công khai có cấu trúc từ URL này. Bạn có thể nhập URL trang danh mục hoặc URL sản phẩm cụ thể.'
            );
          }
          activePreview = {
            forUrl: trimmedUrl,
            discoveryMode: 'full',
            targetCount: requiredProductCount,
            siteUrl: disc.siteUrl,
            entryPageType: disc.entryPageType,
            discoveryStatus: disc.discoveryStatus,
            discoveryStats: disc.discoveryStats,
            checkpoint: disc.checkpoint,
            companyMismatchWarning: disc.companyMismatchWarning,
            pagesScanned: disc.pagesScanned,
            totalBytesRead: disc.totalBytesRead,
            note: disc.note,
            detectedCompany: disc.detectedCompany,
            coverageReport: disc.coverageReport,
            items: mapRawDiscoveredItemsToEditable(disc.discoveredProducts, 'wiz-auto'),
          };
        }

        detectedCompanyMeta = activePreview.detectedCompany;
        coverageReportMeta = activePreview.coverageReport;

        const invalidSelected = activePreview.items.find(
          (item) => item.selected && validatePreviewProductItem(item) !== null
        );
        if (invalidSelected) {
          throw new Error(
            `Sản phẩm "${invalidSelected.name || '(chưa có tên)'}" không hợp lệ: ${validatePreviewProductItem(invalidSelected)}`
          );
        }

        const chosenItems = activePreview.items.filter(
          (item) => item.selected && validatePreviewProductItem(item) === null
        );
        const batchPayload = chosenItems.map((item) => ({
          name: item.name.trim(),
          sku: item.sku.trim(),
          price: item.priceStatus === 'listed' ? item.price : null,
          priceStatus: item.priceStatus,
          currency: item.priceStatus === 'listed' ? item.currency || 'VND' : '',
          category: item.category.trim(),
          description: item.description.trim(),
          images: item.images,
          videoUrl: item.videoUrl,
          modelUrl: item.modelUrl,
          sourceUrl: item.sourceUrl.trim(),
          inStock: item.inStock,
        }));

        const skippedPreExisting = 0;

        if (batchPayload.length > 0) {
          const batchRes = await v28Api.batchCreateProducts({
            companyId: targetCompanyId,
            exhibitionId: selectedExhId,
            replaceCompanyCatalog: true,
            duplicateStrategy: 'update',
            products: batchPayload,
          });
          importedCount = batchRes.createdCount;
          batchStatsMeta = {
            createdCount: batchRes.createdCount,
            updatedCount: batchRes.updatedCount,
            skippedCount: batchRes.skippedCount + skippedPreExisting,
            failedCount: batchRes.failedCount,
          };
          batchRes.productIds.forEach((pid, idx) => {
            importedProductIds.push(pid);
            const cat = chosenItems[idx]?.category;
            if (cat) categoryHints[pid] = cat;
          });
        } else {
          batchStatsMeta = {
            createdCount: 0,
            updatedCount: 0,
            skippedCount: skippedPreExisting,
            failedCount: 0,
          };
        }

        const sizeLabel =
          typeof activePreview.totalBytesRead === 'number'
            ? ` · ${(activePreview.totalBytesRead / (1024 * 1024)).toFixed(2)} MB`
            : '';
        setStepState(
          'source',
          'done',
          `Quét ${activePreview.pagesScanned} trang${sizeLabel} · Tạo mới ${batchStatsMeta.createdCount}, cập nhật ${batchStatsMeta.updatedCount}, bỏ qua ${batchStatsMeta.skippedCount}, lỗi ${batchStatsMeta.failedCount}`
        );
        setWebsitePreview(null);
      } else if (sourceMode === 'excel' && sourceExcelFile) {
        if (!targetCompanyId) {
          throw new Error('Chưa có doanh nghiệp để gắn sản phẩm Excel.');
        }
        const prev = await v28Api.previewExcel({
          companyId: targetCompanyId,
          filename: sourceExcelFile.name,
          fileBase64: sourceExcelFile.base64,
        });
        const commit = await v28Api.commitExcel({
          previewToken: prev.previewToken,
          duplicateStrategy: 'skip',
        });
        importedCount = commit.report.createdCount;
        const refreshedCompProducts = await v28Api.listProducts({
          companyId: targetCompanyId,
          status: 'active',
          page: 1,
          limit: 200,
        });
        for (const p of refreshedCompProducts.items) {
          importedProductIds.push(p.id);
        }
        setStepState(
          'source',
          'done',
          `Excel: thêm ${commit.report.createdCount} SP, bỏ qua ${commit.report.skippedCount}, lỗi ${commit.report.failedCount}`
        );
      }

      // Step 3: Analyze categories
      setStepState('categorize', 'running');
      const catList = await v28Api.listCategories().catch(() => ({ categories: [] }));
      setStepState('categorize', 'done', `Áp dụng ${catList.categories.length} danh mục sản phẩm cho ${parsedZoneCount} khu chữ U`);

      // Step 4: Create Single-Business Draft & 2D U-shaped layout (ALL booths owned by ONE targetCompanyId!)
      setStepState('layout', 'running');
      const { version } = await v28Api.createDraftVersion(selectedExhId, {
        zoneCount: parsedZoneCount,
        boothsPerZone: parsedBoothsPerZone,
        targetBoothCount: computedTotalBooths,
        preferredZoneCapacity: parsedBoothsPerZone,
        baseVersionId: selectedVersionId || undefined,
        requireProductSource: true,
        productSource: sourceMode,
        sourceUrl: sourceMode === 'url' ? sourceWebsiteUrl.trim() : undefined,
        sourceFilename: sourceMode === 'excel' ? sourceExcelFile?.name : undefined,
        ownerCompanyId: targetCompanyId,
        cleanSlots: true,
      });
      setStepState('layout', 'done', `Draft v${version.versionNumber} (${version.zones.length} khu · ${version.booths.length} gian · ${version.hallWidth}×${version.hallDepth}m)`);

      // Step 5: Atomic backend auto-classification, category-zone mapping & slot allocation
      setStepState('allocate', 'running');
      let allocDetail = 'Giữ nguyên phân bổ hiện tại (gian chưa có SP được đánh dấu đỏ)';
      if (autoAllocateProducts) {
        const allocRes = await v28Api.autoAllocateDraftProducts(selectedExhId, version.versionId, {
          companyId: targetCompanyId,
          productIds: importedProductIds.length > 0 ? importedProductIds : undefined,
          categoryHints,
          organizeZonesByCategory: true,
        });
        setLastImportSummary({
          detectedCompany: detectedCompanyMeta,
          coverageReport: coverageReportMeta,
          batchStats: batchStatsMeta,
          zoneDecisions: allocRes.zoneDecisions,
          assignedSlots: allocRes.assignedSlots,
          boothsFilled: allocRes.boothsFilled,
          emptySlotsRemaining: allocRes.emptySlotsRemaining,
          overflowCount: allocRes.overflowProductIds.length,
          uncertainProducts: allocRes.uncertainProducts,
        });
        const notes: string[] = [
          `Đã tự động gán ${allocRes.assignedSlots} vị trí tại ${allocRes.boothsFilled} gian`,
        ];
        if (typeof allocRes.emptySlotsRemaining === 'number' && allocRes.emptySlotsRemaining > 0) {
          notes.push(`${allocRes.emptySlotsRemaining} slot còn trống`);
        }
        if (allocRes.overflowProductIds.length > 0) {
          notes.push(`${allocRes.overflowProductIds.length} SP dư giữ trong Catalog`);
        }
        if (allocRes.uncertainProducts.length > 0) {
          notes.push(`${allocRes.uncertainProducts.length} SP cần kiểm tra phân loại`);
        }
        allocDetail = notes.join(' · ');
      } else {
        setLastImportSummary({
          detectedCompany: detectedCompanyMeta,
          coverageReport: coverageReportMeta,
          batchStats: batchStatsMeta,
          assignedSlots: 0,
          boothsFilled: 0,
          emptySlotsRemaining: computedTotalBooths * 6,
          overflowCount: importedProductIds.length,
          uncertainProducts: [],
        });
      }
      setStepState('allocate', 'done', allocDetail);

      // Immediately activate as the single live exhibition (no separate Draft state)
      const { version: liveVersion } = await v28Api.saveAndPublishExhibition(selectedExhId, version.versionId);
      await loadExhibitions();
      setSelectedVersionId(liveVersion.versionId);
      setVersionDetail(liveVersion);
      setFilterZoneCode(liveVersion.zones.length === 1 ? liveVersion.zones[0].code : '');
      setPage(1);

      const withSp = liveVersion.booths.filter((b) => b.assignedSlotCount > 0).length;
      const emptySp = liveVersion.booths.length - withSp;
      const summaryText = `Đã tạo và đồng bộ triển lãm: ${liveVersion.zones.length} khu × ${parsedBoothsPerZone} gian = ${liveVersion.booths.length} gian (${withSp} gian có SP, ${emptySp} gian trống).`;
      setCreationProgress((prev) =>
        prev ? { ...prev, running: false, summary: summaryText } : prev
      );
      setMessage(summaryText);
      notifyV28WorldSync('exhibition_created');
      onDataChanged?.();
    } catch (e) {
      const errMsg = (e as Error).message || 'Có lỗi xảy ra khi tạo không gian triển lãm.';
      setError(errMsg);
      setCreationProgress((prev) =>
        prev
          ? {
              ...prev,
              running: false,
              error: errMsg,
              steps: prev.steps.map((s) => (s.status === 'running' ? { ...s, status: 'error', detail: errMsg } : s)),
            }
          : prev
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeleteBooth = async () => {
    if (!selectedExhId || !selectedVersionId || !confirmDeleteBooth) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.deleteDraftBooth(
        selectedExhId,
        selectedVersionId,
        confirmDeleteBooth.boothId,
        confirmDeleteBooth.assignedSlotCount > 0
      );
      setVersionDetail(version);
      if (selectedBooth?.boothId === confirmDeleteBooth.boothId) {
        setSelectedBooth(null);
      }
      setMessage(
        `Đã xóa gian hàng "${confirmDeleteBooth.boothName}" (${confirmDeleteBooth.boothId}) khỏi Draft v${version.versionNumber}. Sản phẩm trong Catalog & Doanh nghiệp vẫn được giữ nguyên. Bấm Publish để đồng bộ World 3D.`
      );
      setConfirmDeleteBooth(null);
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnsureWorkingDraft = useCallback(async (): Promise<V28ExhibitionVersionDetail | null> => {
    if (!selectedExhId) return null;
    if (versionDetail?.status === 'draft') return versionDetail;
    setSwitchingDraftBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await v28Api.ensureWorkingDraft(selectedExhId);
      const exhRes = await v28Api.listExhibitions().catch(() => null);
      if (exhRes?.exhibitions) {
        setExhibitions(exhRes.exhibitions);
      }
      setSelectedVersionId(res.version.versionId);
      setVersionDetail(res.version);
      setSelectedBooth((prev) =>
        prev ? res.version.booths.find((b) => b.boothId === prev.boothId) || null : null
      );
      setMessage(
        res.createdFromPublished
          ? `Đã sao chép nguyên vẹn bản Xuất bản sang Bản nháp v${res.version.versionNumber} để chỉnh sửa an toàn.`
          : `Đã chuyển sang Bản nháp v${res.version.versionNumber} đang làm dở.`
      );
      onDataChanged?.();
      return res.version;
    } catch (e) {
      const msg = (e as Error).message || 'Không thể mở bản Nháp làm việc.';
      setError(msg);
      throw e;
    } finally {
      setSwitchingDraftBusy(false);
    }
  }, [selectedExhId, versionDetail, onDataChanged]);

  const handleStartZoneRename = async (zone: { id: string; code: string; displayName: string }) => {
    setRenameZoneError('');
    setError('');
    setRenamingZoneCode(zone.code);
    setRenameZoneInput(zone.displayName);
  };

  const handleCancelZoneRename = () => {
    setRenamingZoneCode(null);
    setRenameZoneInput('');
    setRenameZoneError('');
  };

  const handleCommitZoneRename = async (zone: { id: string; code: string; displayName: string }) => {
    if (!selectedExhId || !selectedVersionId || !versionDetail) return;
    if (versionDetail.status === 'archived') {
      setRenameZoneError('Không thể đổi tên phân khu trên phiên bản đã lưu trữ.');
      return;
    }
    const cleaned = renameZoneInput.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 2) {
      setRenameZoneError('Tên phân khu phải có ít nhất 2 ký tự.');
      return;
    }
    if (cleaned.length > 60) {
      setRenameZoneError('Tên phân khu không được vượt quá 60 ký tự.');
      return;
    }
    const norm = cleaned.toLocaleLowerCase('vi-VN');
    const dup = versionDetail.zones.find(
      (z) =>
        z.code !== zone.code &&
        z.displayName.replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi-VN') === norm
    );
    if (dup) {
      setRenameZoneError(`Tên "${cleaned}" đã trùng với khu ${dup.code}.`);
      return;
    }
    if (cleaned === zone.displayName) {
      handleCancelZoneRename();
      return;
    }
    setRenamingZoneBusy(true);
    setRenameZoneError('');
    setError('');
    setMessage('');
    try {
      const { version: updatedVer } = await v28Api.updateDraftZone(selectedExhId, selectedVersionId, zone.id, {
        displayName: cleaned,
      });
      await loadExhibitions();
      setSelectedVersionId(updatedVer.versionId);
      setVersionDetail(updatedVer);
      setSelectedBooth((prev) =>
        prev ? updatedVer.booths.find((b) => b.boothId === prev.boothId) || null : null
      );
      handleCancelZoneRename();
      setMessage(`Đã lưu và đồng bộ tên khu ${zone.code} thành "${cleaned}" lên World 3D!`);
      notifyV28WorldSync('zone_renamed');
      onDataChanged?.();
    } catch (e) {
      setRenameZoneError((e as Error).message || 'Không thể lưu tên phân khu.');
    } finally {
      setRenamingZoneBusy(false);
    }
  };

  const handleUpdateBooth = async (
    boothId: string,
    patch: {
      archetypeId?: V28ArchetypeId;
      companyId?: string;
      positionX?: number;
      positionZ?: number;
      boothName?: string;
    }
  ) => {
    if (!selectedExhId || !selectedVersionId) return;
    setError('');
    setMessage('');
    try {
      const { version: updatedVer } = await v28Api.updateDraftBooth(selectedExhId, selectedVersionId, boothId, patch);
      await loadExhibitions();
      setSelectedVersionId(updatedVer.versionId);
      setVersionDetail(updatedVer);
      const updated = updatedVer.booths.find((b) => b.boothId === boothId) || null;
      setSelectedBooth(updated);
      setMessage('Đã lưu và đồng bộ cập nhật gian hàng lên World 3D!');
      notifyV28WorldSync('booth_updated');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };

  const handleAssignSlot = async (boothId: string, slotId: string, productId: string) => {
    setError('');
    setMessage('');
    if (!selectedExhId || !selectedVersionId) return;
    try {
      const { version: updatedVer } = !productId
        ? await v28Api.clearDraftSlot(selectedExhId, selectedVersionId, boothId, slotId)
        : await v28Api.assignDraftSlot(selectedExhId, selectedVersionId, boothId, slotId, productId);
      await loadExhibitions();
      setSelectedVersionId(updatedVer.versionId);
      setVersionDetail(updatedVer);
      setSelectedBooth((prev) =>
        prev ? updatedVer.booths.find((b) => b.boothId === prev.boothId) || null : null
      );
      setMessage(
        !productId
          ? `Đã gỡ sản phẩm khỏi vị trí ${slotId} và đồng bộ World 3D!`
          : `Đã gắn sản phẩm vào vị trí ${slotId} và đồng bộ World 3D!`
      );
      notifyV28WorldSync('slot_updated');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  };

  const handleManualAutoAllocateDraft = async () => {
    if (!selectedExhId || !selectedVersionId || versionDetail?.status !== 'draft') return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const allocRes = await v28Api.autoAllocateDraftProducts(selectedExhId, selectedVersionId, {
        companyId: ownerState?.company?.id || versionDetail.ownerCompanyId || undefined,
        organizeZonesByCategory: true,
      });
      setVersionDetail(allocRes.version);
      setSelectedBooth((prev) =>
        prev ? allocRes.version.booths.find((b) => b.boothId === prev.boothId) || null : null
      );
      setMessage(
        `Đã tự động phân bổ thêm ${allocRes.assignedSlots} SP từ Kho vào các slot trống (giữ nguyên slot đã gán tay · còn ${allocRes.emptySlotsRemaining ?? 0} slot trống · ${allocRes.overflowProductIds.length} SP dư trong Kho).`
      );
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message || 'Không thể tự động phân bổ sản phẩm.');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedExhId || !selectedVersionId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.saveAndPublishExhibition(selectedExhId, selectedVersionId);
      await loadExhibitions();
      setSelectedVersionId(version.versionId);
      setVersionDetail(version);
      setMessage(`Đã lưu và đồng bộ triển lãm (${version.booths.length} gian) lên World 3D theo thời gian thực!`);
      notifyV28WorldSync('version_published');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (targetVerId: string) => {
    if (!selectedExhId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.rollbackVersion(selectedExhId, targetVerId);
      await loadExhibitions();
      setSelectedVersionId(version.versionId);
      setVersionDetail(version);
      setMessage(`Đã Rollback về phiên bản v${version.versionNumber} — World V28 đã tự đồng bộ!`);
      notifyV28WorldSync('version_rollback');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {/* Focused Dashboard Overview: Compact Owner + Version Bar + Minimalist 4 KPIs */}
      {viewMode === 'dashboard' && (
        <>
          <div
            className="v28-card"
            style={{
              padding: '14px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 240px' }}>
              {(ownerState?.company?.logoUrl || versionDetail?.ownerCompany?.logoUrl) ? (
                <img
                  src={ownerState?.company?.logoUrl || versionDetail?.ownerCompany?.logoUrl || ''}
                  alt={ownerState?.company?.name || versionDetail?.ownerCompany?.name || ''}
                  style={{ width: 42, height: 42, borderRadius: 9, objectFit: 'contain', background: '#f8fafc', border: '1px solid rgba(17,24,39,0.1)', padding: 4, flexShrink: 0 }}
                />
              ) : (
                <div style={{ width: 42, height: 42, borderRadius: 9, background: '#e0f2fe', color: '#0369a1', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                  {(ownerState?.company?.name || versionDetail?.ownerCompany?.name || 'E').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#526071' }}>Doanh nghiệp hiện tại</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#111827',
                    letterSpacing: '-0.02em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ownerState?.company?.name ||
                    versionDetail?.ownerCompany?.name ||
                    (ownerState?.state === 'selection_required'
                      ? 'Cần xác nhận doanh nghiệp sở hữu'
                      : 'Chưa thiết lập doanh nghiệp')}
                </div>
                {(ownerState?.company?.contactUrl || versionDetail?.ownerCompany?.contactUrl) && (
                  <div style={{ fontSize: 12, color: '#0284c7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ownerState?.company?.contactUrl || versionDetail?.ownerCompany?.contactUrl}
                  </div>
                )}
              </div>
            </div>

            {/* Phase 4: Single Current Exhibition Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }} data-testid="v28-single-exhibition-actions">
              {versionDetail?.status === 'draft' && (
                <button
                  type="button"
                  data-testid="v28-save-and-publish-btn"
                  className="v28-btn v28-btn--primary"
                  disabled={loading || !versionDetail.validation.valid}
                  onClick={() => void handlePublish()}
                  style={{ minHeight: 34, padding: '0 13px', fontSize: 12, background: '#059669' }}
                >
                  {loading ? 'Đang lưu...' : 'Đồng bộ World 3D'}
                </button>
              )}
              {onManageCompanies && (
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={onManageCompanies}
                  style={{ minHeight: 34, padding: '0 11px', fontSize: 12 }}
                >
                  {ownerState?.state === 'bound' ? 'Doanh nghiệp' : 'Thiết lập DN'}
                </button>
              )}
              {onManageCatalog && (
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={() => onManageCatalog(versionDetail?.ownerCompanyId || undefined)}
                  style={{ minHeight: 34, padding: '0 11px', fontSize: 12 }}
                >
                  Kho sản phẩm
                </button>
              )}
              {versionDetail && (
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={() => {
                    setViewMode('wizard');
                    setWizardStep(3);
                  }}
                  style={{ minHeight: 34, padding: '0 11px', fontSize: 12 }}
                >
                  Sơ đồ 2D
                </button>
              )}
            </div>
          </div>

          <div className="v28-kpi-grid">
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Tổng số khu</div>
              <div className="v28-kpi-value">{stats.zoneCount}</div>
            </div>
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Tổng số gian</div>
              <div className="v28-kpi-value">{stats.totalBooths}</div>
            </div>
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Sản phẩm đã gắn / tổng slot</div>
              <div className="v28-kpi-value" style={{ color: '#0284c7' }}>
                {stats.totalAssignedSlots} / {stats.totalSlotCapacity}
              </div>
            </div>
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Gian trống</div>
              <div className="v28-kpi-value" style={{ color: stats.totalBooths - stats.boothsWithProducts > 0 ? '#dc2626' : '#059669' }}>
                {Math.max(0, stats.totalBooths - stats.boothsWithProducts)}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Compact 4-Step Wizard Stepper Navigation */}
      {viewMode === 'wizard' && (
        <div
          className="v28-card"
          style={{
            padding: '10px 14px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {[
              { step: 1 as const, label: '1. Cấu hình' },
              { step: 2 as const, label: '2. Sản phẩm' },
              { step: 3 as const, label: '3. Bố trí' },
              { step: 4 as const, label: '4. Xuất bản' },
            ].map((item) => {
              const active = wizardStep === item.step;
              const done = wizardStep > item.step;
              const blockedByValidation =
                Boolean(creationProgress?.running) ||
                (wizardStep === 1 && item.step > 1 && Boolean(configValidationError));
              return (
                <button
                  key={item.step}
                  type="button"
                  disabled={blockedByValidation}
                  onClick={() => {
                    if (!blockedByValidation) setWizardStep(item.step);
                  }}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 7,
                    border: active ? '1.5px solid #0284c7' : '1px solid rgba(17,24,39,0.12)',
                    background: active ? '#e0f2fe' : done ? '#ecfdf5' : '#f8fafc',
                    color: active ? '#0369a1' : done ? '#059669' : '#526071',
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: blockedByValidation ? 'not-allowed' : 'pointer',
                    opacity: blockedByValidation ? 0.55 : 1,
                  }}
                >
                  {done ? '✓ ' : ''}
                  {item.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {wizardStep > 1 && (
              <button
                type="button"
                className="v28-btn v28-btn--secondary"
                onClick={() => setWizardStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
                style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }}
              >
                ← Quay lại
              </button>
            )}
            {wizardStep < 4 && (
              <button
                type="button"
                className="v28-btn v28-btn--primary"
                disabled={wizardStep === 1 && Boolean(configValidationError)}
                onClick={() => setWizardStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))}
                style={{
                  minHeight: 32,
                  padding: '0 12px',
                  fontSize: 12,
                  opacity: wizardStep === 1 && configValidationError ? 0.5 : 1,
                }}
              >
                Tiếp tục →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Wizard Step 2 Summary Card (Company Detection + Coverage Report + Category Zone Decisions) */}
      {viewMode === 'wizard' && wizardStep === 2 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 18, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: 15, color: '#0f172a' }}>📥 Bước 2: Kết quả Import, Nhận diện Doanh nghiệp &amp; Phân khu Danh mục</strong>
          {!lastImportSummary && !creationProgress ? (
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Chưa chạy import ở phiên này. Quay lại <strong>Bước 1</strong> để nhập URL/Excel và bấm <strong>Tạo không gian triển lãm</strong>.
            </div>
          ) : (
            <>
              {lastImportSummary?.detectedCompany && (
                <div style={{ padding: 10, borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 13 }}>
                  <strong>🏢 Doanh nghiệp nguồn (Seller):</strong>{' '}
                  {lastImportSummary.detectedCompany.companyName || '(Chưa xác minh — cần Admin xác nhận)'} ·{' '}
                  <code>{lastImportSummary.detectedCompany.canonicalDomain}</code> ·{' '}
                  <span style={{ fontWeight: 700, color: lastImportSummary.detectedCompany.confidence === 'verified' ? '#047857' : '#b45309' }}>
                    {lastImportSummary.detectedCompany.confidence === 'verified' ? 'Đã xác minh' : 'Cần xác nhận'}
                  </span>
                </div>
              )}
              {lastImportSummary?.coverageReport && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="v28-kpi-grid">
                    <div className="v28-kpi-card">
                      <div className="v28-kpi-label">Đã lưu vào Kho</div>
                      <div className="v28-kpi-value" style={{ color: '#0284c7' }}>
                        {lastImportSummary.batchStats
                          ? lastImportSummary.batchStats.createdCount
                          : lastImportSummary.coverageReport.extractedValidCount}
                      </div>
                      <div className="v28-kpi-sub">
                        {lastImportSummary.batchStats
                          ? `Cập nhật ${lastImportSummary.batchStats.updatedCount} · Bỏ qua ${lastImportSummary.batchStats.skippedCount} · Lỗi ${lastImportSummary.batchStats.failedCount}`
                          : `${lastImportSummary.coverageReport.newCount} mới · ${lastImportSummary.coverageReport.duplicateCount} đã có`}
                      </div>
                    </div>
                    <div className="v28-kpi-card">
                      <div className="v28-kpi-label">Đã phân bổ vào gian</div>
                      <div className="v28-kpi-value" style={{ color: '#059669' }}>{lastImportSummary.assignedSlots}</div>
                      <div className="v28-kpi-sub">Trên {lastImportSummary.boothsFilled} gian hàng</div>
                    </div>
                    <div className="v28-kpi-card">
                      <div className="v28-kpi-label">Slot còn trống</div>
                      <div className="v28-kpi-value">
                        {lastImportSummary.emptySlotsRemaining ??
                          Math.max(0, stats.totalSlotCapacity - stats.totalAssignedSlots)}
                      </div>
                      <div className="v28-kpi-sub">SP dư trong Kho: {lastImportSummary.overflowCount}</div>
                    </div>
                  </div>
                  <details className="v28-advanced-details">
                    <summary>Chi tiết nâng cao (Thông số quét nguồn)</summary>
                    <div style={{ marginTop: 8 }}>
                      Trạng thái: <strong>{lastImportSummary.coverageReport.coverageStatus}</strong> · Đã quét{' '}
                      <strong>{lastImportSummary.coverageReport.pagesScanned}</strong> trang · Phát hiện{' '}
                      <strong>{lastImportSummary.coverageReport.productUrlsDiscovered}</strong> URL · Lỗi:{' '}
                      <strong>{lastImportSummary.coverageReport.errorCount}</strong>
                      {lastImportSummary.coverageReport.stopReasons.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          Giới hạn dừng an toàn: {lastImportSummary.coverageReport.stopReasons.join(', ')}
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              )}
              {lastImportSummary?.zoneDecisions && lastImportSummary.zoneDecisions.length > 0 && (
                <div style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: 12.5 }}>
                  <strong>🧭 Quyết định phân khu theo Danh mục sản phẩm:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {lastImportSummary.zoneDecisions.map((zd) => (
                      <span
                        key={zd.zoneId}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          background: zd.status === 'unassigned_empty' ? '#fef2f2' : '#ecfdf5',
                          border: `1px solid ${zd.status === 'unassigned_empty' ? '#fecaca' : '#a7f3d0'}`,
                          color: zd.status === 'unassigned_empty' ? '#b91c1c' : '#065f46',
                          fontWeight: 600,
                        }}
                      >
                        {zd.displayName} ({zd.productCount} SP)
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  Tiếp tục tới Bước 3: Preview 2D →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Wizard Step 4: Final Pre-Publish Review & Confirmation */}
      {viewMode === 'wizard' && wizardStep === 4 && versionDetail && (() => {
        const distinctOwnerIds = Array.from(
          new Set(versionDetail.booths.map((b) => b.companyId).filter(Boolean))
        );
        const hasOwnerConflict = distinctOwnerIds.length > 1;
        const canPublish = versionDetail.validation.valid && !hasOwnerConflict;
        return (
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, border: '1.5px solid #10b981', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: 16, color: '#065f46' }}>🚀 Bước 4: Xác nhận &amp; Publish lên World V28</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, fontSize: 13 }}>
            <div style={{ padding: 10, borderRadius: 8, background: hasOwnerConflict ? '#fef2f2' : '#f0f9ff', border: `1px solid ${hasOwnerConflict ? '#fecaca' : '#bae6fd'}` }}>
              Doanh nghiệp sở hữu:{' '}
              <strong style={{ color: hasOwnerConflict ? '#b91c1c' : '#0369a1' }}>
                {hasOwnerConflict
                  ? `⚠️ Xung đột (${distinctOwnerIds.length} doanh nghiệp)`
                  : versionDetail.ownerCompany?.name || versionDetail.booths[0]?.companyName || 'Chưa xác định'}
              </strong>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              Tổng khu danh mục: <strong>{versionDetail.zones.length}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              Tổng gian: <strong>{versionDetail.booths.length}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              Slot đã phân bổ: <strong>{stats.totalAssignedSlots}</strong>
            </div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
              Gian trống: <strong>{Math.max(0, stats.totalBooths - stats.boothsWithProducts)}</strong>
            </div>
            {lastImportSummary && (
              <div style={{ padding: 10, borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                SP dư trong Catalog: <strong>{lastImportSummary.overflowCount}</strong>
              </div>
            )}
          </div>
          {hasOwnerConflict && (
            <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
              ⚠️ Vi phạm mô hình triển lãm 1 doanh nghiệp: Bản Draft đang chứa gian hàng của {distinctOwnerIds.length} doanh nghiệp khác nhau. Vui lòng tạo lại bản Draft từ 1 doanh nghiệp duy nhất trước khi Publish.
            </div>
          )}
          {!versionDetail.validation.valid && (
            <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>
              ⚠️ Layout có lỗi cần sửa trước khi Publish: {versionDetail.validation.errors.join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {versionDetail.status === 'draft' ? (
              <button
                type="button"
                disabled={loading || !canPublish}
                onClick={() => void handlePublish()}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: canPublish ? '#059669' : '#94a3b8',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: canPublish ? 'pointer' : 'not-allowed',
                }}
              >
                ✅ Xác nhận Publish v{versionDetail.versionNumber} lên World V28
              </button>
            ) : (
              <div style={{ fontSize: 13, color: '#047857', fontWeight: 700 }}>
                ✅ Phiên bản v{versionDetail.versionNumber} đã được Publish.
              </div>
            )}
            <button
              type="button"
              onClick={() => setWizardStep(3)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
            >
              ← Quay lại Preview 2D
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 600, cursor: 'pointer' }}
            >
              Về Dashboard
            </button>
          </div>
        </div>
        );
      })()}

      {/* Step 1: Streamlined Single-Row Creator Bar (Visible in Wizard Step 1) */}
      {viewMode === 'wizard' && wizardStep === 1 && (
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: 18,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
            Số khu (1–30)
            <input
              type="text"
              inputMode="numeric"
              aria-label="Số khu triển lãm"
              value={zoneCountInput}
              onChange={(e) => {
                setZoneCountInput(e.target.value.replace(/[^\d]/g, ''));
                setShowCreateConfirm(false);
                setWebsitePreview(null);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="VD: 10"
              style={{
                width: 96,
                padding: '9px 10px',
                borderRadius: 10,
                border: configValidationError && !Number.isFinite(parsedZoneCount) ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                fontSize: 14,
                fontWeight: 700,
              }}
            />
          </label>

          <span style={{ fontSize: 16, fontWeight: 800, color: '#64748b', paddingBottom: 10 }}>×</span>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
            Số gian mỗi khu (1–50)
            <input
              type="text"
              inputMode="numeric"
              aria-label="Số gian hàng mỗi khu"
              value={boothsPerZoneInput}
              onChange={(e) => {
                setBoothsPerZoneInput(e.target.value.replace(/[^\d]/g, ''));
                setShowCreateConfirm(false);
                setWebsitePreview(null);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="VD: 10"
              style={{
                width: 112,
                padding: '9px 10px',
                borderRadius: 10,
                border: configValidationError && !Number.isFinite(parsedBoothsPerZone) ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                fontSize: 14,
                fontWeight: 700,
              }}
            />
          </label>

          {/* Mandatory Product Source (URL Website only) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 320px', minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>Nguồn sản phẩm (bắt buộc):</span>
              <span
                style={{
                  padding: '3px 9px',
                  borderRadius: 7,
                  border: '1.5px solid #0ea5e9',
                  background: '#e0f2fe',
                  color: '#0369a1',
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                🔗 URL Website
              </span>
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 7,
                    background: ownerState?.state === 'bound' ? '#f0f9ff' : '#fef3c7',
                    border: `1px solid ${ownerState?.state === 'bound' ? '#bae6fd' : '#fde68a'}`,
                    color: ownerState?.state === 'bound' ? '#0369a1' : '#92400e',
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  {ownerState?.state === 'bound' && ownerState.company
                    ? `🏢 Chủ sở hữu: ${ownerState.company.name}`
                    : '⚠️ Chưa xác định doanh nghiệp chủ sở hữu'}
                </span>
                {ownerState && ownerState.state !== 'bound' && onManageCompanies && (
                  <button
                    type="button"
                    onClick={onManageCompanies}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 7,
                      border: '1px solid #0284c7',
                      background: '#fff',
                      color: '#0369a1',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Thiết lập doanh nghiệp →
                  </button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="url"
                aria-label="URL Website doanh nghiệp"
                value={sourceWebsiteUrl}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setSourceWebsiteUrl(nextVal);
                  setShowCreateConfirm(false);
                  if (websitePreview && websitePreview.forUrl !== nextVal.trim()) {
                    setWebsitePreview(null);
                  }
                }}
                placeholder="Nhập URL trang chủ (VD: http://nongsanviet.pro/), danh mục hoặc chi tiết SP..."
                style={{
                  flex: '1 1 240px',
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: !isSourceValid ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                  fontSize: 13.5,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const requiredProductCount = Math.max(1, Math.min(1800, computedTotalBooths * 6));
              if (
                !websitePreview ||
                websitePreview.forUrl !== sourceWebsiteUrl.trim() ||
                websitePreview.targetCount !== requiredProductCount
              ) {
                void handlePreviewWebsite();
                return;
              }
              setShowCreateConfirm(true);
            }}
            disabled={loading || previewingWebsite || Boolean(configValidationError)}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: configValidationError ? '#94a3b8' : '#0f172a',
              color: '#fff',
              cursor: configValidationError ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              fontSize: 13.5,
              whiteSpace: 'nowrap',
            }}
          >
            {previewingWebsite
              ? '⏳ Đang quét xem trước...'
              : !websitePreview || websitePreview.forUrl !== sourceWebsiteUrl.trim()
                ? '🔍 Xem trước SP & Tạo triển lãm'
                : '🏛️ Tạo không gian triển lãm'}
          </button>
        </div>

        {/* Secondary Info Row: Expected Total Booths + Auto-Allocate Toggle + Draft Preview / Publish Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                color: '#0369a1',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Tổng dự kiến: <strong style={{ fontSize: 15 }}>{computedTotalBooths}</strong> gian hàng (tối đa{' '}
              <strong>{computedTotalBooths * 6}</strong> SP)
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#334155' }}>
              <input
                type="checkbox"
                checked={autoAllocateProducts}
                onChange={(e) => setAutoAllocateProducts(e.target.checked)}
              />
              Tự động phân loại &amp; phân bổ tối đa 6 SP/gian
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {versionDetail?.status === 'draft' && (
              <>
                <a
                  href={`/?world=dynamic&previewVersionId=${encodeURIComponent(versionDetail.versionId)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    background: '#0284c7',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  👁️ Xem trước 3D Draft
                </a>
                <button
                  type="button"
                  onClick={() => setShowPublishConfirm(true)}
                  disabled={
                    loading ||
                    !versionDetail.validation.valid ||
                    new Set(versionDetail.booths.map((b) => b.companyId).filter(Boolean)).size > 1
                  }
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background:
                      versionDetail.validation.valid &&
                      new Set(versionDetail.booths.map((b) => b.companyId).filter(Boolean)).size <= 1
                        ? '#10b981'
                        : '#94a3b8',
                    color: '#fff',
                    cursor:
                      versionDetail.validation.valid &&
                      new Set(versionDetail.booths.map((b) => b.companyId).filter(Boolean)).size <= 1
                        ? 'pointer'
                        : 'not-allowed',
                    fontWeight: 700,
                  }}
                >
                  🚀 Publish v{versionDetail.versionNumber}
                </button>
              </>
            )}
          </div>
        </div>

        {configValidationError && (
          <div style={{ padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            ⚠️ {configValidationError}
          </div>
        )}

        {showPublishConfirm && versionDetail?.status === 'draft' && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#ecfdf5',
              border: '1.5px solid #10b981',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46' }}>
              🚀 Xác nhận Publish phiên bản Draft v{versionDetail.versionNumber}?
            </div>
            <div style={{ fontSize: 13, color: '#064e3b' }}>
              • Tổng số gian: <strong>{versionDetail.booths.length}</strong> ({stats.boothsWithProducts} gian có sản phẩm,{' '}
              <strong style={{ color: '#b91c1c' }}>{versionDetail.booths.length - stats.boothsWithProducts}</strong> gian trống).
              <br />• World V28 công khai sẽ chuyển sang phiên bản này ngay sau khi xác nhận (nếu lỗi, bản Published cũ vẫn được giữ nguyên).
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setShowPublishConfirm(false);
                  void handlePublish();
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#059669',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✅ Xác nhận Publish
              </button>
              <button
                type="button"
                onClick={() => setShowPublishConfirm(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {previewingWebsite && (
          <div
            data-testid="v28-wizard-crawl-progress"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: '#eff6ff',
              border: '1px solid #93c5fd',
              color: '#1e3a8a',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⏳ Đang khám phá danh mục, trang sản phẩm &amp; trích xuất dữ liệu từ website (chế độ chỉ đọc — chưa ghi vào Database)...
          </div>
        )}

        {websitePreview && sourceMode === 'url' && websitePreview.forUrl === sourceWebsiteUrl.trim() && (() => {
          const validNewSelectedCount = websitePreview.items.filter(
            (i) =>
              i.selected &&
              validatePreviewProductItem(i) === null &&
              (duplicateStrategy === 'update' || !i.alreadyInCatalog)
          ).length;
          const existingCatalogCount = websitePreview.items.filter((i) => i.alreadyInCatalog).length;
          const confirmBtnLabel =
            validNewSelectedCount > 0
              ? `✅ Xác nhận chọn ${validNewSelectedCount} SP & Tạo không gian triển lãm`
              : existingCatalogCount > 0
                ? `🏛️ Tạo không gian triển lãm từ ${existingCatalogCount} SP đã có trong Kho`
                : '✅ Xác nhận chọn SP & Tạo không gian triển lãm';

          return (
            <WebsiteProductPreviewPanel
              ownerCompanyName={ownerState?.company?.name || 'Doanh nghiệp hiện tại'}
              siteUrl={websitePreview.siteUrl}
              entryPageType={websitePreview.entryPageType}
              discoveryStatus={websitePreview.discoveryStatus}
              discoveryStats={websitePreview.discoveryStats}
              checkpoint={websitePreview.checkpoint}
              companyMismatchWarning={websitePreview.companyMismatchWarning}
              note={websitePreview.note}
              items={websitePreview.items}
              duplicateStrategy={duplicateStrategy}
              onChangeDuplicateStrategy={setDuplicateStrategy}
              onChangeItems={(next) =>
                setWebsitePreview((prev) => (prev ? { ...prev, items: next } : prev))
              }
              onResumeCheckpoint={() => void handleResumeWebsiteCheckpoint()}
              resumingCheckpoint={resumingCheckpoint}
              onConfirmSave={() => setShowCreateConfirm(true)}
              confirmLabel={confirmBtnLabel}
              secondaryActionLabel={
                validNewSelectedCount > 0
                  ? savingCatalogOnly
                    ? '⏳ Đang lưu vào Kho...'
                    : `💾 Chỉ lưu ${validNewSelectedCount} SP vào Kho sản phẩm`
                  : undefined
              }
              onSecondaryAction={
                validNewSelectedCount > 0 ? () => void handleSavePreviewOnlyToCatalog() : undefined
              }
              allowConfirmWithZeroNewWhenCatalogHasExisting
              onCancel={() => setWebsitePreview(null)}
              busy={loading || savingCatalogOnly}
            />
          );
        })()}

        {showCreateConfirm && !configValidationError && (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1.5px solid #0ea5e9',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              📋 Xác nhận cấu hình trước khi tạo không gian triển lãm
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, fontSize: 13 }}>
              <div>• Số khu chữ U: <strong>{parsedZoneCount} khu</strong></div>
              <div>• Số gian / khu: <strong>{parsedBoothsPerZone} gian</strong></div>
              <div>• Tổng số gian: <strong>{computedTotalBooths} gian</strong></div>
              <div>• Bố cục: <strong>{parsedZoneCount === 1 ? '1 chữ U trung tâm' : `${Math.ceil(parsedZoneCount / 2)} Trái + ${parsedZoneCount - Math.ceil(parsedZoneCount / 2)} Phải đối diện`}</strong></div>
              <div>• Gian đang có SP: <strong>{stats.boothsWithProducts} gian</strong></div>
              <div>• Gian trống dự kiến: <strong style={{ color: '#dc2626' }}>{Math.max(0, computedTotalBooths - stats.boothsWithProducts)} gian</strong></div>
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              Lưu ý: Hệ thống sẽ tạo và áp dụng trực tiếp vào không gian triển lãm 3D hiện tại.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleCreateDraft}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#0ea5e9',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {loading ? '⏳ Đang tạo...' : `✅ Xác nhận Tạo triển lãm (${parsedZoneCount} khu × ${parsedBoothsPerZone} gian)`}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateConfirm(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <V28SvgIcon name="warning" size={15} />
            <span>{error}</span>
          </span>
          <button
            type="button"
            onClick={() => setError('')}
            aria-label="Đóng thông báo lỗi"
            style={{ border: 'none', background: 'transparent', color: '#b91c1c', cursor: 'pointer', fontWeight: 700, padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>
      )}
      {message && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#ecfdf5',
            color: '#047857',
            border: '1px solid #a7f3d0',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <V28SvgIcon name="check" size={15} />
            <span>{message}</span>
          </span>
          <button
            type="button"
            onClick={() => setMessage('')}
            aria-label="Đóng thông báo"
            style={{ border: 'none', background: 'transparent', color: '#047857', cursor: 'pointer', fontWeight: 700, padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Split: Spacious 2D Floorplan Left + Unified BoothInspectorPanel Right (Wizard Step 3 — Bố trí) */}
      {versionDetail && viewMode === 'wizard' && wizardStep === 3 && (
        <div className="v28-preview-split">
          {/* 2D Interactive SVG Floorplan + Compact Zone Manager */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div className="v28-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>
                  Sơ đồ 2D ({versionDetail.booths.length} gian · {versionDetail.zones.length} khu · {stats.totalAssignedSlots}/{stats.totalSlotCapacity} slot)
                </strong>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: '#526071' }}>
                    <span style={{ color: '#0ea5e9', fontWeight: 700 }}>■ Có SP</span> ·{' '}
                    <span style={{ color: '#dc2626', fontWeight: 700 }}>■ Trống (0 SP)</span>
                  </span>
                  {isDraft && (
                    <button
                      type="button"
                      data-testid="v28-step3-auto-allocate-btn"
                      disabled={loading}
                      onClick={() => void handleManualAutoAllocateDraft()}
                      style={{
                        padding: '4px 9px',
                        borderRadius: 6,
                        border: '1px solid #0284c7',
                        background: '#f0f9ff',
                        color: '#0369a1',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: loading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      🔀 Tự động phân bổ slot trống
                    </button>
                  )}
                </div>
              </div>
              <svg
                viewBox={`${versionDetail.hallBounds.minX - 4} ${versionDetail.hallBounds.minZ - 4} ${versionDetail.hallWidth + 8} ${versionDetail.hallDepth + 8}`}
                style={{ width: '100%', maxHeight: 540, background: '#f8fafc', borderRadius: 8, border: '1px solid rgba(17,24,39,0.12)' }}
              >
                <rect
                  x={versionDetail.hallBounds.minX}
                  y={versionDetail.hallBounds.minZ}
                  width={versionDetail.hallWidth}
                  height={versionDetail.hallDepth}
                  fill="#f1f5f9"
                  stroke="#94a3b8"
                  strokeWidth={0.6}
                />
                <rect
                  x={versionDetail.centralAvenueBounds.minX}
                  y={versionDetail.centralAvenueBounds.minZ}
                  width={versionDetail.centralAvenueBounds.maxX - versionDetail.centralAvenueBounds.minX}
                  height={versionDetail.centralAvenueBounds.maxZ - versionDetail.centralAvenueBounds.minZ}
                  fill="#e0f2fe"
                />
                <circle cx={versionDetail.spawnPoint.x} cy={versionDetail.spawnPoint.z} r={1.8} fill="#0284c7" />
                {versionDetail.booths.map((b) => {
                  const isSel = selectedBooth?.boothId === b.boothId;
                  const isEmpty = b.assignedSlotCount === 0;
                  const dimmed = Boolean(filterZoneCode) && b.zoneCode !== filterZoneCode;
                  return (
                    <g key={b.boothId} onClick={() => handleSelectBooth(b)} style={{ cursor: 'pointer' }}>
                      <title>{`${b.boothName} (${b.zoneName}) — ${b.assignedSlotCount}/6 SP`}</title>
                      <rect
                        x={b.positionX - b.footprintWidth / 2}
                        y={b.positionZ - b.footprintDepth / 2}
                        width={b.footprintWidth}
                        height={b.footprintDepth}
                        rx={0.6}
                        fill={dimmed ? '#cbd5e1' : isEmpty ? '#dc2626' : b.color || '#0ea5e9'}
                        fillOpacity={isSel ? 1 : isEmpty ? 0.9 : 0.82}
                        stroke={isSel ? '#0f172a' : isEmpty ? '#7f1d1d' : '#ffffff'}
                        strokeWidth={isSel ? 1.1 : isEmpty ? 0.65 : 0.35}
                      />
                      <text
                        x={b.positionX}
                        y={b.positionZ + 0.6}
                        textAnchor="middle"
                        fontSize={2.0}
                        fontWeight="bold"
                        fill="#ffffff"
                      >
                        {b.zoneCode}
                        {b.slotIndex + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Compact Zones List with Pencil Inline Rename */}
            <div className="v28-card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <strong style={{ fontSize: 13.5, color: '#0f172a' }}>
                  Danh sách phân khu ({versionDetail.zones.length})
                </strong>
                {filterZoneCode && versionDetail.zones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterZoneCode('');
                      setPage(1);
                    }}
                    style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Bỏ lọc khu ({filterZoneCode})
                  </button>
                )}
              </div>
              <div className="v28-zone-grid">
                {versionDetail.zones.map((z) => {
                  const zoneBooths = versionDetail.booths.filter((b) => b.zoneCode === z.code);
                  const withProducts = zoneBooths.filter((b) => b.assignedSlotCount > 0).length;
                  const emptyCount = zoneBooths.length - withProducts;
                  const isEditingThis = renamingZoneCode === z.code;
                  const isSelected = filterZoneCode === z.code;
                  return (
                    <div
                      key={z.id}
                      data-testid={`v28-step3-zone-item-${z.code}`}
                      className={`v28-zone-card ${isSelected ? 'v28-zone-card--active' : ''} ${withProducts === 0 ? 'v28-zone-card--empty' : ''}`}
                    >
                      {isEditingThis ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0284c7', flexShrink: 0 }}>{z.code}</span>
                            <input
                              type="text"
                              autoFocus
                              data-testid={`v28-zone-rename-input-${z.code}`}
                              value={renameZoneInput}
                              disabled={renamingZoneBusy}
                              onChange={(e) => {
                                setRenameZoneInput(e.target.value);
                                if (renameZoneError) setRenameZoneError('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleCommitZoneRename(z);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  handleCancelZoneRename();
                                }
                              }}
                              className="v28-input"
                              style={{ padding: '4px 7px', fontSize: 12.5, minWidth: 0, flex: 1 }}
                            />
                          </div>
                          {renameZoneError && (
                            <div data-testid="v28-zone-rename-error" style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
                              {renameZoneError}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              data-testid={`v28-zone-cancel-btn-${z.code}`}
                              disabled={renamingZoneBusy}
                              onClick={handleCancelZoneRename}
                              style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              data-testid={`v28-zone-save-btn-${z.code}`}
                              disabled={renamingZoneBusy}
                              onClick={() => void handleCommitZoneRename(z)}
                              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#0284c7', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                            >
                              {renamingZoneBusy ? '...' : 'Lưu'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setFilterZoneCode(isSelected ? '' : z.code);
                                setPage(1);
                              }}
                              title={`Lọc gian hàng thuộc ${z.displayName}`}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 6,
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                cursor: 'pointer',
                                textAlign: 'left',
                                minWidth: 0,
                                flex: 1,
                              }}
                            >
                              <span
                                style={{
                                  minWidth: 22,
                                  padding: '1px 5px',
                                  borderRadius: 5,
                                  background: isSelected ? '#0284c7' : '#e2e8f0',
                                  color: isSelected ? '#fff' : '#0f172a',
                                  fontWeight: 800,
                                  fontSize: 11,
                                  textAlign: 'center',
                                  flexShrink: 0,
                                  marginTop: 1,
                                }}
                              >
                                {z.code}
                              </span>
                              <span className="v28-zone-title-clamp" title={z.displayName}>
                                {z.displayName}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="v28-icon-btn"
                              data-testid={`v28-zone-edit-btn-${z.code}`}
                              title={`Đổi tên phân khu ${z.displayName}`}
                              aria-label={`Đổi tên phân khu ${z.displayName}`}
                              disabled={switchingDraftBusy}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleStartZoneRename(z);
                              }}
                            >
                              <V28SvgIcon name="edit" size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: '#64748b', flexWrap: 'wrap' }}>
                            <span><strong>{zoneBooths.length}</strong> gian</span>
                            <span style={{ color: '#059669' }}><strong>{withProducts}</strong> có SP</span>
                            {emptyCount > 0 && (
                              <span style={{ color: '#dc2626', fontWeight: 600 }}>{emptyCount} trống</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Panel: Unified BoothInspectorPanel (slot controls shown ONLY when a booth is selected!) */}
          {!selectedBooth ? (
            <div className="v28-card" style={{ padding: 16, alignSelf: 'start' }} data-testid="v28-step3-empty-inspector">
              <strong style={{ fontSize: 14, display: 'block', color: '#0f172a', marginBottom: 6 }}>
                Chi tiết gian hàng
              </strong>
              <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5 }}>
                Nhấn chọn một gian hàng trực tiếp trên <strong>Sơ đồ 2D</strong> bên trái để xem thông tin và quản lý 6 vị trí trưng bày sản phẩm.
              </div>
            </div>
          ) : (
            <BoothInspectorPanel
              booth={selectedBooth}
              isDraft={isDraft}
              archetypes={archetypes}
              onClose={() => setSelectedBooth(null)}
              onAssignSlot={handleAssignSlot}
              onUpdateBooth={(bId, patch) => handleUpdateBooth(bId, patch)}
              onSwitchToWorkingDraft={async () => {
                await handleEnsureWorkingDraft();
              }}
              onProductMutated={async () => {
                if (selectedExhId && selectedVersionId) {
                  await loadVersionDetail(selectedExhId, selectedVersionId);
                }
                notifyV28WorldSync('product_updated');
                onDataChanged?.();
              }}
              onRequestDeleteBooth={(b) => setConfirmDeleteBooth(b)}
            />
          )}
        </div>
      )}

      {/* Interactive Zone Cards Overview (Dashboard) — Compact, Pencil Rename, Zero Repeated Status Pills */}
      {viewMode === 'dashboard' && versionDetail && (
        <div className="v28-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <strong style={{ fontSize: 14.5, color: '#111827' }}>
                Phân khu triển lãm ({versionDetail.zones.length})
              </strong>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Chọn một phân khu bên dưới để xem và quản lý các gian hàng trong khu đó.
              </div>
            </div>
            {filterZoneCode && versionDetail.zones.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setFilterZoneCode('');
                  setSelectedBooth(null);
                  setPage(1);
                }}
                style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Bỏ chọn khu {filterZoneCode}
              </button>
            )}
          </div>
          <div className="v28-zone-grid">
            {versionDetail.zones.map((z) => {
              const zoneBooths = versionDetail.booths.filter((b) => b.zoneCode === z.code);
              const withProducts = zoneBooths.filter((b) => b.assignedSlotCount > 0).length;
              const emptyCount = zoneBooths.length - withProducts;
              const isSelected = filterZoneCode === z.code;
              const isEditingThis = renamingZoneCode === z.code;
              return (
                <div
                  key={z.id}
                  data-testid={`v28-overview-zone-card-${z.code}`}
                  onClick={() => {
                    if (isEditingThis) return;
                    setFilterZoneCode(isSelected ? '' : z.code);
                    setPage(1);
                  }}
                  className={`v28-zone-card ${isSelected ? 'v28-zone-card--active' : ''} ${withProducts === 0 ? 'v28-zone-card--empty' : ''}`}
                  style={{ cursor: isEditingThis ? 'default' : 'pointer' }}
                >
                  {isEditingThis ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                    >
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0284c7', flexShrink: 0 }}>{z.code}</span>
                        <input
                          type="text"
                          autoFocus
                          data-testid={`v28-zone-rename-input-${z.code}`}
                          value={renameZoneInput}
                          disabled={renamingZoneBusy}
                          onChange={(e) => {
                            setRenameZoneInput(e.target.value);
                            if (renameZoneError) setRenameZoneError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleCommitZoneRename(z);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              handleCancelZoneRename();
                            }
                          }}
                          className="v28-input"
                          style={{ padding: '4px 7px', fontSize: 12.5, minWidth: 0, flex: 1 }}
                        />
                      </div>
                      {renameZoneError && (
                        <div data-testid="v28-zone-rename-error" style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
                          {renameZoneError}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          data-testid={`v28-zone-cancel-btn-${z.code}`}
                          disabled={renamingZoneBusy}
                          onClick={handleCancelZoneRename}
                          style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Hủy
                        </button>
                        <button
                          type="button"
                          data-testid={`v28-zone-save-btn-${z.code}`}
                          disabled={renamingZoneBusy}
                          onClick={() => void handleCommitZoneRename(z)}
                          style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#0284c7', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {renamingZoneBusy ? '...' : 'Lưu'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              minWidth: 22,
                              padding: '1px 5px',
                              borderRadius: 5,
                              background: isSelected ? '#0284c7' : '#e2e8f0',
                              color: isSelected ? '#fff' : '#0f172a',
                              fontWeight: 800,
                              fontSize: 11,
                              textAlign: 'center',
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {z.code}
                          </span>
                          <span className="v28-zone-title-clamp" title={z.displayName}>
                            {z.displayName}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="v28-icon-btn"
                          data-testid={`v28-zone-edit-btn-${z.code}`}
                          title={`Đổi tên phân khu ${z.displayName}`}
                          aria-label={`Đổi tên phân khu ${z.displayName}`}
                          disabled={switchingDraftBusy}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleStartZoneRename(z);
                          }}
                        >
                          <V28SvgIcon name="edit" size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: '#526071', flexWrap: 'wrap' }}>
                        <span><strong>{zoneBooths.length}</strong> gian</span>
                        <span style={{ color: withProducts > 0 ? '#059669' : '#94a3b8' }}>
                          <strong>{withProducts}</strong> có SP
                        </span>
                        {emptyCount > 0 && (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>{emptyCount} trống</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phase 4: Zone-first Hierarchy — Prompt when no zone is selected, show Booths + Inspector ONLY for selected Zone */}
      {viewMode === 'dashboard' && versionDetail && !filterZoneCode && (
        <div
          className="v28-card"
          data-testid="v28-select-zone-prompt"
          style={{
            padding: '22px 16px',
            textAlign: 'center',
            color: '#475569',
            fontSize: 13.5,
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
          }}
        >
          <strong style={{ display: 'block', color: '#0f172a', marginBottom: 4 }}>
            Chọn một phân khu phía trên để xem danh sách gian hàng
          </strong>
          <span>
            Mỗi khu hiển thị gọn các gian hàng thuộc khu đó; nhấn vào gian hàng để quản lý 6 vị trí sản phẩm và tự động đồng bộ World 3D.
          </span>
        </div>
      )}

      {/* Inline Overview Workspace: Zone-Scoped Booth Cards + Right-Side 6-Slot Booth Inspector */}
      {viewMode === 'dashboard' && versionDetail && Boolean(filterZoneCode) && (
        <div
          className={`v28-overview-workspace ${selectedBooth ? 'v28-overview-workspace--with-inspector' : ''}`}
          data-testid="v28-zone-booths-workspace"
        >
          <div className="v28-card" style={{ padding: 14, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <strong style={{ fontSize: 14.5, color: '#111827' }}>
                  Gian hàng Khu {filterZoneCode}
                  {activeSelectedZone ? ` — ${activeSelectedZone.displayName}` : ''} ({filteredBooths.length})
                </strong>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm gian, phân khu..."
                  className="v28-input"
                  style={{ width: 170, padding: '6px 9px', fontSize: 12.5 }}
                />
                <select
                  aria-label="Lọc trạng thái gian hàng"
                  value={filterAssign}
                  onChange={(e) => {
                    setFilterAssign(e.target.value as typeof filterAssign);
                    setPage(1);
                  }}
                  className="v28-input"
                  style={{ width: 'auto', padding: '6px 9px', fontSize: 12.5 }}
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="full_slots">Gian đầy (6/6)</option>
                  <option value="partial_slots">Gian thiếu (1–5/6)</option>
                  <option value="empty_slots">Gian trống (0/6)</option>
                  <option value="has_products">Có sản phẩm (1–6/6)</option>
                </select>
                <select
                  aria-label="Số gian mỗi trang"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="v28-input"
                  style={{ width: 'auto', padding: '6px 9px', fontSize: 12.5 }}
                >
                  <option value={12}>12 / trang</option>
                  <option value={25}>25 / trang</option>
                  <option value={50}>50 / trang</option>
                </select>
              </div>
            </div>

            {pagedBooths.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: '#526071', fontSize: 13 }}>
                Không có gian hàng nào khớp bộ lọc.
              </div>
            ) : (
              <div className="v28-booth-grid">
                {pagedBooths.map((b) => {
                  const isEmptyBooth = b.assignedSlotCount === 0;
                  const isFullBooth = b.assignedSlotCount >= 6;
                  const stateClass = isEmptyBooth
                    ? 'v28-booth-card--empty'
                    : isFullBooth
                      ? 'v28-booth-card--full'
                      : 'v28-booth-card--partial';
                  const badgeBg = isEmptyBooth ? '#fef2f2' : isFullBooth ? '#ecfdf5' : '#fffbeb';
                  const badgeColor = isEmptyBooth ? '#dc2626' : isFullBooth ? '#059669' : '#b45309';
                  const badgeBorder = isEmptyBooth ? '#fecaca' : isFullBooth ? '#a7f3d0' : '#fde68a';
                  const statusLabel = isEmptyBooth
                    ? 'Gian trống'
                    : isFullBooth
                      ? 'Đầy đủ (6/6)'
                      : `Thiếu ${6 - b.assignedSlotCount} SP`;
                  const isActive = selectedBooth?.boothId === b.boothId;
                  const shortTitle = `Gian ${String(b.slotIndex + 1).padStart(2, '0')}`;
                  return (
                    <button
                      key={b.boothId}
                      type="button"
                      data-testid={`v28-booth-card-${b.slotIndex + 1}`}
                      title={`${b.boothName} (${b.zoneName})`}
                      onClick={() => handleSelectBooth(b)}
                      className={`v28-booth-card ${isActive ? 'v28-booth-card--active' : ''} ${stateClass}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {shortTitle}
                        </strong>
                        <span
                          style={{
                            padding: '1px 7px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            flexShrink: 0,
                            fontVariantNumeric: 'tabular-nums',
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${badgeBorder}`,
                          }}
                        >
                          {b.assignedSlotCount}/6
                        </span>
                      </div>
                      <div
                        title={b.zoneName}
                        style={{ fontSize: 11.5, color: '#526071', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {b.zoneName}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginTop: 1 }}>
                        <span style={{ color: badgeColor, fontWeight: 600 }}>
                          {statusLabel}
                        </span>
                        <span style={{ color: '#0284c7', fontWeight: 700 }}>
                          {isActive ? 'Đang mở' : '→'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12.5, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ color: '#526071', fontVariantNumeric: 'tabular-nums' }}>
                Trang {safePage} / {totalPages} (Tổng {filteredBooths.length} gian)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                >
                  ← Trước
                </button>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ minHeight: 30, padding: '0 10px', fontSize: 12 }}
                >
                  Sau →
                </button>
              </div>
            </div>
          </div>

          {/* Inline Right-Side Booth Inspector Panel */}
          {selectedBooth && (
            <BoothInspectorPanel
              booth={selectedBooth}
              isDraft={isDraft}
              archetypes={archetypes}
              onClose={() => setSelectedBooth(null)}
              onAssignSlot={handleAssignSlot}
              onUpdateBooth={(bId, patch) => handleUpdateBooth(bId, patch)}
              onSwitchToWorkingDraft={async () => {
                await handleEnsureWorkingDraft();
              }}
              onProductMutated={async () => {
                if (selectedExhId && selectedVersionId) {
                  await loadVersionDetail(selectedExhId, selectedVersionId);
                }
                notifyV28WorldSync('product_updated');
                onDataChanged?.();
              }}
              onRequestDeleteBooth={(b) => setConfirmDeleteBooth(b)}
            />
          )}
        </div>
      )}

      {/* Real-Backend Progress Popup Modal (Section F4) */}
      {creationProgress?.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tiến trình tạo không gian triển lãm"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.58)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 10000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#fff',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 24px 60px rgba(0,0,0,0.32)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 17, color: '#0f172a' }}>
              {creationProgress.running
                ? '⏳ Đang tạo không gian triển lãm...'
                : creationProgress.error
                  ? '⚠️ Tạo không gian gặp sự cố'
                  : '✅ Đã hoàn tất tạo bản nháp (Draft)'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {creationProgress.steps.map((st) => (
                <div
                  key={st.key}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background:
                      st.status === 'done'
                        ? '#f0fdf4'
                        : st.status === 'running'
                          ? '#eff6ff'
                          : st.status === 'error'
                            ? '#fef2f2'
                            : '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    {st.status === 'done'
                      ? '✅'
                      : st.status === 'running'
                        ? '⏳'
                        : st.status === 'error'
                          ? '❌'
                          : '○'}{' '}
                    {st.label}
                  </div>
                  {st.detail && (
                    <div style={{ fontSize: 12, color: st.status === 'error' ? '#b91c1c' : '#475569' }}>
                      {st.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {creationProgress.summary && (
              <div style={{ padding: 10, borderRadius: 10, background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: 13 }}>
                {creationProgress.summary}
              </div>
            )}

            {!creationProgress.running && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {creationProgress.error && (
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                  >
                    🔄 Thử lại an toàn
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!creationProgress.error) {
                      setWizardStep(3);
                    }
                    setCreationProgress(null);
                  }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
                >
                  {creationProgress.error ? 'Đóng' : '👁️ Xem sơ đồ 2D & Chỉnh sửa'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Safe Booth Deletion Confirmation Modal (Section 9) */}
      {confirmDeleteBooth && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xóa gian hàng"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#fff',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 20px 50px rgba(0,0,0,0.28)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 17, color: '#991b1b' }}>🗑️ Xác nhận xóa gian hàng khỏi bản Draft</h3>
            <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.5 }}>
              <div><strong>Mã gian (Booth ID):</strong> <code>{confirmDeleteBooth.boothId}</code></div>
              <div><strong>Tên gian:</strong> {confirmDeleteBooth.boothName}</div>
              <div><strong>Thuộc khu:</strong> {confirmDeleteBooth.zoneName}</div>
              <div><strong>Sản phẩm đang gán:</strong> {confirmDeleteBooth.assignedSlotCount} / 6 slot</div>
            </div>
            {confirmDeleteBooth.assignedSlotCount > 0 && (
              <div style={{ padding: 10, borderRadius: 10, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: 12.5 }}>
                ⚠️ Gian này đang có {confirmDeleteBooth.assignedSlotCount} sản phẩm được gán. Xác nhận sẽ <strong>chỉ gỡ liên kết khỏi slot</strong>, <strong>KHÔNG xóa sản phẩm khỏi Catalog</strong> và <strong>KHÔNG xóa doanh nghiệp</strong>.
              </div>
            )}
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Hệ thống sẽ cập nhật số gian mục tiêu của bản Draft để gian này không bị tự động tạo lại. World 3D công khai chỉ cập nhật sau khi bạn bấm Publish.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteBooth(null)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBooth}
                disabled={loading}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
              >
                {loading ? '⏳ Đang xóa...' : 'Xác nhận xóa gian'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
