import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  v28Api,
  type V28ArchetypeId,
  type V28ArchetypeSpec,
  type V28BoothPlacementView,
  type V28Company,
  type V28ExhibitionSummary,
  type V28ExhibitionVersionDetail,
  type V28Product,
} from '../../services/v28Api';
import { BoothInspectorPanel } from './BoothInspectorPanel';

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
  onActiveVersionChange?: (meta: { status: string; zones: number; booths: number; ownerName?: string } | null) => void;
  onViewStateChange?: (mode: 'dashboard' | 'wizard', step: 1 | 2 | 3 | 4) => void;
}

export const ExhibitionConfigurator: React.FC<ExhibitionConfiguratorProps> = ({
  onDataChanged,
  onOpenDynamicWorld,
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
      pagesScanned: number;
      productUrlsDiscovered: number;
      extractedValidCount: number;
      newCount: number;
      duplicateCount: number;
      errorCount: number;
      totalBytesRead: number;
      stopReasons: string[];
      coverageStatus: 'IMPORT_COMPLETED';
      fullCatalogVerified: boolean;
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
    overflowCount: number;
    uncertainProducts: Array<{ productId: string; name: string; reason: string }>;
  } | null>(null);
  const [exhibitions, setExhibitions] = useState<V28ExhibitionSummary[]>([]);
  const [selectedExhId, setSelectedExhId] = useState<string>('');
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [versionDetail, setVersionDetail] = useState<V28ExhibitionVersionDetail | null>(null);
  const [companies, setCompanies] = useState<V28Company[]>([]);
  const [archetypes, setArchetypes] = useState<V28ArchetypeSpec[]>([]);
  const [companyCatalogProducts, setCompanyCatalogProducts] = useState<V28Product[]>([]);

  // String-backed numeric inputs (allow clearing completely, typing/pasting freely, zero wheel jumps or focus loss!)
  const [zoneCountInput, setZoneCountInput] = useState<string>('10');
  const [boothsPerZoneInput, setBoothsPerZoneInput] = useState<string>('10');
  const [sourceMode, setSourceMode] = useState<'url' | 'excel'>('url');
  const [sourceCompanyId, setSourceCompanyId] = useState<string>('');
  const [sourceWebsiteUrl, setSourceWebsiteUrl] = useState<string>('');
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
  const [editBoothName, setEditBoothName] = useState<string>('');
  const [editZoneName, setEditZoneName] = useState<Record<string, string>>({});

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

  // Search, Filter & Pagination for 100+ booths dashboard
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterZoneCode, setFilterZoneCode] = useState<string>('ALL');
  const [filterAssign, setFilterAssign] = useState<'all' | 'assigned' | 'unassigned' | 'has_products' | 'empty_slots'>('all');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const loadExhibitions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [exhRes, compRes, archRes] = await Promise.all([
        v28Api.listExhibitions(),
        v28Api.listCompanies({ status: 'active' }),
        v28Api.listArchetypes(),
      ]);
      setExhibitions(exhRes.exhibitions);
      setCompanies(compRes.companies);
      if (compRes.companies.length > 0) {
        setSourceCompanyId((prev) => prev || compRes.companies[0].id);
      }
      setArchetypes(archRes.archetypes);
      const first = exhRes.exhibitions[0];
      if (first) {
        setSelectedExhId((prev) => prev || first.id);
        const defaultVer = first.activeVersionId || first.latestDraftVersionId || first.versions[0]?.id || '';
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
      const zn: Record<string, string> = {};
      for (const z of version.zones) zn[z.id] = z.displayName;
      setEditZoneName(zn);
      setSelectedBooth((prev) => {
        const next = prev ? version.booths.find((b) => b.boothId === prev.boothId) || null : null;
        if (next) setEditBoothName(next.boothName);
        return next;
      });
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

  // V28-AUDIT-015: Sync currently viewed version status & counts up to Topbar
  useEffect(() => {
    if (!versionDetail) {
      onActiveVersionChange?.(null);
      return;
    }
    onActiveVersionChange?.({
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
    if (filterZoneCode !== 'ALL' && selectedBooth && selectedBooth.zoneCode !== filterZoneCode) {
      setSelectedBooth(null);
    }
  }, [filterZoneCode, selectedBooth]);

  // Load company's own catalog products whenever a booth is selected for 6-slot assignment
  useEffect(() => {
    if (!selectedBooth?.companyId) {
      setCompanyCatalogProducts([]);
      return;
    }
    let cancelled = false;
    v28Api
      .listProducts({ companyId: selectedBooth.companyId, status: 'active', page: 1, limit: 100 })
      .then((res) => {
        if (!cancelled) setCompanyCatalogProducts(res.items);
      })
      .catch(() => {
        if (!cancelled) setCompanyCatalogProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBooth?.companyId]);

  const selectedExh = exhibitions.find((e) => e.id === selectedExhId) || null;
  const isDraft = versionDetail?.status === 'draft';

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

  // Filtered & Paginated Booths
  const filteredBooths = useMemo(() => {
    const list = versionDetail?.booths || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((b) => {
      if (filterZoneCode !== 'ALL' && b.zoneCode !== filterZoneCode) return false;
      if (filterAssign === 'assigned' && !b.companyId) return false;
      if (filterAssign === 'unassigned' && b.companyId) return false;
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
    setEditBoothName(b.boothName);
  };

  const handleCreateDraft = async () => {
    if (!selectedExhId || configValidationError || creationProgress?.running) return;
    setShowCreateConfirm(false);
    setViewMode('wizard');
    setWizardStep(2);
    setLastImportSummary(null);
    setLoading(true);
    setError('');
    setMessage('');

    const initSteps = [
      { key: 'validate', label: '1. Kiểm tra cấu hình khu & gian hàng', status: 'running' as const, detail: `${parsedZoneCount} khu × ${parsedBoothsPerZone} gian = ${computedTotalBooths} gian` },
      { key: 'source', label: '2. Lấy dữ liệu sản phẩm', status: 'pending' as const, detail: sourceMode === 'url' ? sourceWebsiteUrl : sourceMode === 'excel' ? sourceExcelFile?.name : 'Sử dụng Catalog hiện có' },
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
      setStepState('validate', 'done', `Hợp lệ: ${parsedZoneCount} khu × ${parsedBoothsPerZone} gian`);

      // Step 2: Fetch / Import product data from chosen mandatory source (auto-detects Seller Company on URL!)
      setStepState('source', 'running');
      let importedCount = 0;
      const importedProductIds: string[] = [];
      const categoryHints: Record<string, string> = {};
      let targetCompanyId = sourceCompanyId || companies[0]?.id || '';
      let detectedCompanyMeta: NonNullable<typeof lastImportSummary>['detectedCompany'] | undefined;
      let coverageReportMeta: NonNullable<typeof lastImportSummary>['coverageReport'] | undefined;

      if (sourceMode === 'url') {
        const disc = await v28Api.discoverWebsiteProducts({
          companyId: undefined,
          url: sourceWebsiteUrl.trim(),
          maxPages: 15,
          autoDetectCompany: true,
        });
        detectedCompanyMeta = disc.detectedCompany;
        coverageReportMeta = disc.coverageReport;
        if (disc.detectedCompany?.companyId) {
          targetCompanyId = disc.detectedCompany.companyId;
          setSourceCompanyId(disc.detectedCompany.companyId);
        } else {
          targetCompanyId = '';
        }
        if (!targetCompanyId) {
          throw new Error(
            disc.detectedCompany?.confidence === 'needs_confirmation'
              ? `Website ${disc.detectedCompany.canonicalDomain} chưa có đủ metadata tổ chức để tự động xác minh doanh nghiệp sở hữu (trạng thái: needs_confirmation). Vui lòng xác nhận/tạo hồ sơ doanh nghiệp trong mục "Thông tin Doanh nghiệp" trước khi tạo triển lãm.`
              : 'Không xác định được doanh nghiệp sở hữu từ URL này. Vui lòng kiểm tra lại URL hoặc xác nhận thông tin doanh nghiệp.'
          );
        }
        if (!disc.discoveredProducts || disc.discoveredProducts.length === 0) {
          throw new Error(
            disc.note ||
              'Không tìm thấy sản phẩm công khai có cấu trúc từ URL này. Bạn có thể nhập URL trang danh mục, URL sản phẩm cụ thể hoặc dùng Excel.'
          );
        }
        for (const item of disc.discoveredProducts) {
          if (item.alreadyInCatalog || item.name.trim().length < 2) continue;
          const created = await v28Api.createProduct({
            companyId: targetCompanyId,
            boothId: null,
            name: item.name.trim(),
            sku: item.sku.trim(),
            price: Math.max(0, Number(item.price) || 0),
            currency: item.currency || 'VND',
            description: item.description.trim(),
            images: item.images,
            sourceUrl: item.sourceUrl,
            inStock: item.inStock,
          });
          importedProductIds.push(created.product.id);
          if (item.category) {
            categoryHints[created.product.id] = item.category;
          }
          importedCount++;
        }
        const skippedExisting = disc.discoveredProducts.filter((i) => i.alreadyInCatalog).length;
        const sizeLabel =
          typeof disc.totalBytesRead === 'number'
            ? ` · ${(disc.totalBytesRead / (1024 * 1024)).toFixed(2)} MB`
            : '';
        const sellerLabel = disc.detectedCompany?.companyName
          ? ` · Doanh nghiệp: ${disc.detectedCompany.companyName} (${disc.detectedCompany.confidence === 'verified' ? 'đã xác minh' : 'cần xác nhận'})`
          : '';
        setStepState(
          'source',
          'done',
          `Quét ${disc.pagesScanned} trang${sizeLabel} · Tìm thấy ${disc.discoveredProducts.length} SP (thêm mới ${importedCount}, đã có ${skippedExisting})${sellerLabel}`
        );
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
      });
      setStepState('layout', 'done', `Draft v${version.versionNumber} (${version.zones.length} khu · ${version.booths.length} gian · ${version.hallWidth}×${version.hallDepth}m)`);

      // Step 5: Atomic backend auto-classification, category-zone mapping & slot allocation
      setStepState('allocate', 'running');
      let allocatedSlots = 0;
      let allocDetail = 'Giữ nguyên phân bổ hiện tại (gian chưa có SP được đánh dấu đỏ)';
      if (autoAllocateProducts) {
        const allocRes = await v28Api.autoAllocateDraftProducts(selectedExhId, version.versionId, {
          companyId: targetCompanyId,
          productIds: importedProductIds.length > 0 ? importedProductIds : undefined,
          categoryHints,
          organizeZonesByCategory: true,
        });
        allocatedSlots = allocRes.assignedSlots;
        setLastImportSummary({
          detectedCompany: detectedCompanyMeta,
          coverageReport: coverageReportMeta,
          zoneDecisions: allocRes.zoneDecisions,
          assignedSlots: allocRes.assignedSlots,
          boothsFilled: allocRes.boothsFilled,
          overflowCount: allocRes.overflowProductIds.length,
          uncertainProducts: allocRes.uncertainProducts,
        });
        const notes: string[] = [
          `Đã tự động gán ${allocRes.assignedSlots} vị trí tại ${allocRes.boothsFilled} gian`,
        ];
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
          assignedSlots: 0,
          boothsFilled: 0,
          overflowCount: importedProductIds.length,
          uncertainProducts: [],
        });
      }
      setStepState('allocate', 'done', allocDetail);

      await loadExhibitions();
      const refreshed = await v28Api.getVersionDetail(selectedExhId, version.versionId);
      setSelectedVersionId(version.versionId);
      setVersionDetail(refreshed.version);
      setFilterZoneCode('ALL');
      setPage(1);

      const withSp = refreshed.version.booths.filter((b) => b.assignedSlotCount > 0).length;
      const emptySp = refreshed.version.booths.length - withSp;
      const summaryText = `Đã tạo Draft v${refreshed.version.versionNumber}: ${refreshed.version.zones.length} khu × ${parsedBoothsPerZone} gian = ${refreshed.version.booths.length} gian (${withSp} gian có SP, ${emptySp} gian trống đánh dấu đỏ). Kiểm tra sơ đồ 2D và bấm "🚀 Publish" để xuất bản.`;
      setCreationProgress((prev) =>
        prev ? { ...prev, running: false, summary: summaryText } : prev
      );
      setMessage(summaryText);
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

  const handleRenameZone = async (zoneId: string) => {
    if (!selectedExhId || !selectedVersionId) return;
    const displayName = (editZoneName[zoneId] || '').trim();
    if (!displayName) return;
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.updateDraftZone(selectedExhId, selectedVersionId, zoneId, {
        displayName,
      });
      setVersionDetail(version);
      setMessage(`Đã đổi tên phân khu thành "${displayName}".`);
    } catch (e) {
      setError((e as Error).message);
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
      const { version } = await v28Api.updateDraftBooth(selectedExhId, selectedVersionId, boothId, patch);
      setVersionDetail(version);
      const updated = version.booths.find((b) => b.boothId === boothId) || null;
      setSelectedBooth(updated);
      if (updated) setEditBoothName(updated.boothName);
      setMessage('Đã cập nhật gian hàng trong bản Draft.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleAssignSlot = async (boothId: string, slotId: string, productId: string) => {
    setError('');
    setMessage('');
    try {
      if (!productId) {
        await v28Api.clearSlot(boothId, slotId);
        setMessage(`Đã gỡ sản phẩm khỏi vị trí ${slotId}.`);
      } else {
        await v28Api.assignSlot(boothId, slotId, productId);
        setMessage(`Đã gán sản phẩm vào vị trí ${slotId} và đồng bộ World V28.`);
      }
      if (selectedExhId && selectedVersionId) {
        await loadVersionDetail(selectedExhId, selectedVersionId);
      }
      notifyV28WorldSync('slot_updated');
      onDataChanged?.();
    } catch (e) {
      setError((e as Error).message);
      // V28-AUDIT-002: Re-throw so BoothInspectorPanel never shows a false green success banner on API failure!
      throw e;
    }
  };

  const handlePublish = async () => {
    if (!selectedExhId || !selectedVersionId) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { version } = await v28Api.publishVersion(selectedExhId, selectedVersionId);
      await loadExhibitions();
      setVersionDetail(version);
      setMessage(`Đã Publish phiên bản v${version.versionNumber} (${version.booths.length} gian) — World V28 đã tự đồng bộ!`);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Focused Dashboard Overview: Owner Card + Next-Step Actions + Minimalist 4 KPIs */}
      {viewMode === 'dashboard' && (
        <>
          <div className="v28-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 240 }}>
              {versionDetail?.ownerCompany?.logoUrl ? (
                <img
                  src={versionDetail.ownerCompany.logoUrl}
                  alt={versionDetail.ownerCompany.name}
                  style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'contain', background: '#f8fafc', border: '1px solid rgba(17,24,39,0.1)', padding: 4 }}
                />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 10, background: '#e0f2fe', color: '#0369a1', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 18 }}>
                  {(versionDetail?.ownerCompany?.name || 'E').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#526071' }}>Doanh nghiệp sở hữu triển lãm</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
                  {versionDetail?.ownerCompany?.name ||
                    (new Set((versionDetail?.booths || []).map((b) => b.companyId).filter(Boolean)).size > 1
                      ? 'Chưa chuẩn hóa 1 doanh nghiệp (Bản cũ)'
                      : 'Chưa xác định doanh nghiệp')}
                </div>
                <div style={{ fontSize: 12.5, color: '#0284c7', marginTop: 2 }}>
                  {versionDetail?.ownerCompany?.contactUrl || 'Mô hình 1 Website triển lãm · 1 Doanh nghiệp duy nhất'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {onManageCompanies && (
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={onManageCompanies}
                  style={{ minHeight: 36, padding: '0 12px', fontSize: 12.5 }}
                >
                  Chỉnh sửa doanh nghiệp
                </button>
              )}
              {onManageCatalog && (
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  onClick={() => onManageCatalog(versionDetail?.ownerCompanyId || undefined)}
                  style={{ minHeight: 36, padding: '0 12px', fontSize: 12.5 }}
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
                  style={{ minHeight: 36, padding: '0 12px', fontSize: 12.5 }}
                >
                  Sơ đồ 2D
                </button>
              )}
              {onOpenDynamicWorld && (
                <button
                  type="button"
                  className="v28-btn v28-btn--primary"
                  onClick={onOpenDynamicWorld}
                  style={{ minHeight: 36, padding: '0 14px', fontSize: 12.5 }}
                >
                  Xem triển lãm
                </button>
              )}
            </div>
          </div>

          <div className="v28-kpi-grid">
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Tổng số khu</div>
              <div className="v28-kpi-value">{stats.zoneCount}</div>
              <div className="v28-kpi-sub">Phân khu theo danh mục</div>
            </div>
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Tổng số gian</div>
              <div className="v28-kpi-value">{stats.totalBooths}</div>
              <div className="v28-kpi-sub">
                {versionDetail ? (versionDetail.status === 'published' ? 'Đã xuất bản' : 'Bản nháp') : 'Chưa tạo'}
              </div>
            </div>
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Sản phẩm đã gắn</div>
              <div className="v28-kpi-value" style={{ color: '#0284c7' }}>
                {stats.totalAssignedSlots} / {stats.totalSlotCapacity}
              </div>
              <div className="v28-kpi-sub">{stats.boothsWithProducts} gian đang trưng bày</div>
            </div>
            <div className="v28-kpi-card">
              <div className="v28-kpi-label">Gian trống</div>
              <div className="v28-kpi-value" style={{ color: stats.totalBooths - stats.boothsWithProducts > 0 ? '#dc2626' : '#059669' }}>
                {Math.max(0, stats.totalBooths - stats.boothsWithProducts)}
              </div>
              <div className="v28-kpi-sub">Chưa có sản phẩm</div>
            </div>
          </div>
        </>
      )}

      {/* 4-Step Website-Builder Wizard Stepper Navigation */}
      {viewMode === 'wizard' && (
        <div
          className="v28-card"
          style={{
            padding: '14px 18px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
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
                    padding: '7px 14px',
                    borderRadius: 8,
                    border: active ? '1.5px solid #0284c7' : '1px solid rgba(17,24,39,0.12)',
                    background: active ? '#e0f2fe' : done ? '#ecfdf5' : '#f8fafc',
                    color: active ? '#0369a1' : done ? '#059669' : '#526071',
                    fontWeight: 700,
                    fontSize: 13,
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
          <div style={{ display: 'flex', gap: 8 }}>
            {wizardStep > 1 && (
              <button
                type="button"
                className="v28-btn v28-btn--secondary"
                onClick={() => setWizardStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
                style={{ minHeight: 36, padding: '0 12px' }}
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
                  minHeight: 36,
                  padding: '0 14px',
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
                      <div className="v28-kpi-label">Sản phẩm hợp lệ</div>
                      <div className="v28-kpi-value" style={{ color: '#0284c7' }}>{lastImportSummary.coverageReport.extractedValidCount}</div>
                      <div className="v28-kpi-sub">{lastImportSummary.coverageReport.newCount} mới · {lastImportSummary.coverageReport.duplicateCount} đã có</div>
                    </div>
                    <div className="v28-kpi-card">
                      <div className="v28-kpi-label">Đã phân bổ vào gian</div>
                      <div className="v28-kpi-value" style={{ color: '#059669' }}>{lastImportSummary.assignedSlots}</div>
                      <div className="v28-kpi-sub">Trên {lastImportSummary.boothsFilled} gian hàng</div>
                    </div>
                    <div className="v28-kpi-card">
                      <div className="v28-kpi-label">Sản phẩm dư (Catalog)</div>
                      <div className="v28-kpi-value">{lastImportSummary.overflowCount}</div>
                      <div className="v28-kpi-sub">Có thể gán thủ công ở Bước 3</div>
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

          {/* Mandatory Product Source Selector (URL or Excel ONLY — Catalog bypass removed per F3) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 320px', minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>Nguồn sản phẩm (bắt buộc):</span>
              {[
                { id: 'url', label: '🔗 URL Website' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setSourceMode(opt.id as 'url' | 'excel');
                    setShowCreateConfirm(false);
                  }}
                  style={{
                    padding: '3px 9px',
                    borderRadius: 7,
                    border: sourceMode === opt.id ? '1.5px solid #0ea5e9' : '1px solid #cbd5e1',
                    background: sourceMode === opt.id ? '#e0f2fe' : '#fff',
                    color: sourceMode === opt.id ? '#0369a1' : '#334155',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              {sourceMode === 'url' ? (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 7,
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    color: '#0369a1',
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  ✨ Tự động nhận diện 1 doanh nghiệp từ URL
                </span>
              ) : (
                <select
                  aria-label="Doanh nghiệp sở hữu triển lãm"
                  value={sourceCompanyId}
                  onChange={(e) => setSourceCompanyId(e.target.value)}
                  style={{ padding: '3px 8px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12, background: '#fff' }}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            {sourceMode === 'url' ? (
              <input
                type="url"
                aria-label="URL Website doanh nghiệp"
                value={sourceWebsiteUrl}
                onChange={(e) => {
                  setSourceWebsiteUrl(e.target.value);
                  setShowCreateConfirm(false);
                }}
                placeholder="https://example-business.com"
                style={{
                  width: '100%',
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: !isSourceValid ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                  fontSize: 13.5,
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <input
                type="file"
                aria-label="Tệp Excel sản phẩm"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setShowCreateConfirm(false);
                  if (!file) {
                    setSourceExcelFile(null);
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const res = String(reader.result || '');
                    const base64 = res.includes(',') ? res.split(',')[1] : res;
                    setSourceExcelFile({ name: file.name, base64 });
                  };
                  reader.readAsDataURL(file);
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 10,
                  border: !isSourceValid ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                  fontSize: 12.5,
                  background: '#f8fafc',
                  boxSizing: 'border-box',
                }}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowCreateConfirm(true)}
            disabled={loading || Boolean(configValidationError)}
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
            🏛️ Tạo không gian triển lãm
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
              Tổng dự kiến: <strong style={{ fontSize: 15 }}>{computedTotalBooths}</strong> gian hàng
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
              📋 Xác nhận cấu hình trước khi tạo không gian triển lãm (Draft)
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
              Lưu ý: Hệ thống sẽ tạo bản <strong>Draft</strong> mới để bạn xem trước và chỉnh sửa. World 3D công khai chỉ cập nhật sau khi bạn bấm nút <strong>🚀 Publish</strong>.
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
                {loading ? '⏳ Đang tạo...' : `✅ Xác nhận Tạo Draft (${parsedZoneCount} khu × ${parsedBoothsPerZone} gian)`}
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
        <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}
      {message && (
        <div style={{ padding: 12, borderRadius: 8, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
          ✅ {message}
        </div>
      )}

      {/* Main Split: Large 2D Floorplan Left + Selected Booth Inspector Right (Wizard Step 3 — Bố trí) */}
      {versionDetail && viewMode === 'wizard' && wizardStep === 3 && (
        <div className="v28-preview-split">
          {/* 2D Interactive SVG Floorplan + Zones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="v28-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                <strong style={{ fontSize: 14.5 }}>
                  Sơ đồ 2D ({versionDetail.booths.length} gian · {versionDetail.zones.length} khu)
                </strong>
                <span style={{ fontSize: 12, color: '#526071' }}>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>■ Đỏ: gian trống (0 SP)</span> ·{' '}
                  {isDraft ? 'Bản nháp (chọn gian để chỉnh)' : 'Đã xuất bản'}
                </span>
              </div>
              <svg
                viewBox={`${versionDetail.hallBounds.minX - 4} ${versionDetail.hallBounds.minZ - 4} ${versionDetail.hallWidth + 8} ${versionDetail.hallDepth + 8}`}
                style={{ width: '100%', maxHeight: 480, background: '#f8fafc', borderRadius: 8, border: '1px solid rgba(17,24,39,0.12)' }}
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
                  const dimmed = filterZoneCode !== 'ALL' && b.zoneCode !== filterZoneCode;
                  return (
                    <g key={b.boothId} onClick={() => handleSelectBooth(b)} style={{ cursor: 'pointer' }}>
                      <rect
                        x={b.positionX - b.footprintWidth / 2}
                        y={b.positionZ - b.footprintDepth / 2}
                        width={b.footprintWidth}
                        height={b.footprintDepth}
                        rx={0.6}
                        fill={dimmed ? '#cbd5e1' : isEmpty ? '#dc2626' : b.color || '#0ea5e9'}
                        fillOpacity={isSel ? 1 : isEmpty ? 0.9 : 0.8}
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

            {/* Zones Manager */}
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                Danh sách Phân khu ({versionDetail.zones.length})
              </strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                {versionDetail.zones.map((z) => (
                  <div
                    key={z.id}
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      padding: 6,
                      borderRadius: 8,
                      background: filterZoneCode === z.code ? '#e0f2fe' : '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFilterZoneCode(filterZoneCode === z.code ? 'ALL' : z.code);
                        setPage(1);
                      }}
                      style={{
                        minWidth: 28,
                        padding: '3px 6px',
                        borderRadius: 6,
                        border: 'none',
                        background: filterZoneCode === z.code ? '#0284c7' : '#e2e8f0',
                        color: filterZoneCode === z.code ? '#fff' : '#0f172a',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {z.code}
                    </button>
                    <input
                      value={editZoneName[z.id] ?? z.displayName}
                      disabled={!isDraft}
                      onChange={(e) => setEditZoneName((prev) => ({ ...prev, [z.id]: e.target.value }))}
                      style={{ flex: 1, minWidth: 0, padding: '4px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{z.boothCount}</span>
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => handleRenameZone(z.id)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11 }}
                      >
                        Lưu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Selected Booth Configurator + Inline 6-Slot Product Catalog Assigner */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', alignSelf: 'start' }}>
            <strong style={{ fontSize: 15, display: 'block', marginBottom: 10 }}>
              Chi tiết Gian hàng & 6 Vị trí Trưng bày
            </strong>
            {!selectedBooth ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>
                Chọn một gian hàng từ sơ đồ 2D hoặc bảng danh sách 100 gian hàng bên dưới để chỉnh sửa tên, doanh nghiệp, mẫu kiến trúc và gán sản phẩm vào 6 vị trí.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ padding: 10, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedBooth.boothName} <span style={{ color: '#64748b', fontWeight: 500 }}>({selectedBooth.boothId})</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {selectedBooth.zoneName} · Tọa độ ({selectedBooth.positionX}m, {selectedBooth.positionZ}m) · {selectedBooth.assignedSlotCount}/6 SP
                  </div>
                </div>

                {/* Booth Rename (Draft) */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={editBoothName}
                    disabled={!isDraft}
                    onChange={(e) => setEditBoothName(e.target.value)}
                    placeholder="Tên gian hàng..."
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  {isDraft && (
                    <button
                      type="button"
                      onClick={() => handleUpdateBooth(selectedBooth.boothId, { boothName: editBoothName.trim() })}
                      style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Đổi tên
                    </button>
                  )}
                </div>

                {versionDetail.ownerCompanyId ? (
                  <div style={{ padding: '7px 10px', borderRadius: 7, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12.5, color: '#0369a1' }}>
                    <strong>Doanh nghiệp sở hữu:</strong>{' '}
                    {versionDetail.ownerCompany?.name || selectedBooth.companyName}{' '}
                    <span style={{ color: '#64748b' }}>(cố định theo mô hình 1 doanh nghiệp)</span>
                  </div>
                ) : (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    Doanh nghiệp sở hữu {isDraft ? '' : '(tạo Draft để đổi)'}:
                    <select
                      disabled={!isDraft}
                      value={selectedBooth.companyId || ''}
                      onChange={(e) => handleUpdateBooth(selectedBooth.boothId, { companyId: e.target.value })}
                      style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Mẫu Gian hàng (6 V27.4 Archetypes):
                  <select
                    disabled={!isDraft}
                    value={selectedBooth.archetypeId}
                    onChange={(e) =>
                      handleUpdateBooth(selectedBooth.boothId, { archetypeId: e.target.value as V28ArchetypeId })
                    }
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  >
                    {archetypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} ({a.width}m × {a.depth}m)
                      </option>
                    ))}
                  </select>
                </label>

                {/* Inline 6 Product Display Slots (Catalog filtered strictly to owning company!) */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>
                      Gán sản phẩm từ Catalog của {selectedBooth.companyName} ({companyCatalogProducts.length} SP):
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {onManageCatalog && (
                        <button
                          type="button"
                          onClick={() => onManageCatalog(selectedBooth.companyId || undefined)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          ✏️ Thêm/Sửa SP
                        </button>
                      )}
                      {onManageCompanies && (
                        <button
                          type="button"
                          onClick={onManageCompanies}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            background: '#f8fafc',
                            color: '#0f172a',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          🏢 Doanh nghiệp
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedBooth.slots.map((s) => (
                      <div key={s.slotId} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ width: 58, fontSize: 12, fontWeight: 700, color: '#475569' }}>{s.slotId}</span>
                        <select
                          value={s.product?.id || ''}
                          onChange={(e) => handleAssignSlot(selectedBooth.boothId, s.slotId, e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                        >
                          <option value="">— Vị trí trống —</option>
                          {s.product && !companyCatalogProducts.some((p) => p.id === s.product!.id) && (
                            <option value={s.product.id}>
                              {s.product.name} ({s.product.price.toLocaleString('vi-VN')} {s.product.currency})
                            </option>
                          )}
                          {companyCatalogProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.price.toLocaleString('vi-VN')} {p.currency})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interactive Zone Cards Overview (Dashboard only — keeps Wizard steps laser-focused!) */}
      {viewMode === 'dashboard' && versionDetail && (
        <div className="v28-card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <strong style={{ fontSize: 15, color: '#111827' }}>
              Phân khu triển lãm ({versionDetail.zones.length} khu · {versionDetail.booths.length} gian)
            </strong>
            {filterZoneCode !== 'ALL' && versionDetail.zones.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setFilterZoneCode('ALL');
                  setPage(1);
                }}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
              >
                Hiện tất cả {versionDetail.zones.length} khu
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {versionDetail.zones.map((z) => {
              const zoneBooths = versionDetail.booths.filter((b) => b.zoneCode === z.code);
              const withProducts = zoneBooths.filter((b) => b.assignedSlotCount > 0).length;
              const emptyCount = zoneBooths.length - withProducts;
              const isSelected = filterZoneCode === z.code;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => {
                    setFilterZoneCode(isSelected ? 'ALL' : z.code);
                    setPage(1);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '11px 13px',
                    borderRadius: 12,
                    border: isSelected ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                    background: isSelected ? '#f0f9ff' : '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                    <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{z.displayName}</strong>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: versionDetail.status === 'published' ? '#dcfce7' : '#e0f2fe', color: versionDetail.status === 'published' ? '#166534' : '#0369a1' }}>
                      {versionDetail.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{z.categoryTag || `Khu ${z.code}`}</div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12, marginTop: 2, flexWrap: 'wrap' }}>
                    <span><strong>{zoneBooths.length}</strong> gian</span>
                    <span style={{ color: '#059669' }}><strong>{withProducts}</strong> có SP</span>
                    {emptyCount > 0 && (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>🔴 {emptyCount} trống</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Inline Overview Workspace: Booth Cards (filtered by selected Zone) + Right-Side 6-Slot Booth Inspector */}
      {viewMode === 'dashboard' && versionDetail && (
        <div
          className={`v28-overview-workspace ${selectedBooth ? 'v28-overview-workspace--with-inspector' : ''}`}
        >
          <div className="v28-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <strong style={{ fontSize: 15, color: '#111827' }}>
                  Danh sách gian hàng ({filteredBooths.length})
                </strong>
                <div style={{ fontSize: 12, color: '#526071', marginTop: 2 }}>
                  Chọn gian để quản lý sản phẩm.
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Tìm gian hàng..."
                  className="v28-input"
                  style={{ width: 180 }}
                />
                <select
                  value={filterAssign}
                  onChange={(e) => {
                    setFilterAssign(e.target.value as typeof filterAssign);
                    setPage(1);
                  }}
                  className="v28-input"
                  style={{ width: 'auto' }}
                >
                  <option value="all">Tất cả</option>
                  <option value="has_products">Đang trưng bày</option>
                  <option value="empty_slots">Gian trống</option>
                </select>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="v28-input"
                  style={{ width: 'auto' }}
                >
                  <option value={12}>12 / trang</option>
                  <option value={25}>25 / trang</option>
                  <option value={50}>50 / trang</option>
                </select>
              </div>
            </div>

            {pagedBooths.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: '#526071', fontSize: 13.5 }}>
                Không có gian hàng nào khớp bộ lọc.
              </div>
            ) : (
              <div className="v28-booth-grid">
                {pagedBooths.map((b) => {
                  const isEmptyBooth = b.assignedSlotCount === 0;
                  const isActive = selectedBooth?.boothId === b.boothId;
                  const shortTitle = `Gian ${String(b.slotIndex + 1).padStart(2, '0')}`;
                  return (
                    <button
                      key={b.boothId}
                      type="button"
                      title={b.boothName}
                      onClick={() => handleSelectBooth(b)}
                      className={`v28-booth-card ${isActive ? 'v28-booth-card--active' : ''} ${isEmptyBooth ? 'v28-booth-card--empty' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <strong style={{ fontSize: 13.5, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                            background: isEmptyBooth ? '#fef2f2' : '#ecfdf5',
                            color: isEmptyBooth ? '#dc2626' : '#059669',
                            border: `1px solid ${isEmptyBooth ? '#fecaca' : '#a7f3d0'}`,
                          }}
                        >
                          {b.assignedSlotCount}/6 SP
                        </span>
                      </div>
                      {filterZoneCode === 'ALL' && (
                        <div style={{ fontSize: 11.5, color: '#526071', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.zoneName}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, marginTop: 2 }}>
                        <span style={{ color: isEmptyBooth ? '#dc2626' : '#059669', fontWeight: 600 }}>
                          {isEmptyBooth ? 'Chưa có sản phẩm' : 'Đang trưng bày'}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13 }}>
              <span style={{ color: '#526071', fontVariantNumeric: 'tabular-nums' }}>
                Trang {safePage} / {totalPages} (Tổng {filteredBooths.length} gian hàng)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{ minHeight: 32, padding: '0 12px', fontSize: 12.5 }}
                >
                  ← Trước
                </button>
                <button
                  type="button"
                  className="v28-btn v28-btn--secondary"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{ minHeight: 32, padding: '0 12px', fontSize: 12.5 }}
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
              onClose={() => setSelectedBooth(null)}
              onAssignSlot={handleAssignSlot}
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
