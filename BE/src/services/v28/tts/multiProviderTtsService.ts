import crypto from 'node:crypto';
import { resolveHybridTtsConfig, type HybridTtsRuntimeConfig } from './ttsConfig.js';
import {
  redactTtsSecrets,
  resolveVoiceIdForProvider,
  TtsProviderError,
  type TtsProviderAdapter,
  type TtsProviderHealthState,
  type TtsProviderId,
  type TtsProviderStatus,
  type TtsSynthesisRequest,
  type TtsSynthesisResult,
  type TtsVoiceOption,
} from './ttsTypes.js';
import { GeminiTtsProvider } from './providers/geminiTtsProvider.js';
import { VbeeTtsProvider } from './providers/vbeeTtsProvider.js';
import { EdgeNeuralTtsProvider } from './providers/edgeNeuralTtsProvider.js';
import { FptTtsProvider } from './providers/fptTtsProvider.js';

export interface ProviderAttemptLog {
  provider: TtsProviderId;
  ok: boolean;
  errorKind?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface MultiProviderSynthesisOutcome {
  result: TtsSynthesisResult;
  attempts: ProviderAttemptLog[];
  fallbackUsed: boolean;
}

export interface TtsUsageMetrics {
  dayKey: string;
  totalRequests: number;
  totalChars: number;
  providerCalls: Record<string, number>;
  providerSuccesses: Record<string, number>;
  providerFailures: Record<string, number>;
  fallbackCount: number;
}

/**
 * Orchestrates sequential Multi-Provider TTS synthesis:
 *   Gemini Audio TTS -> Vbee TTS -> Microsoft Edge Neural TTS
 *   (FPT.AI is registered in adapter map but strictly disabled by default).
 *
 * Guarantees:
 * - Never calls all providers simultaneously for a single request.
 * - Immediately stops on `input_error` (400) without falling back.
 * - Bounded retries (never infinite).
 * - Enforces daily request & character budget caps.
 */
export class MultiProviderTtsService {
  private readonly adapters = new Map<TtsProviderId, TtsProviderAdapter>();
  private readonly getConfig: () => HybridTtsRuntimeConfig;
  private readonly permissionCooldownUntil = new Map<TtsProviderId, { untilMs: number; reason: string }>();
  private readonly providerHealth = new Map<
    TtsProviderId,
    {
      state: TtsProviderHealthState;
      lastError?: string;
      lastCheckedAt: string;
    }
  >();
  private usage: TtsUsageMetrics;
  private lastProviderKeyFingerprints = new Map<TtsProviderId, string>();

  /**
   * Detects when Admin rotates an API key (e.g. replaces GEMINI_API_KEY in BE/.env)
   * and safely clears ONLY the stale cooldown/health state from the OLD key —
   * never logging raw keys and never disabling circuit breaker for the new key.
   */
  private syncKeyRotationRecovery(): void {
    const cfg = this.getConfig();
    const pairs: Array<[TtsProviderId, string]> = [
      ['gemini', `${cfg.geminiApiKey}|${cfg.geminiModel}`],
      ['vbee', `${cfg.vbeeApiToken}|${cfg.vbeeAppId}`],
      ['edge', `${cfg.azureSpeechKey}|${cfg.azureSpeechRegion}|${cfg.edgeUnofficialEnabled}`],
    ];
    for (const [id, material] of pairs) {
      const fp = crypto.createHash('sha256').update(material).digest('hex').slice(0, 12);
      const prev = this.lastProviderKeyFingerprints.get(id);
      if (prev && prev !== fp) {
        this.permissionCooldownUntil.delete(id);
        this.providerHealth.delete(id);
      }
      this.lastProviderKeyFingerprints.set(id, fp);
    }
  }

  constructor(options?: {
    adapters?: Partial<Record<TtsProviderId, TtsProviderAdapter>>;
    getConfig?: () => HybridTtsRuntimeConfig;
  }) {
    this.getConfig = options?.getConfig ?? (() => resolveHybridTtsConfig());
    const defaults: TtsProviderAdapter[] = [
      options?.adapters?.gemini ?? new GeminiTtsProvider({ getConfig: this.getConfig }),
      options?.adapters?.vbee ?? new VbeeTtsProvider({ getConfig: this.getConfig }),
      options?.adapters?.edge ?? new EdgeNeuralTtsProvider({ getConfig: this.getConfig }),
      options?.adapters?.fpt ?? new FptTtsProvider({ getConfig: this.getConfig }),
    ];
    for (const adapter of defaults) {
      this.adapters.set(adapter.id, adapter);
    }
    this.usage = this.createFreshUsage();
  }

  private createFreshUsage(): TtsUsageMetrics {
    const dayKey = new Date().toISOString().slice(0, 10);
    return {
      dayKey,
      totalRequests: 0,
      totalChars: 0,
      providerCalls: {},
      providerSuccesses: {},
      providerFailures: {},
      fallbackCount: 0,
    };
  }

  private ensureCurrentDayUsage(): TtsUsageMetrics {
    const today = new Date().toISOString().slice(0, 10);
    if (this.usage.dayKey !== today) {
      this.usage = this.createFreshUsage();
    }
    return this.usage;
  }

  public getUsageMetrics(): TtsUsageMetrics {
    const u = this.ensureCurrentDayUsage();
    return {
      ...u,
      providerCalls: { ...u.providerCalls },
      providerSuccesses: { ...u.providerSuccesses },
      providerFailures: { ...u.providerFailures },
    };
  }

  public getConfigSnapshot(): HybridTtsRuntimeConfig {
    return this.getConfig();
  }

  public getProviderOrder(preferredProvider?: TtsProviderId): TtsProviderId[] {
    const cfg = this.getConfig();
    const base = [...cfg.providerPriority].filter((id) => id !== 'fpt' || (cfg.fptEnabled && cfg.fptAllowPaid));
    if (preferredProvider && this.adapters.has(preferredProvider)) {
      if (preferredProvider === 'fpt' && !(cfg.fptEnabled && cfg.fptAllowPaid)) {
        return base;
      }
      return [preferredProvider, ...base.filter((id) => id !== preferredProvider)];
    }
    return base;
  }

  private decorateProviderStatus(base: TtsProviderStatus): TtsProviderStatus {
    const cooldown = this.permissionCooldownUntil.get(base.id);
    const now = Date.now();
    const cooldownRemainingSec =
      cooldown && cooldown.untilMs > now ? Math.ceil((cooldown.untilMs - now) / 1000) : 0;
    const tracked = this.providerHealth.get(base.id);

    let healthState: TtsProviderHealthState;
    let healthLabel: string;
    let reason = base.reason;

    if (!base.enabled) {
      healthState = 'disabled';
      healthLabel = 'Đã tắt';
    } else if (!base.configured) {
      healthState = 'unconfigured';
      healthLabel = 'Chưa cấu hình';
    } else if (cooldownRemainingSec > 0) {
      healthState = tracked?.state === 'permission_denied' ? 'permission_denied' : 'cooldown_locked';
      healthLabel =
        healthState === 'permission_denied'
          ? 'Không có quyền truy cập API'
          : 'Đang tạm khóa do lỗi';
      reason = cooldown?.reason || tracked?.lastError || reason;
    } else if (tracked?.state === 'ready_verified') {
      healthState = 'ready_verified';
      healthLabel = 'Sẵn sàng (đã xác minh)';
    } else if (tracked?.state === 'permission_denied') {
      healthState = 'permission_denied';
      healthLabel = 'Không có quyền truy cập API';
      reason = tracked.lastError || reason;
    } else if (tracked?.state === 'quota_exhausted') {
      healthState = 'quota_exhausted';
      healthLabel = 'Hết quota';
      reason = tracked.lastError || reason;
    } else if (tracked?.state === 'unavailable') {
      healthState = 'unavailable';
      healthLabel = 'Không khả dụng';
      reason = tracked.lastError || reason;
    } else {
      // NEVER claim green "Sẵn sàng" merely because an API key is present!
      healthState = 'configured_unverified';
      healthLabel = 'Đã cấu hình, chưa kiểm chứng';
      reason = 'Đã có cấu hình API key nhưng chưa kiểm chứng tạo audio thành công.';
    }

    return {
      ...base,
      available:
        base.available &&
        healthState !== 'permission_denied' &&
        healthState !== 'quota_exhausted' &&
        healthState !== 'cooldown_locked' &&
        healthState !== 'disabled' &&
        healthState !== 'unconfigured',
      healthState,
      healthLabel,
      cooldownRemainingSec,
      lastError: tracked?.lastError,
      lastCheckedAt: tracked?.lastCheckedAt,
      reason,
    };
  }

  public listProviderStatuses(): TtsProviderStatus[] {
    this.syncKeyRotationRecovery();
    const order = this.getProviderOrder();
    const seen = new Set<TtsProviderId>();
    const statuses: TtsProviderStatus[] = [];

    order.forEach((id, idx) => {
      const adapter = this.adapters.get(id);
      if (adapter) {
        statuses.push(this.decorateProviderStatus(adapter.getStatus(idx + 1)));
        seen.add(id);
      }
    });

    for (const [id, adapter] of this.adapters.entries()) {
      if (!seen.has(id)) {
        statuses.push(this.decorateProviderStatus(adapter.getStatus(99)));
      }
    }
    return statuses;
  }

  /**
   * Non-billing configuration & reachability check for a provider (Phase 1.2.1).
   * Only performs a real synthesis test when `runLiveSynthesis === true` (explicit Admin confirmation).
   */
  public async checkProviderConnection(params: {
    provider: TtsProviderId;
    runLiveSynthesis?: boolean;
  }): Promise<{
    provider: TtsProviderId;
    ok: boolean;
    mode: 'config_only' | 'live_synthesis';
    status: TtsProviderStatus;
    message: string;
  }> {
    const adapter = this.adapters.get(params.provider);
    if (!adapter) {
      throw new TtsProviderError({
        provider: params.provider,
        kind: 'input_error',
        statusCode: 400,
        message: 'Provider không tồn tại.',
        retryable: false,
      });
    }

    const baseStatus = this.decorateProviderStatus(adapter.getStatus(1));
    if (!baseStatus.enabled || !baseStatus.configured) {
      return {
        provider: params.provider,
        ok: false,
        mode: 'config_only',
        status: baseStatus,
        message: baseStatus.reason || 'Provider chưa được cấu hình hoặc đang tắt.',
      };
    }

    if (!params.runLiveSynthesis) {
      // Zero-cost config/metadata check
      if (params.provider === 'gemini') {
        const cfg = this.getConfig();
        try {
          const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=50', {
            headers: { 'x-goog-api-key': cfg.geminiApiKey },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) {
            const msg = `Google API trả HTTP ${res.status} khi kiểm tra danh sách model.`;
            this.providerHealth.set('gemini', {
              state: res.status === 401 || res.status === 403 ? 'permission_denied' : 'unavailable',
              lastError: msg,
              lastCheckedAt: new Date().toISOString(),
            });
            return {
              provider: 'gemini',
              ok: false,
              mode: 'config_only',
              status: this.decorateProviderStatus(adapter.getStatus(1)),
              message: msg,
            };
          }
          return {
            provider: 'gemini',
            ok: true,
            mode: 'config_only',
            status: this.decorateProviderStatus(adapter.getStatus(1)),
            message:
              'Kết nối danh sách model thành công (không phát sinh chi phí). Lưu ý: cần kiểm tra tạo audio thực tế để xác minh quyền TTS/Billing.',
          };
        } catch (err) {
          const msg = redactTtsSecrets(`Không thể kết nối Google API: ${(err as Error).message}`);
          this.providerHealth.set('gemini', {
            state: 'unavailable',
            lastError: msg,
            lastCheckedAt: new Date().toISOString(),
          });
          return {
            provider: 'gemini',
            ok: false,
            mode: 'config_only',
            status: this.decorateProviderStatus(adapter.getStatus(1)),
            message: msg,
          };
        }
      }
      return {
        provider: params.provider,
        ok: true,
        mode: 'config_only',
        status: baseStatus,
        message: 'Đã có cấu hình khóa API (chưa gọi tạo audio thực tế).',
      };
    }

    // Explicit Admin-confirmed live synthesis verification (1 short test sentence, no fallback)
    try {
      await this.synthesizeWithFallback({
        text: 'Xin chào quý khách.',
        preferredProvider: params.provider,
        allowFallback: false,
        bypassPermissionCooldown: true,
      });
      return {
        provider: params.provider,
        ok: true,
        mode: 'live_synthesis',
        status: this.decorateProviderStatus(adapter.getStatus(1)),
        message: 'Đã xác minh tạo audio thực tế thành công!',
      };
    } catch (err) {
      const msg = redactTtsSecrets((err as Error).message);
      return {
        provider: params.provider,
        ok: false,
        mode: 'live_synthesis',
        status: this.decorateProviderStatus(adapter.getStatus(1)),
        message: msg,
      };
    }
  }

  public listAllVoices(): TtsVoiceOption[] {
    const out: TtsVoiceOption[] = [];
    for (const status of this.listProviderStatuses()) {
      const adapter = this.adapters.get(status.id);
      if (adapter) {
        out.push(...adapter.listVoices());
      }
    }
    return out;
  }

  public hasAnyAvailableProvider(): boolean {
    for (const id of this.getProviderOrder()) {
      const adapter = this.adapters.get(id);
      if (adapter?.isEnabled()) return true;
    }
    return false;
  }

  public async synthesizeWithFallback(
    req: TtsSynthesisRequest & {
      preferredProvider?: TtsProviderId;
      enforceBudget?: boolean;
      allowFallback?: boolean;
      bypassPermissionCooldown?: boolean;
    }
  ): Promise<MultiProviderSynthesisOutcome> {
    this.syncKeyRotationRecovery();
    const cfg = this.getConfig();
    const text = String(req.text || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      throw new TtsProviderError({
        provider: 'gemini',
        kind: 'input_error',
        statusCode: 400,
        message: 'Nội dung văn bản không được để trống.',
        retryable: false,
      });
    }
    if (text.length > cfg.maxTextLength) {
      throw new TtsProviderError({
        provider: 'gemini',
        kind: 'input_error',
        statusCode: 400,
        message: `Nội dung vượt quá giới hạn tối đa ${cfg.maxTextLength} ký tự.`,
        retryable: false,
      });
    }

    const usage = this.ensureCurrentDayUsage();
    if (req.enforceBudget !== false) {
      if (
        usage.totalRequests >= cfg.dailyRequestBudget ||
        usage.totalChars + text.length > cfg.dailyCharBudget
      ) {
        throw new TtsProviderError({
          provider: 'gemini',
          kind: 'budget_exceeded',
          statusCode: 429,
          message: 'Đã đạt giới hạn chi phí/hạn mức TTS cấu hình trong ngày. Vui lòng dùng audio có sẵn hoặc tăng hạn mức.',
          retryable: false,
        });
      }
    }

    const fullOrder = this.getProviderOrder(req.preferredProvider);
    // Strict approved-voice mode (e.g. batch generation): NEVER silently switch to another unapproved provider!
    const order = req.allowFallback === false ? fullOrder.slice(0, 1) : fullOrder;
    const attempts: ProviderAttemptLog[] = [];

    for (let idx = 0; idx < order.length; idx++) {
      const providerId = order[idx];
      const adapter = this.adapters.get(providerId);
      if (!adapter) continue;

      if (!adapter.isEnabled()) {
        const status = adapter.getStatus(idx + 1);
        attempts.push({
          provider: providerId,
          ok: false,
          errorKind: status.configured ? 'disabled' : 'config_missing',
          errorMessage: status.reason || 'Provider chưa sẵn sàng.',
          durationMs: 0,
        });
        continue;
      }

      // Permission-denied circuit breaker: avoid spamming a 401/403 provider repeatedly
      const cooldown = this.permissionCooldownUntil.get(providerId);
      if (cooldown && Date.now() < cooldown.untilMs && !req.bypassPermissionCooldown) {
        attempts.push({
          provider: providerId,
          ok: false,
          errorKind: 'permission_denied',
          errorMessage: cooldown.reason,
          durationMs: 0,
        });
        continue;
      }

      // Map neutral voiceProfile (or cross-provider voiceId) to a verified voice ID for this provider
      const providerVoices = adapter.listVoices();
      const voiceMatchesProvider =
        !req.voiceProfile && req.voiceId && providerVoices.some((v) => v.id === req.voiceId);
      const effectiveVoiceId = voiceMatchesProvider
        ? req.voiceId
        : req.voiceProfile || req.voiceId
          ? resolveVoiceIdForProvider(req.voiceProfile || req.voiceId, providerId)
          : undefined;

      const maxAttemptsForProvider = 1 + Math.min(1, cfg.maxRetries);
      for (let attemptNum = 0; attemptNum < maxAttemptsForProvider; attemptNum++) {
        const t0 = Date.now();
        usage.providerCalls[providerId] = (usage.providerCalls[providerId] || 0) + 1;
        try {
          const result = await adapter.synthesize({
            ...req,
            text,
            voiceId: effectiveVoiceId,
            modelId: idx === 0 ? req.modelId : undefined,
            timeoutMs: req.timeoutMs ?? cfg.timeoutMs,
          });
          this.permissionCooldownUntil.delete(providerId);
          this.providerHealth.set(providerId, {
            state: 'ready_verified',
            lastCheckedAt: new Date().toISOString(),
          });
          usage.totalRequests += 1;
          usage.totalChars += text.length;
          usage.providerSuccesses[providerId] = (usage.providerSuccesses[providerId] || 0) + 1;
          const fallbackUsed = idx > 0;
          if (fallbackUsed) {
            usage.fallbackCount += 1;
          }
          attempts.push({
            provider: providerId,
            ok: true,
            durationMs: Date.now() - t0,
          });
          return { result, attempts, fallbackUsed };
        } catch (err) {
          const ttsErr =
            err instanceof TtsProviderError
              ? err
              : new TtsProviderError({
                  provider: providerId,
                  kind: 'unavailable',
                  message: redactTtsSecrets((err as Error)?.message || 'Provider error'),
                });
          usage.providerFailures[providerId] = (usage.providerFailures[providerId] || 0) + 1;
          const safeMsg = redactTtsSecrets(ttsErr.message);
          if (ttsErr.kind === 'permission_denied') {
            this.permissionCooldownUntil.set(providerId, {
              untilMs: Date.now() + 5 * 60_000,
              reason: safeMsg,
            });
            this.providerHealth.set(providerId, {
              state: 'permission_denied',
              lastError: safeMsg,
              lastCheckedAt: new Date().toISOString(),
            });
          } else if (ttsErr.kind === 'quota_exhausted' || ttsErr.kind === 'rate_limit') {
            this.permissionCooldownUntil.set(providerId, {
              untilMs: Date.now() + 60_000,
              reason: safeMsg,
            });
            this.providerHealth.set(providerId, {
              state: 'quota_exhausted',
              lastError: safeMsg,
              lastCheckedAt: new Date().toISOString(),
            });
          } else if (ttsErr.kind !== 'input_error') {
            this.providerHealth.set(providerId, {
              state: 'unavailable',
              lastError: safeMsg,
              lastCheckedAt: new Date().toISOString(),
            });
          }
          attempts.push({
            provider: providerId,
            ok: false,
            errorKind: ttsErr.kind,
            errorMessage: redactTtsSecrets(ttsErr.message),
            durationMs: Date.now() - t0,
          });

          // Distinguish input error from provider error: NEVER fall back on invalid input!
          if (ttsErr.kind === 'input_error') {
            throw ttsErr;
          }
          // Stop retrying this provider if error is non-retryable (e.g. permission_denied, quota_exhausted, config_missing, disabled)
          if (!ttsErr.retryable || attemptNum + 1 >= maxAttemptsForProvider) {
            break;
          }
        }
      }
    }

    const summary = attempts
      .map((a) => `${a.provider}:${a.errorKind || 'failed'}`)
      .join(', ');
    throw new TtsProviderError({
      provider: 'gemini',
      kind: 'unavailable',
      statusCode: 503,
      message: `Tất cả TTS provider đều không khả dụng (${summary || 'chưa cấu hình provider nào'}).`,
      retryable: false,
    });
  }
}
