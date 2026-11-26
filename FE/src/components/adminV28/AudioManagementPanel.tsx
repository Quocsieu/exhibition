import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/apiConfig';
import {
  v28AudioApi,
  type V28AudioBatchJobStatus,
  type V28AudioMode,
  type V28NeutralVoiceProfile,
  type V28NeutralVoiceProfileId,
  type V28VoiceApprovalRecord,
} from '../../services/v28Api';

const FALLBACK_VOICE_PROFILES: V28NeutralVoiceProfile[] = [
  {
    id: 'female_standard',
    label: 'Giọng nữ tiêu chuẩn (Rõ ràng, chuyên nghiệp)',
    gender: 'female',
    description: 'Phù hợp giới thiệu gian hàng và tư vấn thông số sản phẩm.',
    recommended: true,
  },
  {
    id: 'male_standard',
    label: 'Giọng nam tiêu chuẩn (Trầm ấm, tự nhiên)',
    gender: 'male',
    description: 'Giọng nam rõ ràng, tạo cảm giác tin cậy khi tư vấn.',
  },
  {
    id: 'female_warm',
    label: 'Giọng nữ thân thiện (Nhẹ nhàng, gần gũi)',
    gender: 'female',
    description: 'Phù hợp lời chào đón khách tham quan và sản phẩm nông sản/tiêu dùng.',
  },
];

const MODE_CARDS: Array<{
  mode: V28AudioMode;
  title: string;
  subtitle: string;
  accent: string;
  bg: string;
}> = [
    {
      mode: 'AUTO',
      title: 'Tự động (AUTO)',
      subtitle: 'Chế độ mặc định — hệ thống tự chọn giọng đọc phù hợp và ưu tiên audio hợp lệ đã lưu.',
      accent: '#0284c7',
      bg: '#f0f9ff',
    },
    {
      mode: 'AI_GENERATED',
      title: 'AI tạo giọng',
      subtitle: 'Chọn giọng nam/nữ trung lập, tốc độ đọc, nghe thử & duyệt mẫu trước khi tạo hàng loạt.',
      accent: '#7c3aed',
      bg: '#f5f3ff',
    },
    {
      mode: 'RECORDED',
      title: 'Tự thu âm',
      subtitle: 'Thu âm trực tiếp bằng micro hoặc tải file ghi âm lên để áp dụng cho nhân viên.',
      accent: '#d97706',
      bg: '#fffbeb',
    },
  ];

const DEFAULT_PREVIEW_SCRIPT =
  'Xin chào quý khách đến với gian hàng triển lãm. Mời quý khách tham quan các sản phẩm nổi bật của chúng tôi.';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc dữ liệu âm thanh.'));
    reader.readAsDataURL(blob);
  });
}

function resolveAudioSrc(url?: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:')) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

export interface AudioManagementPanelProps {
  activeWorld?: unknown;
}

/**
 * Admin Audio & Voice Management Panel (Phase 1.3).
 *
 * Strictly enforces:
 * - NO TTS provider/engine selection UI (Backend handles Gemini -> Vbee -> Edge automatically).
 * - Neutral voice profiles only (Female / Male / Warm Female), speed, optional style.
 * - Mandatory 3-step AI flow: Preview -> Explicit Approve -> Apply & Batch (locked to approved voice).
 * - Accurate active-exhibition scope stats (occupied booths vs total slots, real speech audio only).
 */
export const AudioManagementPanel: React.FC<AudioManagementPanelProps> = () => {
  const [voiceProfiles, setVoiceProfiles] = useState<V28NeutralVoiceProfile[]>(FALLBACK_VOICE_PROFILES);

  const [npcTargetCounts, setNpcTargetCounts] = useState({ booths: 0, welcome: 0, products: 0 });
  const [overviewStats, setOverviewStats] = useState<{
    totalAssets: number;
    readyCount: number;
    boothReadyCount: number;
    productReadyCount: number;
    failedCount: number;
    currentFailedEntities: number;
    historicalFailedRows: number;
    needsUpdateCount: number;
    uploadedCount: number;
    occupiedBoothCount: number;
    totalBoothSlots: number;
    activeProductCount: number;
  } | null>(null);

  const [selectedMode, setSelectedMode] = useState<V28AudioMode>('AUTO');

  // Neutral AI voice settings (NO provider dropdown)
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState<V28NeutralVoiceProfileId>('female_standard');
  const [selectedSpeed, setSelectedSpeed] = useState<number>(1.0);
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [previewSample, setPreviewSample] = useState<V28VoiceApprovalRecord | null>(null);
  const [previewLimitations, setPreviewLimitations] = useState<string[]>([]);
  const [previewApproved, setPreviewApproved] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Manual Recording / File Upload Settings
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedFilename, setRecordedFilename] = useState<string>('npc-voice-recording.webm');
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Bulk execution & feedback state
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bulkProgressText, setBulkProgressText] = useState<string | null>(null);
  const [activeBatchJob, setActiveBatchJob] = useState<V28AudioBatchJobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const [provRes, ovRes, batchRes, boothList, welcomeList, prodList] = await Promise.all([
        v28AudioApi.getProviders(),
        v28AudioApi.getOverview(10).catch(() => null),
        v28AudioApi.listBatchJobs(5).catch(() => ({ jobs: [] })),
        v28AudioApi.listAdminItems({ entityType: 'booth', page: 1, limit: 1 }).catch(() => null),
        v28AudioApi.listAdminItems({ entityType: 'welcome', page: 1, limit: 1 }).catch(() => null),
        v28AudioApi.listAdminItems({ entityType: 'product', page: 1, limit: 1 }).catch(() => null),
      ]);

      if (provRes.voiceProfiles && provRes.voiceProfiles.length > 0) {
        setVoiceProfiles(provRes.voiceProfiles);
      }

      const latestOpenJob = (batchRes.jobs || []).find(
        (j) => j.status === 'running' || j.status === 'queued' || j.status === 'paused'
      );
      if (latestOpenJob) {
        setActiveBatchJob((prev) => prev || latestOpenJob);
      }

      setNpcTargetCounts({
        booths: boothList?.total ?? 0,
        welcome: welcomeList?.total ?? 0,
        products: prodList?.total ?? 0,
      });

      if (ovRes?.overview) {
        const ov = ovRes.overview;
        setOverviewStats({
          totalAssets: ov.totalAssets,
          readyCount: ov.realReadyCount ?? ov.readyCount,
          boothReadyCount: ov.boothReadyCount ?? 0,
          productReadyCount: ov.productReadyCount ?? 0,
          failedCount: ov.failedCount ?? 0,
          currentFailedEntities: ov.currentFailedEntities ?? 0,
          historicalFailedRows: ov.historicalFailedRows ?? ov.failedCount ?? 0,
          needsUpdateCount: ov.needsUpdateCount ?? 0,
          uploadedCount: ov.uploadedCount ?? 0,
          occupiedBoothCount: ov.scope?.occupiedBoothCount ?? 0,
          totalBoothSlots: ov.scope?.totalBoothSlots ?? (boothList?.total ?? 0),
          activeProductCount: ov.scope?.activeProductCount ?? (prodList?.total ?? 0),
        });
      }
    } catch (err) {
      setError((err as Error).message || 'Không thể tải cấu hình âm thanh.');
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const invalidateCurrentPreview = () => {
    setPreviewSample(null);
    setPreviewLimitations([]);
    setPreviewApproved(false);
  };

  useEffect(() => {
    if (!activeBatchJob) return;
    if (
      activeBatchJob.status === 'completed' ||
      activeBatchJob.status === 'failed' ||
      activeBatchJob.status === 'cancelled' ||
      activeBatchJob.status === 'paused'
    ) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await v28AudioApi.getBatchJob(activeBatchJob.jobId);
        setActiveBatchJob(res.job);
        if (
          res.job.status === 'completed' ||
          res.job.status === 'failed' ||
          res.job.status === 'cancelled' ||
          res.job.status === 'paused'
        ) {
          void loadSummary();
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeBatchJob, loadSummary]);

  useEffect(() => {
    return () => {
      if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
    };
  }, [recordedPreviewUrl]);

  const fetchAllEntityIds = async (): Promise<{
    boothIds: string[];
    welcomeIds: string[];
    productIds: string[];
  }> => {
    const collectIds = async (entityType: 'booth' | 'welcome' | 'product'): Promise<string[]> => {
      const ids: string[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages && page <= 20) {
        const res = await v28AudioApi.listAdminItems({ entityType, page, limit: 100 });
        for (const item of res.items || []) {
          if (item.entityId) ids.push(item.entityId);
        }
        totalPages = res.totalPages || 1;
        page++;
      }
      return Array.from(new Set(ids));
    };
    const [boothIds, welcomeIds, productIds] = await Promise.all([
      collectIds('booth'),
      collectIds('welcome'),
      collectIds('product'),
    ]);
    return { boothIds, welcomeIds, productIds };
  };

  const handleApplyAutoBulk = async () => {
    setBusyAction('apply-auto');
    setError(null);
    setNotice(null);
    setBulkProgressText('Đang áp dụng chế độ Tự động (AUTO) cho toàn bộ nhân viên...');
    try {
      const { boothIds, welcomeIds, productIds } = await fetchAllEntityIds();
      let updated = 0;
      if (boothIds.length > 0) {
        const r = await v28AudioApi.bulkSetEntityMode({
          entityType: 'booth',
          entityIds: boothIds,
          audioMode: 'AUTO',
        });
        updated += r.updatedCount;
      }
      if (welcomeIds.length > 0) {
        const r = await v28AudioApi.bulkSetEntityMode({
          entityType: 'welcome',
          entityIds: welcomeIds,
          audioMode: 'AUTO',
        });
        updated += r.updatedCount;
      }
      if (productIds.length > 0) {
        const r = await v28AudioApi.bulkSetEntityMode({
          entityType: 'product',
          entityIds: productIds,
          audioMode: 'AUTO',
        });
        updated += r.updatedCount;
      }
      setNotice(
        `Đã áp dụng chế độ Tự động (AUTO) cho toàn bộ nhân viên trên web (${updated} mục).`
      );
      await loadSummary();
    } catch (err) {
      setError((err as Error).message || 'Không thể áp dụng chế độ Tự động hàng loạt.');
    } finally {
      setBusyAction(null);
      setBulkProgressText(null);
    }
  };

  const handlePreviewAiVoice = async () => {
    setBusyAction('preview-ai');
    setError(null);
    setNotice(null);
    setPreviewApproved(false);
    setPreviewLimitations([]);
    try {
      const res = await v28AudioApi.previewVoice({
        voiceProfile: selectedVoiceProfile,
        speed: selectedSpeed,
        style: selectedStyle.trim() || undefined,
        transcript: DEFAULT_PREVIEW_SCRIPT,
      });
      setPreviewSample(res.preview);
      setPreviewLimitations(res.limitations || []);
      setPreviewApproved(res.preview.status === 'approved');
      setNotice(
        res.preview.status === 'approved'
          ? 'Đã tải giọng mẫu AI đã duyệt. Bạn có thể nghe lại hoặc bắt đầu tạo hàng loạt.'
          : 'Đã tạo giọng mẫu AI thành công. Vui lòng nghe thử bên dưới và bấm "Xác nhận duyệt giọng mẫu này" nếu hài lòng.'
      );
      await loadSummary();
    } catch (err) {
      setPreviewSample(null);
      setError((err as Error).message || 'Không thể tạo mẫu nghe thử giọng AI.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApprovePreviewVoice = async () => {
    if (!previewSample?.configSignature) {
      setError('Vui lòng nhấn "Nghe thử giọng AI" trước khi xác nhận duyệt mẫu.');
      return;
    }
    setBusyAction('approve-ai');
    setError(null);
    setNotice(null);
    try {
      const res = await v28AudioApi.approveVoice(previewSample.configSignature);
      setPreviewSample(res.approval);
      setPreviewApproved(true);
      setNotice('Đã xác nhận duyệt giọng mẫu AI. Bạn có thể bấm "Áp dụng & Tạo audio hàng loạt" bất cứ lúc nào.');
      await loadSummary();
    } catch (err) {
      setError((err as Error).message || 'Không thể xác nhận duyệt giọng mẫu.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyAiBulk = async () => {
    if (!previewSample?.configSignature || !previewApproved) {
      setError('Vui lòng nghe thử và bấm "Xác nhận duyệt giọng mẫu này" trước khi tạo audio hàng loạt.');
      return;
    }
    setBusyAction('apply-ai');
    setError(null);
    setNotice(null);
    setBulkProgressText('Đang lưu cấu hình giọng AI đã duyệt và khởi chạy tạo audio hàng loạt...');
    try {
      const { boothIds, welcomeIds, productIds } = await fetchAllEntityIds();
      const bulkPayload = {
        audioMode: 'AI_GENERATED' as const,
        preferredProvider: previewSample.provider,
        modelId: previewSample.modelId,
        voiceId: previewSample.voiceId,
        speed: previewSample.speed,
        style: previewSample.style || undefined,
      };
      if (boothIds.length > 0) {
        await v28AudioApi.bulkSetEntityMode({ entityType: 'booth', entityIds: boothIds, ...bulkPayload });
      }
      if (welcomeIds.length > 0) {
        await v28AudioApi.bulkSetEntityMode({ entityType: 'welcome', entityIds: welcomeIds, ...bulkPayload });
      }
      if (productIds.length > 0) {
        await v28AudioApi.bulkSetEntityMode({ entityType: 'product', entityIds: productIds, ...bulkPayload });
      }

      const batchRes = await v28AudioApi.startBatch({
        confirmed: true,
        entityType: 'all',
        includeNeedsUpdate: true,
        configSignature: previewSample.configSignature,
      });
      setActiveBatchJob(batchRes.job);
      const profileLabel =
        voiceProfiles.find((p) => p.id === selectedVoiceProfile)?.label || selectedVoiceProfile;
      setNotice(
        `Đã chuyển toàn bộ nhân viên sang chế độ AI (${profileLabel}) và bắt đầu tạo audio hàng loạt theo đúng mẫu đã duyệt.`
      );
      await loadSummary();
    } catch (err) {
      setError((err as Error).message || 'Không thể tạo giọng AI hàng loạt.');
    } finally {
      setBusyAction(null);
      setBulkProgressText(null);
    }
  };

  const handleStartRecording = async () => {
    setError(null);
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: mimeType.split(';')[0] });
        setRecordedBlob(blob);
        setRecordedFilename(`npc-recorded-${Date.now()}.webm`);
        if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
        setRecordedPreviewUrl(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(`Không thể truy cập micro: ${(err as Error).message}`);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleSelectAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setNotice(null);
    setRecordedBlob(file);
    setRecordedFilename(file.name);
    if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
    setRecordedPreviewUrl(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleApplyRecordedBulk = async () => {
    if (!recordedBlob) {
      setError('Vui lòng thu âm bằng micro hoặc chọn 1 file âm thanh trước khi áp dụng hàng loạt.');
      return;
    }
    setBusyAction('apply-recorded');
    setError(null);
    setNotice(null);
    try {
      const fileBase64 = await blobToBase64(recordedBlob);
      const mimeType = recordedBlob.type || 'audio/webm';
      const { boothIds, welcomeIds } = await fetchAllEntityIds();

      const targets: Array<{ entityType: 'booth' | 'welcome'; entityId: string }> = [
        ...welcomeIds.map((entityId) => ({ entityType: 'welcome' as const, entityId })),
        ...boothIds.map((entityId) => ({ entityType: 'booth' as const, entityId })),
      ];

      if (targets.length === 0) {
        setError('Chưa có gian hàng hoặc nhân viên nào trong triển lãm để áp dụng.');
        return;
      }

      if (boothIds.length > 0) {
        await v28AudioApi.bulkSetEntityMode({
          entityType: 'booth',
          entityIds: boothIds,
          audioMode: 'RECORDED',
        });
      }
      if (welcomeIds.length > 0) {
        await v28AudioApi.bulkSetEntityMode({
          entityType: 'welcome',
          entityIds: welcomeIds,
          audioMode: 'RECORDED',
        });
      }

      let done = 0;
      let failed = 0;
      const chunkSize = 4;
      for (let i = 0; i < targets.length; i += chunkSize) {
        const slice = targets.slice(i, i + chunkSize);
        setBulkProgressText(`Đang áp dụng bản thu âm cho nhân viên (${done}/${targets.length})...`);
        await Promise.all(
          slice.map(async (t) => {
            try {
              const up = await v28AudioApi.uploadAdminAudio({
                entityType: t.entityType,
                entityId: t.entityId,
                slotKey: 'intro',
                filename: recordedFilename,
                mimeType,
                fileBase64,
              });
              if (up.asset?.audioId) {
                await v28AudioApi.confirmUploadedAudio(up.asset.audioId);
              }
              done++;
            } catch {
              failed++;
            }
          })
        );
      }

      setNotice(
        `Đã áp dụng bản thu âm hàng loạt cho ${done}/${targets.length} nhân viên trên web${failed > 0 ? ` (${failed} lỗi)` : ''}.`
      );
      await loadSummary();
    } catch (err) {
      setError((err as Error).message || 'Không thể áp dụng bản thu âm hàng loạt.');
    } finally {
      setBusyAction(null);
      setBulkProgressText(null);
    }
  };

  const handleResumeBatch = async () => {
    if (!activeBatchJob) return;
    setError(null);
    setNotice(null);
    try {
      const res = await v28AudioApi.resumeBatchJob(activeBatchJob.jobId);
      setActiveBatchJob(res.job);
      setNotice('Đã tiếp tục tiến trình tạo audio hàng loạt (chỉ xử lý các mục còn thiếu/lỗi).');
    } catch (err) {
      setError((err as Error).message || 'Không thể tiếp tục tiến trình tạo hàng loạt.');
    }
  };

  const handleCancelBatch = async () => {
    if (!activeBatchJob) return;
    try {
      await v28AudioApi.cancelBatchJob(activeBatchJob.jobId);
      const refreshed = await v28AudioApi.getBatchJob(activeBatchJob.jobId);
      setActiveBatchJob(refreshed.job);
    } catch (err) {
      setError((err as Error).message || 'Không thể hủy tiến trình tạo hàng loạt.');
    }
  };

  const batchPercent =
    activeBatchJob && activeBatchJob.totalItems > 0
      ? Math.min(100, Math.round((activeBatchJob.completedItems / activeBatchJob.totalItems) * 100))
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Clean Header Summary */}
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              Cấu hình Giọng đọc Nhân viên Tư vấn
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Chọn chế độ giọng đọc bên dưới. Hệ thống tự động điều phối công nghệ TTS phù hợp ở máy chủ.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5, color: '#334155' }}>
            <span
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontWeight: 600,
              }}
            >
              Gian hàng có sản phẩm:{' '}
              <strong>{overviewStats?.occupiedBoothCount ?? npcTargetCounts.booths}</strong>
              {overviewStats && overviewStats.totalBoothSlots > 0 ? (
                <span style={{ color: '#64748b', fontWeight: 500 }}>
                  {' '}
                  / {overviewStats.totalBoothSlots} ô
                </span>
              ) : null}
            </span>
            <span
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontWeight: 600,
              }}
            >
              Sản phẩm trưng bày:{' '}
              <strong>{overviewStats?.activeProductCount ?? npcTargetCounts.products}</strong>
            </span>
            {overviewStats && (
              <span
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontWeight: 600,
                }}
              >
                Audio giọng thật sẵn sàng: <strong>{overviewStats.readyCount}</strong>
                <span style={{ fontWeight: 500 }}>
                  {' '}
                  (Nhân viên: {overviewStats.boothReadyCount} · Sản phẩm: {overviewStats.productReadyCount})
                </span>
              </span>
            )}
            {overviewStats && (overviewStats.currentFailedEntities > 0 || overviewStats.needsUpdateCount > 0) && (
              <span
                style={{
                  padding: '5px 10px',
                  borderRadius: 8,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  color: '#9a3412',
                  fontWeight: 600,
                }}
              >
                Mục lỗi hiện tại: <strong>{overviewStats.currentFailedEntities}</strong>
                <span style={{ fontWeight: 500 }}> (lịch sử: {overviewStats.historicalFailedRows})</span>
                {' '}· Cần cập nhật: <strong>{overviewStats.needsUpdateCount}</strong>
              </span>
            )}
          </div>
        </div>

        {/* 3 Voice Mode Selector Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {MODE_CARDS.map((card) => {
            const active = selectedMode === card.mode;
            return (
              <button
                key={card.mode}
                type="button"
                data-testid={`v28-npc-voice-mode-${card.mode}`}
                onClick={() => {
                  setSelectedMode(card.mode);
                  setError(null);
                  setNotice(null);
                }}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 12,
                  border: active ? `2px solid ${card.accent}` : '1px solid #cbd5e1',
                  background: active ? card.bg : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: active ? card.accent : '#0f172a' }}>
                    {card.title}
                  </span>
                  {active && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: card.accent,
                        color: '#fff',
                      }}
                    >
                      Đang chọn
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.45 }}>{card.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback banners */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#15803d',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {notice}
        </div>
      )}
      {bulkProgressText && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1d4ed8',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {bulkProgressText}
        </div>
      )}

      {/* Mode-Specific Configuration & Bulk Action Panel */}
      <div
        style={{
          background: '#fff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {selectedMode === 'AUTO' && (
          <>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Chế độ Tự động (AUTO)
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              Nhân viên tư vấn tự động ưu tiên phát audio hợp lệ đã lưu; nếu chưa có sẽ tự tạo giọng tiếng Việt phù hợp và lưu cache cho các lượt nghe sau.
            </p>
            <div>
              <button
                type="button"
                data-testid="v28-npc-voice-apply-auto"
                disabled={busyAction !== null}
                onClick={() => void handleApplyAutoBulk()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: busyAction ? '#94a3b8' : '#0284c7',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: busyAction ? 'not-allowed' : 'pointer',
                }}
              >
                {busyAction === 'apply-auto'
                  ? 'Đang áp dụng...'
                  : 'Áp dụng Tự động cho toàn bộ nhân viên'}
              </button>
            </div>
          </>
        )}

        {selectedMode === 'AI_GENERATED' && (
          <>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Chế độ AI tạo giọng
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                Giọng đọc
                <select
                  data-testid="v28-npc-voice-profile-select"
                  value={selectedVoiceProfile}
                  onChange={(e) => {
                    setSelectedVoiceProfile(e.target.value as V28NeutralVoiceProfileId);
                    invalidateCurrentPreview();
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                    background: '#fff',
                  }}
                >
                  {voiceProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                Tốc độ đọc ({selectedSpeed.toFixed(2)}x)
                <input
                  type="range"
                  min={0.75}
                  max={1.25}
                  step={0.05}
                  value={selectedSpeed}
                  onChange={(e) => {
                    setSelectedSpeed(Number(e.target.value));
                    invalidateCurrentPreview();
                  }}
                  style={{ marginTop: 8 }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                Phong cách (nếu được hỗ trợ)
                <input
                  type="text"
                  value={selectedStyle}
                  onChange={(e) => {
                    setSelectedStyle(e.target.value);
                    invalidateCurrentPreview();
                  }}
                  placeholder="VD: tự nhiên, thân thiện, chuyên nghiệp"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                  }}
                />
              </label>
            </div>

            {previewSample?.sampleAudioUrl && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: previewApproved ? '#f0fdf4' : '#f8fafc',
                  border: previewApproved ? '1px solid #86efac' : '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                    Mẫu giọng AI đã tạo (tốc độ {previewSample.speed.toFixed(2)}x)
                    {previewApproved ? ' — Đã duyệt' : ' — Chờ bạn nghe thử & duyệt'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewAudioRef.current) {
                        previewAudioRef.current.currentTime = 0;
                        void previewAudioRef.current.play();
                      }
                    }}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      color: '#334155',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Nghe lại
                  </button>
                </div>
                <audio
                  ref={previewAudioRef}
                  controls
                  src={resolveAudioSrc(previewSample.sampleAudioUrl)}
                  style={{ width: '100%' }}
                />
                {previewLimitations.length > 0 && (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#92400e',
                      background: '#fffbeb',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #fde68a',
                    }}
                  >
                    Lưu ý giới hạn: {previewLimitations.join(' ')}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                data-testid="v28-npc-voice-preview-ai"
                disabled={busyAction !== null}
                onClick={() => void handlePreviewAiVoice()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid #7c3aed',
                  background: '#f5f3ff',
                  color: '#6d28d9',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: busyAction ? 'not-allowed' : 'pointer',
                }}
              >
                {busyAction === 'preview-ai' ? 'Đang tạo mẫu giọng...' : '1. Nghe thử giọng AI'}
              </button>

              {previewSample?.sampleAudioUrl && !previewApproved && (
                <button
                  type="button"
                  data-testid="v28-npc-voice-approve-ai"
                  disabled={busyAction !== null}
                  onClick={() => void handleApprovePreviewVoice()}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: busyAction ? '#94a3b8' : '#16a34a',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busyAction ? 'not-allowed' : 'pointer',
                  }}
                >
                  {busyAction === 'approve-ai' ? 'Đang xác nhận...' : '2. Xác nhận duyệt giọng mẫu này'}
                </button>
              )}

              <button
                type="button"
                data-testid="v28-npc-voice-apply-ai"
                disabled={busyAction !== null || !previewApproved}
                onClick={() => void handleApplyAiBulk()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: busyAction || !previewApproved ? '#94a3b8' : '#7c3aed',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: busyAction || !previewApproved ? 'not-allowed' : 'pointer',
                }}
              >
                {busyAction === 'apply-ai'
                  ? 'Đang khởi chạy...'
                  : '3. Áp dụng & Tạo audio hàng loạt theo mẫu đã duyệt'}
              </button>
            </div>
          </>
        )}

        {selectedMode === 'RECORDED' && (
          <>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Chế độ Tự thu âm (Micro / Tải file âm thanh)
            </h3>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              Hệ thống sẽ phát trực tiếp bản thu âm hợp lệ của bạn và không gọi TTS.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {!isRecording ? (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleStartRecording()}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 10,
                    border: '1px solid #d97706',
                    background: '#fffbeb',
                    color: '#b45309',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: busyAction ? 'not-allowed' : 'pointer',
                  }}
                >
                  Bắt đầu thu âm (Micro)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#dc2626',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Dừng thu âm
                </button>
              )}

              <label
                style={{
                  padding: '9px 16px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Tải file âm thanh (MP3/WAV/OGG/WebM)
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleSelectAudioFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {recordedPreviewUrl && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                  Nghe lại bản thu âm ({recordedFilename}):
                </span>
                <audio controls src={recordedPreviewUrl} style={{ width: '100%' }} />
              </div>
            )}

            <div>
              <button
                type="button"
                data-testid="v28-npc-voice-apply-recorded"
                disabled={busyAction !== null || !recordedBlob}
                onClick={() => void handleApplyRecordedBulk()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: busyAction || !recordedBlob ? '#94a3b8' : '#d97706',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: busyAction || !recordedBlob ? 'not-allowed' : 'pointer',
                }}
              >
                {busyAction === 'apply-recorded'
                  ? 'Đang áp dụng bản thu âm...'
                  : 'Lưu & Áp dụng bản thu âm cho nhân viên'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Active Batch Job Progress */}
      {activeBatchJob && (
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #e2e8f0',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              Tiến trình tạo audio hàng loạt ({activeBatchJob.status}) — {batchPercent}%
            </strong>
            <div style={{ display: 'flex', gap: 8 }}>
              {(activeBatchJob.status === 'paused' || activeBatchJob.status === 'failed') && (
                <button
                  type="button"
                  data-testid="v28-npc-batch-resume"
                  onClick={() => void handleResumeBatch()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#0284c7',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Tiếp tục Batch (Thử lại mục lỗi)
                </button>
              )}
              {(activeBatchJob.status === 'running' ||
                activeBatchJob.status === 'queued' ||
                activeBatchJob.status === 'paused') && (
                <button
                  type="button"
                  onClick={() => void handleCancelBatch()}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Hủy tiến trình
                </button>
              )}
            </div>
          </div>
          {activeBatchJob.pauseReason && (
            <div style={{ fontSize: 12.5, color: '#b45309', background: '#fffbeb', padding: '8px 12px', borderRadius: 8, border: '1px solid #fde68a' }}>
              Tạm dừng: {activeBatchJob.pauseReason}
            </div>
          )}
          <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
            <div
              style={{
                width: `${batchPercent}%`,
                height: '100%',
                background: activeBatchJob.status === 'failed' ? '#ef4444' : '#0284c7',
                transition: 'width 0.25s ease',
              }}
            />
          </div>
          <div style={{ fontSize: 12.5, color: '#475569' }}>
            Đã xử lý: <strong>{activeBatchJob.completedItems}/{activeBatchJob.totalItems}</strong> · Thành công:{' '}
            <strong style={{ color: '#15803d' }}>{activeBatchJob.succeededItems}</strong> · Lỗi:{' '}
            <strong style={{ color: '#b91c1c' }}>{activeBatchJob.failedItems}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
