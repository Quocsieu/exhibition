import crypto from 'node:crypto';
import type { V28CatalogDatabase } from '../../../database/v28Database.js';
import type { V28AudioCacheService } from '../audioCacheService.js';
import type { V28VoiceApprovalService } from './voiceApprovalService.js';
import type { TtsProviderId } from './ttsTypes.js';

export interface BatchEstimateResult {
  totalTargets: number;
  skippedAlreadyReady: number;
  skippedManualUploaded: number;
  totalCharacters: number;
  estimatedDurationSec: number;
  estimatedCostNote: string;
  concurrency: number;
  voiceApproved: boolean;
  approvedConfigSignature: string | null;
  targets: Array<{
    entityType: 'product' | 'booth' | 'welcome';
    entityId: string;
    slotKey: string;
    label: string;
    chars: number;
    reason: 'missing' | 'needs_update' | 'failed';
  }>;
}

export interface BatchJobErrorItem {
  entityType: string;
  entityId: string;
  label: string;
  error: string;
}

export interface AudioBatchJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  totalItems: number;
  completedItems: number;
  succeededItems: number;
  failedItems: number;
  skippedItems: number;
  concurrency: number;
  providerOverride: string;
  voiceId: string;
  approvalId: string;
  pauseReason: string;
  createdBy: string;
  errors: BatchJobErrorItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Bounded-concurrency background batch audio generator with:
 * - Backend-enforced Voice Approval gate (Phase 1.1.3)
 * - Trial sizes (1, 5, 10, selected entityIds, or all)
 * - Skips already-valid audio and NEVER overwrites RECORDED/uploaded recordings
 * - Strict NO-SILENT-FALLBACK: pauses batch on approved provider error so Admin decides next step
 * - Progress tracking & cancellation
 */
export class V28AudioBatchManager {
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    private readonly v28Db: V28CatalogDatabase,
    private readonly audioCacheService: V28AudioCacheService,
    private readonly voiceApprovalService: V28VoiceApprovalService
  ) {}

  private get db() {
    return this.v28Db.getConnection();
  }

  public estimateBatch(options?: {
    entityType?: 'product' | 'booth' | 'welcome' | 'all';
    companyId?: string;
    entityIds?: string[];
    includeNeedsUpdate?: boolean;
    onlyMissing?: boolean;
    limit?: number;
    providerOverride?: TtsProviderId;
    modelId?: string;
    voiceId?: string;
    speed?: number;
    style?: string;
  }): BatchEstimateResult {
    const scope = options?.entityType || 'product';
    const includeNeedsUpdate = options?.includeNeedsUpdate !== false;
    const onlyMissing = Boolean(options?.onlyMissing);
    const maxItems = Math.max(1, Math.min(300, options?.limit ?? 200));
    const selectedSet =
      Array.isArray(options?.entityIds) && options.entityIds.length > 0
        ? new Set(options.entityIds.map((id) => id.trim()).filter(Boolean))
        : null;

    const items = this.audioCacheService.listAdminAudioItems({
      entityType: scope,
      companyId: options?.companyId,
      limit: 500,
      page: 1,
    }).items;

    const targets: BatchEstimateResult['targets'] = [];
    let skippedAlreadyReady = 0;
    let skippedManualUploaded = 0;
    let totalCharacters = 0;

    for (const item of items) {
      if (selectedSet && !selectedSet.has(item.entityId)) continue;
      // NEVER overwrite RECORDED mode or uploaded audio during batch!
      if (item.audioMode === 'RECORDED' || item.sourceType === 'uploaded') {
        skippedManualUploaded++;
        continue;
      }
      if (item.status === 'ready' && !item.needsUpdate) {
        skippedAlreadyReady++;
        continue;
      }
      if (onlyMissing && item.status !== 'missing') {
        skippedAlreadyReady++;
        continue;
      }
      if (!includeNeedsUpdate && item.status === 'needs_update') {
        skippedAlreadyReady++;
        continue;
      }
      const transcript = (item.transcript || item.defaultTranscript || '').trim();
      if (!transcript) continue;
      if (targets.length >= maxItems) break;

      const reason: 'missing' | 'needs_update' | 'failed' =
        item.status === 'needs_update'
          ? 'needs_update'
          : item.status === 'failed'
            ? 'failed'
            : 'missing';
      targets.push({
        entityType: item.entityType,
        entityId: item.entityId,
        slotKey: item.slotKey,
        label: item.entityName,
        chars: transcript.length,
        reason,
      });
      totalCharacters += transcript.length;
    }

    const cfg = this.audioCacheService.ttsService.getConfigSnapshot();
    const approved = this.voiceApprovalService.getApprovedConfig({
      provider: options?.providerOverride,
      modelId: options?.modelId,
      voiceId: options?.voiceId,
      speed: options?.speed,
      style: options?.style,
    });
    // ~15 Vietnamese chars/sec speaking pace
    const estimatedDurationSec = Math.round((totalCharacters / 15) * 10) / 10;
    const estimatedCostNote =
      targets.length === 0
        ? 'Không có mục nào cần tạo mới.'
        : `Ước tính ${targets.length} sản phẩm (~${totalCharacters.toLocaleString('vi-VN')} ký tự, ~${estimatedDurationSec}s audio). Chi phí thực tế phụ thuộc bảng giá hiện hành của provider đã duyệt.`;

    return {
      totalTargets: targets.length,
      skippedAlreadyReady,
      skippedManualUploaded,
      totalCharacters,
      estimatedDurationSec,
      estimatedCostNote,
      concurrency: cfg.batchConcurrency,
      voiceApproved: Boolean(approved),
      approvedConfigSignature: approved?.configSignature ?? null,
      targets,
    };
  }

  private isFatalProviderError(err: unknown): boolean {
    const msg = String((err as Error)?.message || '').toLowerCase();
    const kind = String((err as { kind?: string })?.kind || '').toLowerCase();
    return (
      kind === 'permission_denied' ||
      kind === 'config_missing' ||
      kind === 'disabled' ||
      kind === 'budget_exceeded' ||
      msg.includes('permission_denied') ||
      msg.includes('config_missing') ||
      msg.includes('budget_exceeded') ||
      msg.includes('http 401') ||
      msg.includes('http 403') ||
      msg.includes('unauthenticated')
    );
  }

  private async sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0 || signal.aborted) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  public startBatch(params: {
    confirmed: boolean;
    entityType?: 'product' | 'booth' | 'welcome' | 'all';
    companyId?: string;
    entityIds?: string[];
    includeNeedsUpdate?: boolean;
    onlyMissing?: boolean;
    configSignature?: string;
    approvalId?: string;
    providerOverride?: TtsProviderId;
    modelId?: string;
    voiceId?: string;
    speed?: number;
    style?: string;
    concurrency?: number;
    createdBy?: string;
    limit?: number;
  }): AudioBatchJobStatus {
    if (!params.confirmed) {
      const err = new Error(
        'Vui lòng xác nhận chạy tạo audio hàng loạt trước khi bắt đầu (confirmed=true).'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    // Prevent two conflicting batch jobs from running simultaneously
    if (this.activeControllers.size > 0) {
      const err = new Error(
        'Đang có một tiến trình tạo audio hàng loạt chạy nền. Vui lòng chờ hoàn tất hoặc hủy tiến trình hiện tại trước khi tạo mới.'
      ) as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }

    // Phase 1.1.3 & 1.3.2: Backend-enforced Voice Approval gate!
    // Supports resolving directly by approved `configSignature` (so Admin UI never picks a provider),
    // while preserving backward compatibility with explicit provider/voiceId lookup.
    let approved = params.configSignature
      ? this.voiceApprovalService.getApprovalBySignature(params.configSignature)
      : null;
    if (approved && approved.status !== 'approved') {
      approved = null;
    }
    if (!approved && !params.configSignature) {
      approved = this.voiceApprovalService.getApprovedConfig({
        provider: params.providerOverride,
        modelId: params.modelId,
        voiceId: params.voiceId,
        speed: params.speed,
        style: params.style,
      });
    }
    if (!approved) {
      const err = new Error(
        'VOICE_APPROVAL_REQUIRED: Cấu hình giọng đọc này chưa được tạo mẫu và xác nhận duyệt. Vui lòng tạo mẫu, nghe thử và bấm "Xác nhận duyệt giọng mẫu này" trước khi tạo hàng loạt.'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const estimate = this.estimateBatch({
      entityType: params.entityType,
      companyId: params.companyId,
      entityIds: params.entityIds,
      includeNeedsUpdate: params.includeNeedsUpdate,
      onlyMissing: params.onlyMissing,
      limit: params.limit,
      providerOverride: approved.provider,
      modelId: approved.modelId,
      voiceId: approved.voiceId,
      speed: approved.speed,
      style: approved.style,
    });

    const cfg = this.audioCacheService.ttsService.getConfigSnapshot();
    const requestedConcurrency = Math.max(
      1,
      Math.min(5, Math.floor(params.concurrency ?? cfg.batchConcurrency))
    );
    // Unofficial Edge CLI consumer endpoint throttles concurrent bursts -> cap to 1 safely
    const concurrency =
      approved.provider === 'edge' && !cfg.azureSpeechKey ? 1 : requestedConcurrency;
    const jobId = `batch-${crypto.randomBytes(6).toString('hex')}`;
    const nowIso = new Date().toISOString();

    const initialStatus: AudioBatchJobStatus['status'] =
      estimate.totalTargets === 0 ? 'completed' : 'running';

    this.db
      .prepare(
        `INSERT INTO audio_batch_jobs (
          job_id, status, total_items, completed_items, succeeded_items, failed_items, skipped_items,
          concurrency, provider_override, voice_id, approval_id, pause_reason, created_by, errors_json, created_at, updated_at
        ) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?, '', ?, '[]', ?, ?)`
      )
      .run(
        jobId,
        initialStatus,
        estimate.totalTargets,
        estimate.skippedAlreadyReady + estimate.skippedManualUploaded,
        concurrency,
        approved.provider,
        approved.voiceId,
        approved.approvalId,
        params.createdBy || 'admin',
        nowIso,
        nowIso
      );

    if (estimate.totalTargets > 0) {
      const controller = new AbortController();
      this.activeControllers.set(jobId, controller);

      void this.executeJob({
        jobId,
        targets: estimate.targets,
        concurrency,
        approvedProvider: approved.provider,
        approvedModelId: approved.modelId,
        approvedVoiceId: approved.voiceId,
        approvedSpeed: approved.speed,
        approvedStyle: approved.style,
        signal: controller.signal,
      }).finally(() => {
        this.activeControllers.delete(jobId);
      });
    }

    return this.getJob(jobId)!;
  }

  private async executeJob(params: {
    jobId: string;
    targets: BatchEstimateResult['targets'];
    concurrency: number;
    approvedProvider: TtsProviderId;
    approvedModelId: string;
    approvedVoiceId: string;
    approvedSpeed: number;
    approvedStyle: string;
    signal: AbortSignal;
    initialCompleted?: number;
    initialSucceeded?: number;
    isResume?: boolean;
  }): Promise<void> {
    let cursor = 0;
    let completed = params.initialCompleted ?? 0;
    let succeeded = params.initialSucceeded ?? 0;
    let failed = 0;
    let consecutiveTransientFailures = 0;
    let pausedByProviderError = false;
    let pauseReason = '';
    const errors: BatchJobErrorItem[] = [];
    const isTestEnv = Boolean(process.env.VITEST);
    const maxTransientRetries = 2;
    const pacingMs = params.approvedProvider === 'edge' && !isTestEnv ? 600 : 0;

    const persistProgress = (status?: AudioBatchJobStatus['status']) => {
      this.db
        .prepare(
          `UPDATE audio_batch_jobs
           SET status = COALESCE(?, status),
               completed_items = ?,
               succeeded_items = ?,
               failed_items = ?,
               pause_reason = ?,
               errors_json = ?,
               updated_at = ?
           WHERE job_id = ?`
        )
        .run(
          status ?? null,
          completed,
          succeeded,
          failed,
          pauseReason,
          JSON.stringify(errors.slice(0, 100)),
          new Date().toISOString(),
          params.jobId
        );
    };

    const worker = async () => {
      while (!params.signal.aborted && !pausedByProviderError) {
        const idx = cursor++;
        if (idx >= params.targets.length) break;
        const target = params.targets[idx];

        let itemOk = false;
        let lastErr = '';
        let fatalErr = false;

        try {
          const adminItem = this.audioCacheService.getAdminAudioItem(
            target.entityType,
            target.entityId,
            target.slotKey
          );
          if (adminItem?.audioMode === 'RECORDED' || adminItem?.sourceType === 'uploaded') {
            continue;
          }
          const transcript = (adminItem?.transcript || adminItem?.defaultTranscript || '').trim();
          if (!transcript) {
            throw new Error('Nội dung giới thiệu trống.');
          }

          for (let attempt = 0; attempt <= maxTransientRetries; attempt++) {
            if (params.signal.aborted || pausedByProviderError) break;
            try {
              // Strict NO-SILENT-FALLBACK: only use the exact approved provider/model/voice!
              await this.audioCacheService.generateAdminAudio({
                entityType: target.entityType,
                entityId: target.entityId,
                slotKey: target.slotKey,
                transcript,
                preferredProvider: params.approvedProvider,
                modelId: params.approvedModelId,
                voiceId: params.approvedVoiceId,
                speed: params.approvedSpeed,
                style: params.approvedStyle,
                allowFallback: false,
                bypassPermissionCooldown: Boolean(params.isResume && idx === 0 && attempt === 0),
                signal: params.signal,
              });
              itemOk = true;
              consecutiveTransientFailures = 0;
              break;
            } catch (err) {
              lastErr = (err as Error)?.message || 'Lỗi tạo audio từ provider đã duyệt.';
              if (params.signal.aborted) break;
              if (this.isFatalProviderError(err)) {
                fatalErr = true;
                break;
              }
              if (attempt < maxTransientRetries) {
                const backoffMs = isTestEnv ? 25 * (attempt + 1) : 1200 * Math.pow(2, attempt);
                await this.sleepAbortable(backoffMs, params.signal);
              }
            }
          }
        } catch (err) {
          lastErr = (err as Error)?.message || 'Lỗi tạo audio từ provider đã duyệt.';
          fatalErr = this.isFatalProviderError(err);
        }

        if (params.signal.aborted) break;
        completed++;
        if (itemOk) {
          succeeded++;
        } else {
          failed++;
          errors.push({
            entityType: target.entityType,
            entityId: target.entityId,
            label: target.label,
            error: lastErr,
          });
          if (fatalErr) {
            pausedByProviderError = true;
            pauseReason = `Tạm dừng do provider "${params.approvedProvider}" gặp lỗi quyền/cấu hình (${lastErr}). Hệ thống không tự chuyển sang giọng chưa được duyệt — vui lòng kiểm tra cấu hình hoặc duyệt mẫu mới.`;
          } else {
            consecutiveTransientFailures++;
            if (consecutiveTransientFailures >= 2 || params.targets.length <= 2) {
              pausedByProviderError = true;
              pauseReason = `Tạm dừng do provider "${params.approvedProvider}" liên tục gặp lỗi tạm thời sau khi đã retry (${lastErr}). Hệ thống không tự chuyển sang giọng chưa được duyệt — bạn có thể bấm "Tiếp tục Batch" sau ít phút hoặc duyệt mẫu giọng mới.`;
            }
          }
        }
        persistProgress(pausedByProviderError ? 'paused' : undefined);
        if (pacingMs > 0 && !pausedByProviderError && !params.signal.aborted) {
          await this.sleepAbortable(pacingMs, params.signal);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(params.concurrency, params.targets.length) },
      () => worker()
    );
    await Promise.all(workers);

    const finalStatus: AudioBatchJobStatus['status'] = params.signal.aborted
      ? 'cancelled'
      : pausedByProviderError
        ? 'paused'
        : 'completed';
    persistProgress(finalStatus);
  }

  /**
   * Safely resumes a paused/failed batch job using the EXACT original approved voice configuration.
   * Skips already-ready and RECORDED items so zero duplicate audios are generated.
   */
  public resumeJob(jobId: string, options?: { companyId?: string; limit?: number }): AudioBatchJobStatus {
    const existing = this.getJob(jobId);
    if (!existing) {
      const err = new Error('Không tìm thấy tiến trình batch.') as Error & { statusCode?: number };
      err.statusCode = 404;
      throw err;
    }
    if (existing.status !== 'paused' && existing.status !== 'failed') {
      const err = new Error(
        `Chỉ có thể tiếp tục tiến trình đang tạm dừng hoặc lỗi (trạng thái hiện tại: ${existing.status}).`
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    if (this.activeControllers.size > 0) {
      const err = new Error(
        'Đang có một tiến trình tạo audio hàng loạt khác chạy nền.'
      ) as Error & { statusCode?: number };
      err.statusCode = 409;
      throw err;
    }

    const approvedRow = this.db
      .prepare(`SELECT * FROM audio_voice_approvals WHERE approval_id = ? AND status = 'approved'`)
      .get(existing.approvalId) as Record<string, unknown> | undefined;
    if (!approvedRow) {
      const err = new Error(
        'VOICE_APPROVAL_REQUIRED: Mẫu giọng của tiến trình này không còn ở trạng thái đã duyệt. Vui lòng tạo mẫu nghe thử mới và duyệt lại.'
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }

    const approvedProvider = String(approvedRow.provider) as TtsProviderId;
    const approvedModelId = String(approvedRow.model_id || '');
    const approvedVoiceId = String(approvedRow.voice_id || '');
    const approvedSpeed = Number(approvedRow.speed ?? 1.0);
    const approvedStyle = String(approvedRow.style || '');

    const estimate = this.estimateBatch({
      entityType: 'all',
      companyId: options?.companyId,
      includeNeedsUpdate: true,
      limit: options?.limit,
      providerOverride: approvedProvider,
      modelId: approvedModelId,
      voiceId: approvedVoiceId,
      speed: approvedSpeed,
      style: approvedStyle,
    });

    const cfg = this.audioCacheService.ttsService.getConfigSnapshot();
    const concurrency =
      approvedProvider === 'edge' && !cfg.azureSpeechKey ? 1 : existing.concurrency;
    const nowIso = new Date().toISOString();

    if (estimate.totalTargets === 0) {
      this.db
        .prepare(
          `UPDATE audio_batch_jobs SET status = 'completed', pause_reason = '', updated_at = ? WHERE job_id = ?`
        )
        .run(nowIso, jobId);
      return this.getJob(jobId)!;
    }

    this.db
      .prepare(
        `UPDATE audio_batch_jobs
         SET status = 'running', total_items = ?, concurrency = ?, pause_reason = '', updated_at = ?
         WHERE job_id = ?`
      )
      .run(existing.succeededItems + estimate.totalTargets, concurrency, nowIso, jobId);

    const controller = new AbortController();
    this.activeControllers.set(jobId, controller);

    void this.executeJob({
      jobId,
      targets: estimate.targets,
      concurrency,
      approvedProvider,
      approvedModelId,
      approvedVoiceId,
      approvedSpeed,
      approvedStyle,
      signal: controller.signal,
      initialCompleted: existing.succeededItems,
      initialSucceeded: existing.succeededItems,
      isResume: true,
    }).finally(() => {
      this.activeControllers.delete(jobId);
    });

    return this.getJob(jobId)!;
  }

  public cancelJob(jobId: string): AudioBatchJobStatus | null {
    const existing = this.getJob(jobId);
    if (!existing) return null;
    const controller = this.activeControllers.get(jobId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(jobId);
    }
    if (existing.status === 'running' || existing.status === 'queued' || existing.status === 'paused') {
      this.db
        .prepare(`UPDATE audio_batch_jobs SET status = 'cancelled', updated_at = ? WHERE job_id = ?`)
        .run(new Date().toISOString(), jobId);
    }
    return this.getJob(jobId);
  }

  private mapJobRow(row: Record<string, unknown>): AudioBatchJobStatus {
    let errors: BatchJobErrorItem[] = [];
    try {
      const parsed = JSON.parse(String(row.errors_json || '[]'));
      if (Array.isArray(parsed)) errors = parsed as BatchJobErrorItem[];
    } catch {
      errors = [];
    }
    return {
      jobId: String(row.job_id),
      status: String(row.status) as AudioBatchJobStatus['status'],
      totalItems: Number(row.total_items || 0),
      completedItems: Number(row.completed_items || 0),
      succeededItems: Number(row.succeeded_items || 0),
      failedItems: Number(row.failed_items || 0),
      skippedItems: Number(row.skipped_items || 0),
      concurrency: Number(row.concurrency || 2),
      providerOverride: String(row.provider_override || ''),
      voiceId: String(row.voice_id || ''),
      approvalId: String(row.approval_id || ''),
      pauseReason: String(row.pause_reason || ''),
      createdBy: String(row.created_by || 'admin'),
      errors,
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  }

  public getJob(jobId: string): AudioBatchJobStatus | null {
    const row = this.db
      .prepare('SELECT * FROM audio_batch_jobs WHERE job_id = ?')
      .get(jobId) as Record<string, unknown> | undefined;
    return row ? this.mapJobRow(row) : null;
  }

  public listJobs(limit = 20): AudioBatchJobStatus[] {
    const rows = this.db
      .prepare('SELECT * FROM audio_batch_jobs ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.min(50, limit))) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapJobRow(r));
  }
}
