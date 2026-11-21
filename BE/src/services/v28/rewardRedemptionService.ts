import crypto from 'node:crypto';
import type { V28CatalogDatabase } from '../../database/v28Database.js';
import type { V28ExhibitionService } from './exhibitionService.js';
import { V28VisitorJourneyService, VisitorJourneyError } from './visitorJourneyService.js';

export const DEFAULT_REQUIRED_UNIQUE_BOOTHS = 30;
export const REDEMPTION_SUBMIT_WINDOW_MS = 10 * 60 * 1000;
export const REDEMPTION_SUBMIT_MAX_ATTEMPTS = 5;

export type RewardRedemptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULFILLED';
export type RewardRiskLevel = 'low' | 'medium' | 'high';

export interface RewardPolicyView {
  versionId: string;
  requiredUniqueBooths: number;
  rewardTitle: string;
  rewardDescription: string;
  enabled: boolean;
}

export interface VisitorRedemptionSummary {
  id: string;
  redemptionCode: string;
  status: RewardRedemptionStatus;
  recipientName: string;
  maskedContact: string;
  recordedUniqueBooths: number;
  requiredUniqueBooths: number;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  fulfilledAt: string | null;
}

export interface VisitorRewardStatusResponse {
  exhibitionId: string;
  versionId: string;
  totalBooths: number;
  recordedUniqueBooths: number;
  requiredUniqueBooths: number;
  rewardTitle: string;
  rewardDescription: string;
  policyEnabled: boolean;
  /** True ONLY when DB unique visits >= threshold AND visitor has not yet submitted a request. */
  eligibleToSubmit: boolean;
  redemption: VisitorRedemptionSummary | null;
}

export interface SubmitRedemptionInput {
  visitorToken: string;
  versionId?: string;
  recipientName: string;
  contactPhone?: string;
  contactEmail?: string;
  consentAccepted: boolean;
}

export interface AdminRedemptionListItem {
  id: string;
  redemptionCode: string;
  exhibitionId: string;
  versionId: string;
  recipientName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  recordedUniqueBooths: number;
  requiredUniqueBooths: number;
  status: RewardRedemptionStatus;
  riskLevel: RewardRiskLevel;
  riskFlags: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  fulfilledBy: string | null;
  fulfilledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRedemptionDetail extends AdminRedemptionListItem {
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

export class RewardRedemptionError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'RewardRedemptionError';
    this.statusCode = statusCode;
  }
}

function sanitizeStrictText(raw: string, maxLen: number): string {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function maskContact(phone: string | null, email: string | null): string {
  if (phone && phone.length >= 4) {
    return `${'*'.repeat(Math.max(2, phone.length - 4))}${phone.slice(-4)}`;
  }
  if (email && email.includes('@')) {
    const [local, domain] = email.split('@');
    const prefix = local.slice(0, Math.min(2, local.length));
    return `${prefix}***@${domain}`;
  }
  return '***';
}

function parseSqlTimestampMs(ts: string): number {
  const iso = ts.includes('T') ? ts : `${ts.replace(' ', 'T')}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Evaluate non-blocking fraud/anomaly risk flags from DB visit timestamps.
 * Never auto-rejects legitimate visitors; surfaces transparent evidence for Admin verification.
 */
export function evaluateVisitRiskFlags(
  visits: ReadonlyArray<{ interactionType: string; firstVisitedAt: string }>
): { riskFlags: string[]; riskLevel: RewardRiskLevel; durationSec: number } {
  const flags: string[] = ['SINGLE_SESSION_GUEST'];
  if (visits.length === 0) {
    return { riskFlags: flags, riskLevel: 'low', durationSec: 0 };
  }

  const timestamps = visits
    .map((v) => parseSqlTimestampMs(v.firstVisitedAt))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const durationSec =
    timestamps.length >= 2 ? Math.max(0, Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 1000)) : 0;

  // Flag 1: Completing >= 30 booths in under 180 seconds (< 6s/booth average)
  if (visits.length >= 30 && durationSec < 180) {
    flags.push('RAPID_COMPLETION');
  }

  // Flag 2: Burst velocity (>= 10 booths recorded within any rolling 60-second window)
  let maxIn60s = 0;
  let left = 0;
  for (let right = 0; right < timestamps.length; right++) {
    while (timestamps[right] - timestamps[left] > 60_000) {
      left++;
    }
    const windowCount = right - left + 1;
    if (windowCount > maxIn60s) maxIn60s = windowCount;
  }
  if (maxIn60s >= 10) {
    flags.push('BURST_VISIT_VELOCITY');
  }

  // Flag 3: Zero product/NPC interaction across 30+ visits within 5 minutes
  const hasRichInteraction = visits.some(
    (v) => v.interactionType === 'product_inspect' || v.interactionType === 'npc_consult'
  );
  if (visits.length >= 30 && !hasRichInteraction && durationSec < 300) {
    flags.push('IDENTICAL_INTERACTION_ONLY');
  }

  const riskLevel: RewardRiskLevel =
    flags.includes('RAPID_COMPLETION') || flags.includes('BURST_VISIT_VELOCITY')
      ? 'high'
      : flags.includes('IDENTICAL_INTERACTION_ONLY')
        ? 'medium'
        : 'low';

  return { riskFlags: flags, riskLevel, durationSec };
}

export class V28RewardRedemptionService {
  private readonly submitRateMap = new Map<string, number[]>();

  constructor(
    private readonly v28Db: V28CatalogDatabase,
    private readonly exhibitionService: V28ExhibitionService,
    private readonly visitorJourneyService: V28VisitorJourneyService
  ) {}

  private resolveTargetVersion(requestedVersionId?: string): {
    exhibitionId: string;
    versionId: string;
    totalBooths: number;
  } {
    const db = this.v28Db.getConnection();
    const trimmed = typeof requestedVersionId === 'string' ? requestedVersionId.trim() : '';

    if (trimmed) {
      const vRow = db
        .prepare('SELECT id, exhibition_id FROM exhibition_versions WHERE id = ?')
        .get(trimmed) as { id?: string; exhibition_id?: string } | undefined;
      if (!vRow?.id || !vRow.exhibition_id) {
        throw new RewardRedemptionError('Không tìm thấy phiên bản triển lãm hợp lệ.', 404);
      }
      const cntRow = db
        .prepare(
          `SELECT COUNT(*) as c FROM exhibition_version_booths
           WHERE version_id = ? AND COALESCE(placement_status, 'placed') NOT IN ('hidden', 'removed')`
        )
        .get(vRow.id) as { c?: number } | undefined;
      return {
        exhibitionId: vRow.exhibition_id,
        versionId: vRow.id,
        totalBooths: Number(cntRow?.c || 0),
      };
    }

    const active = this.exhibitionService.getActiveExhibitionWorld();
    return {
      exhibitionId: active.exhibitionId,
      versionId: active.versionId,
      totalBooths: active.booths.length,
    };
  }

  public getPolicy(versionId: string): RewardPolicyView {
    const db = this.v28Db.getConnection();
    const row = db
      .prepare(
        `SELECT version_id, required_unique_booths, reward_title, reward_description, enabled
         FROM reward_policies WHERE version_id = ?`
      )
      .get(versionId) as
      | {
          version_id: string;
          required_unique_booths: number;
          reward_title: string;
          reward_description: string;
          enabled: number;
        }
      | undefined;

    if (row) {
      return {
        versionId: row.version_id,
        requiredUniqueBooths: Math.max(1, Number(row.required_unique_booths || DEFAULT_REQUIRED_UNIQUE_BOOTHS)),
        rewardTitle: row.reward_title,
        rewardDescription: row.reward_description,
        enabled: Number(row.enabled) !== 0,
      };
    }

    return {
      versionId,
      requiredUniqueBooths: DEFAULT_REQUIRED_UNIQUE_BOOTHS,
      rewardTitle: 'Quà tặng tham quan Grand Expo V28',
      rewardDescription:
        'Gửi yêu cầu đăng ký nhận quà khi đạt mốc tham quan quy định. Ban tổ chức sẽ xác minh trước khi trao quà.',
      enabled: true,
    };
  }

  public getAdminPolicy(requestedVersionId?: string): {
    exhibitionId: string;
    versionId: string;
    totalActiveBooths: number;
    policy: RewardPolicyView;
    policyExceedsActiveBooths: boolean;
  } {
    const { exhibitionId, versionId, totalBooths } = this.resolveTargetVersion(requestedVersionId);
    const policy = this.getPolicy(versionId);
    return {
      exhibitionId,
      versionId,
      totalActiveBooths: totalBooths,
      policy,
      policyExceedsActiveBooths: totalBooths > 0 && policy.requiredUniqueBooths > totalBooths,
    };
  }

  public updatePolicy(input: {
    versionId?: string;
    requiredUniqueBooths: unknown;
    enabled?: boolean;
  }): {
    exhibitionId: string;
    versionId: string;
    totalActiveBooths: number;
    policy: RewardPolicyView;
    policyExceedsActiveBooths: boolean;
  } {
    const rawNum = input.requiredUniqueBooths;
    if (
      typeof rawNum !== 'number' ||
      !Number.isFinite(rawNum) ||
      !Number.isInteger(rawNum)
    ) {
      throw new RewardRedemptionError(
        'Số gian hàng yêu cầu phải là một số nguyên hợp lệ.',
        400
      );
    }
    if (rawNum < 1) {
      throw new RewardRedemptionError(
        'Số gian hàng yêu cầu phải tối thiểu là 1.',
        400
      );
    }

    const { exhibitionId, versionId } = this.resolveTargetVersion(input.versionId);
    const db = this.v28Db.getConnection();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const cntRow = db
        .prepare(
          `SELECT COUNT(*) as c FROM exhibition_version_booths
           WHERE version_id = ? AND COALESCE(placement_status, 'placed') NOT IN ('hidden', 'removed')`
        )
        .get(versionId) as { c?: number } | undefined;
      const totalActiveBooths = Number(cntRow?.c || 0);

      if (totalActiveBooths < 1) {
        throw new RewardRedemptionError(
          'Triển lãm hiện không còn gian hàng nào đang hoạt động, không thể cấu hình mốc đăng ký nhận quà.',
          400
        );
      }
      if (rawNum > totalActiveBooths) {
        throw new RewardRedemptionError(
          `Số gian hàng yêu cầu (${rawNum}) không được lớn hơn tổng số gian hiện có thể tham quan (${totalActiveBooths}).`,
          400
        );
      }

      const current = this.getPolicy(versionId);
      const nextEnabled = typeof input.enabled === 'boolean' ? input.enabled : current.enabled;

      db.prepare(
        `INSERT INTO reward_policies (
          version_id, required_unique_booths, reward_title, reward_description, enabled, updated_at
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(version_id) DO UPDATE SET
          required_unique_booths = excluded.required_unique_booths,
          enabled = excluded.enabled,
          updated_at = CURRENT_TIMESTAMP`
      ).run(
        versionId,
        rawNum,
        current.rewardTitle,
        current.rewardDescription,
        nextEnabled ? 1 : 0
      );

      db.exec('COMMIT;');
      const updatedPolicy = this.getPolicy(versionId);
      return {
        exhibitionId,
        versionId,
        totalActiveBooths,
        policy: updatedPolicy,
        policyExceedsActiveBooths: updatedPolicy.requiredUniqueBooths > totalActiveBooths,
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  }

  private getExistingVisitorRedemption(
    visitorId: string,
    versionId: string
  ): VisitorRedemptionSummary | null {
    const db = this.v28Db.getConnection();
    const row = db
      .prepare(
        `SELECT id, redemption_code, status, recipient_name, contact_phone, contact_email,
                recorded_unique_booths, required_unique_booths, rejection_reason,
                created_at, reviewed_at, fulfilled_at
         FROM reward_redemptions
         WHERE visitor_id = ? AND version_id = ?`
      )
      .get(visitorId, versionId) as Record<string, unknown> | undefined;

    if (!row) return null;
    return {
      id: String(row.id),
      redemptionCode: String(row.redemption_code),
      status: String(row.status) as RewardRedemptionStatus,
      recipientName: String(row.recipient_name),
      maskedContact: maskContact(
        row.contact_phone ? String(row.contact_phone) : null,
        row.contact_email ? String(row.contact_email) : null
      ),
      recordedUniqueBooths: Number(row.recorded_unique_booths || 0),
      requiredUniqueBooths: Number(row.required_unique_booths || DEFAULT_REQUIRED_UNIQUE_BOOTHS),
      rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      fulfilledAt: row.fulfilled_at ? String(row.fulfilled_at) : null,
    };
  }

  public getVisitorRewardStatus(
    visitorToken: unknown,
    requestedVersionId?: string
  ): VisitorRewardStatusResponse {
    const visitorId = this.visitorJourneyService.resolveVisitorId(visitorToken);
    const { exhibitionId, versionId, totalBooths } = this.resolveTargetVersion(requestedVersionId);
    const policy = this.getPolicy(versionId);

    const db = this.v28Db.getConnection();
    const countRow = db
      .prepare(
        `SELECT COUNT(DISTINCT booth_id) as c
         FROM visitor_booth_visits
         WHERE visitor_id = ? AND version_id = ?`
      )
      .get(visitorId, versionId) as { c?: number } | undefined;
    const recordedUniqueBooths = Math.min(totalBooths, Number(countRow?.c || 0));
    const existing = this.getExistingVisitorRedemption(visitorId, versionId);

    return {
      exhibitionId,
      versionId,
      totalBooths,
      recordedUniqueBooths,
      requiredUniqueBooths: policy.requiredUniqueBooths,
      rewardTitle: policy.rewardTitle,
      rewardDescription: policy.rewardDescription,
      policyEnabled: policy.enabled,
      eligibleToSubmit:
        policy.enabled && recordedUniqueBooths >= policy.requiredUniqueBooths && existing === null,
      redemption: existing,
    };
  }

  private checkSubmitRateLimit(visitorId: string): void {
    const now = Date.now();
    const recent = (this.submitRateMap.get(visitorId) || []).filter(
      (ts) => now - ts < REDEMPTION_SUBMIT_WINDOW_MS
    );
    if (recent.length >= REDEMPTION_SUBMIT_MAX_ATTEMPTS) {
      this.submitRateMap.set(visitorId, recent);
      throw new RewardRedemptionError(
        'Bạn thao tác gửi yêu cầu quá nhanh. Vui lòng thử lại sau ít phút.',
        429
      );
    }
    recent.push(now);
    this.submitRateMap.set(visitorId, recent);
  }

  public submitRedemption(input: SubmitRedemptionInput): VisitorRewardStatusResponse {
    let visitorId: string;
    try {
      visitorId = this.visitorJourneyService.resolveVisitorId(input.visitorToken);
    } catch (err) {
      if (err instanceof VisitorJourneyError) {
        throw new RewardRedemptionError(err.message, err.statusCode);
      }
      throw err;
    }

    this.checkSubmitRateLimit(visitorId);

    if (input.consentAccepted !== true) {
      throw new RewardRedemptionError(
        'Vui lòng xác nhận đồng ý sử dụng thông tin liên hệ để ban tổ chức xác minh và trao quà.',
        400
      );
    }

    const recipientName = sanitizeStrictText(input.recipientName, 80);
    if (recipientName.length < 2) {
      throw new RewardRedemptionError('Vui lòng nhập tên người nhận hợp lệ (tối thiểu 2 ký tự).', 400);
    }

    const rawPhone = typeof input.contactPhone === 'string' ? input.contactPhone.trim() : '';
    const rawEmail = typeof input.contactEmail === 'string' ? input.contactEmail.trim().toLowerCase() : '';

    let contactPhone: string | null = null;
    let contactEmail: string | null = null;

    if (rawPhone) {
      const cleanedPhone = rawPhone.replace(/[^\d+\-\s()]/g, '').trim();
      const digitsOnly = cleanedPhone.replace(/\D/g, '');
      if (digitsOnly.length < 8 || digitsOnly.length > 15 || cleanedPhone.length > 24) {
        throw new RewardRedemptionError('Số điện thoại liên hệ không hợp lệ (8–15 chữ số).', 400);
      }
      contactPhone = cleanedPhone;
    }

    if (rawEmail) {
      if (rawEmail.length > 120 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(rawEmail)) {
        throw new RewardRedemptionError('Địa chỉ email liên hệ không hợp lệ.', 400);
      }
      contactEmail = rawEmail;
    }

    if (!contactPhone && !contactEmail) {
      throw new RewardRedemptionError('Vui lòng cung cấp ít nhất số điện thoại hoặc email liên hệ.', 400);
    }

    const { exhibitionId, versionId } = this.resolveTargetVersion(input.versionId);

    const db = this.v28Db.getConnection();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const cntRow = db
        .prepare(
          `SELECT COUNT(*) as c FROM exhibition_version_booths
           WHERE version_id = ? AND COALESCE(placement_status, 'placed') NOT IN ('hidden', 'removed')`
        )
        .get(versionId) as { c?: number } | undefined;
      const totalBooths = Number(cntRow?.c || 0);
      if (totalBooths < 1) {
        throw new RewardRedemptionError(
          'Triển lãm hiện không còn gian hàng nào đang hoạt động để đăng ký nhận quà.',
          400
        );
      }

      const policy = this.getPolicy(versionId);
      if (!policy.enabled) {
        throw new RewardRedemptionError('Chương trình đăng ký nhận quà hiện đang tạm đóng.', 403);
      }
      const visits = db
        .prepare(
          `SELECT booth_id, interaction_type, first_visited_at
           FROM visitor_booth_visits
           WHERE visitor_id = ? AND version_id = ?
           ORDER BY first_visited_at ASC, id ASC`
        )
        .all(visitorId, versionId) as Array<{
        booth_id: string;
        interaction_type: string;
        first_visited_at: string;
      }>;

      const uniqueBoothIds = new Set(visits.map((v) => String(v.booth_id)));
      const recordedUniqueBooths = Math.min(totalBooths, uniqueBoothIds.size);

      if (recordedUniqueBooths < policy.requiredUniqueBooths) {
        throw new RewardRedemptionError(
          `Bạn mới tham quan ${recordedUniqueBooths}/${policy.requiredUniqueBooths} gian hàng hợp lệ, chưa đủ điều kiện đăng ký nhận quà.`,
          400
        );
      }

      const existing = db
        .prepare('SELECT id FROM reward_redemptions WHERE visitor_id = ? AND version_id = ?')
        .get(visitorId, versionId) as { id?: string } | undefined;

      if (existing?.id) {
        throw new RewardRedemptionError(
          'Bạn đã gửi yêu cầu đăng ký nhận quà cho triển lãm này.',
          409
        );
      }

      const risk = evaluateVisitRiskFlags(
        visits.map((v) => ({
          interactionType: String(v.interaction_type),
          firstVisitedAt: String(v.first_visited_at),
        }))
      );

      const id = `rdm_${crypto.randomBytes(10).toString('hex')}`;
      const redemptionCode = `EXPO-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      db.prepare(
        `INSERT INTO reward_redemptions (
          id, redemption_code, visitor_id, exhibition_id, version_id,
          recipient_name, contact_phone, contact_email, consent_accepted,
          recorded_unique_booths, required_unique_booths,
          status, risk_flags_json, risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'PENDING', ?, ?)`
      ).run(
        id,
        redemptionCode,
        visitorId,
        exhibitionId,
        versionId,
        recipientName,
        contactPhone,
        contactEmail,
        recordedUniqueBooths,
        policy.requiredUniqueBooths,
        JSON.stringify(risk.riskFlags),
        risk.riskLevel
      );

      db.prepare(
        `INSERT INTO reward_redemption_audit_logs (redemption_id, action, from_status, to_status, actor, note)
         VALUES (?, 'SUBMITTED', NULL, 'PENDING', 'visitor', ?)`
      ).run(id, `Recorded ${recordedUniqueBooths}/${policy.requiredUniqueBooths} booths; risk=${risk.riskLevel}`);

      db.exec('COMMIT;');
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      if (err instanceof RewardRedemptionError) throw err;
      const msg = (err as Error)?.message || '';
      if (msg.includes('UNIQUE constraint failed')) {
        throw new RewardRedemptionError(
          'Bạn đã gửi yêu cầu đăng ký nhận quà cho triển lãm này.',
          409
        );
      }
      throw err;
    }

    return this.getVisitorRewardStatus(input.visitorToken, versionId);
  }

  private mapAdminRow(row: Record<string, unknown>): AdminRedemptionListItem {
    let riskFlags: string[] = [];
    try {
      const parsed = JSON.parse(String(row.risk_flags_json || '[]'));
      if (Array.isArray(parsed)) riskFlags = parsed.map(String);
    } catch {
      riskFlags = [];
    }
    return {
      id: String(row.id),
      redemptionCode: String(row.redemption_code),
      exhibitionId: String(row.exhibition_id),
      versionId: String(row.version_id),
      recipientName: String(row.recipient_name),
      contactPhone: row.contact_phone ? String(row.contact_phone) : null,
      contactEmail: row.contact_email ? String(row.contact_email) : null,
      recordedUniqueBooths: Number(row.recorded_unique_booths || 0),
      requiredUniqueBooths: Number(row.required_unique_booths || DEFAULT_REQUIRED_UNIQUE_BOOTHS),
      status: String(row.status) as RewardRedemptionStatus,
      riskLevel: (String(row.risk_level || 'low') as RewardRiskLevel) || 'low',
      riskFlags,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
      fulfilledBy: row.fulfilled_by ? String(row.fulfilled_by) : null,
      fulfilledAt: row.fulfilled_at ? String(row.fulfilled_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  public listRedemptionsForAdmin(params?: {
    versionId?: string;
    status?: string;
  }): AdminRedemptionListItem[] {
    const db = this.v28Db.getConnection();
    const clauses: string[] = [];
    const args: Array<string> = [];

    if (params?.versionId && params.versionId.trim()) {
      clauses.push('version_id = ?');
      args.push(params.versionId.trim());
    }
    if (
      params?.status &&
      ['PENDING', 'APPROVED', 'REJECTED', 'FULFILLED'].includes(params.status.trim().toUpperCase())
    ) {
      clauses.push('status = ?');
      args.push(params.status.trim().toUpperCase());
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT * FROM reward_redemptions ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT 500`
      )
      .all(...args) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapAdminRow(r));
  }

  public getRedemptionDetailForAdmin(redemptionId: string): AdminRedemptionDetail {
    const db = this.v28Db.getConnection();
    const row = db
      .prepare('SELECT * FROM reward_redemptions WHERE id = ?')
      .get(redemptionId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new RewardRedemptionError('Không tìm thấy yêu cầu đăng ký nhận quà.', 404);
    }

    const base = this.mapAdminRow(row);
    const visitorId = String(row.visitor_id);

    const visitRows = db
      .prepare(
        `SELECT vbv.booth_id, vbv.interaction_type, vbv.first_visited_at,
                COALESCE(evb.slot_index, 0) as slot_index,
                COALESCE(z.code, '') as zone_code
         FROM visitor_booth_visits vbv
         LEFT JOIN exhibition_version_booths evb
           ON evb.version_id = vbv.version_id AND evb.booth_id = vbv.booth_id
         LEFT JOIN zones z ON z.id = evb.zone_id
         WHERE vbv.visitor_id = ? AND vbv.version_id = ?
         ORDER BY vbv.first_visited_at ASC, vbv.id ASC`
      )
      .all(visitorId, base.versionId) as Array<Record<string, unknown>>;

    const visits = visitRows.map((v) => ({
      boothId: String(v.booth_id),
      boothNumber: Number(v.slot_index || 0) + 1,
      zoneCode: String(v.zone_code || ''),
      interactionType: String(v.interaction_type || 'booth_focus'),
      firstVisitedAt: String(v.first_visited_at),
    }));

    const riskEval = evaluateVisitRiskFlags(visits);

    const auditRows = db
      .prepare(
        `SELECT id, action, from_status, to_status, actor, note, created_at
         FROM reward_redemption_audit_logs
         WHERE redemption_id = ?
         ORDER BY id ASC`
      )
      .all(redemptionId) as Array<Record<string, unknown>>;

    return {
      ...base,
      visitDurationSec: riskEval.durationSec,
      visits,
      auditLogs: auditRows.map((a) => ({
        id: Number(a.id),
        action: String(a.action),
        fromStatus: a.from_status ? String(a.from_status) : null,
        toStatus: String(a.to_status),
        actor: String(a.actor),
        note: String(a.note || ''),
        createdAt: String(a.created_at),
      })),
    };
  }

  public reviewRedemption(
    redemptionId: string,
    input: {
      decision: 'APPROVED' | 'REJECTED';
      rejectionReason?: string;
      adminUsername: string;
    }
  ): AdminRedemptionDetail {
    const decision = input.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      throw new RewardRedemptionError('Quyết định duyệt không hợp lệ.', 400);
    }

    const reason =
      decision === 'REJECTED' ? sanitizeStrictText(input.rejectionReason || '', 300) : null;
    if (decision === 'REJECTED' && (!reason || reason.length < 3)) {
      throw new RewardRedemptionError('Vui lòng nhập lý do từ chối (tối thiểu 3 ký tự).', 400);
    }

    const actor = sanitizeStrictText(input.adminUsername || 'admin', 60) || 'admin';
    const db = this.v28Db.getConnection();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const existing = db
        .prepare('SELECT id, status FROM reward_redemptions WHERE id = ?')
        .get(redemptionId) as { id?: string; status?: string } | undefined;

      if (!existing?.id) {
        throw new RewardRedemptionError('Không tìm thấy yêu cầu đăng ký nhận quà.', 404);
      }

      // Atomic conditional state transition: ONLY PENDING -> APPROVED / REJECTED
      const res = db
        .prepare(
          `UPDATE reward_redemptions
           SET status = ?,
               reviewed_by = ?,
               reviewed_at = CURRENT_TIMESTAMP,
               rejection_reason = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'PENDING'`
        )
        .run(decision, actor, reason, redemptionId);

      if (Number(res.changes || 0) === 0) {
        throw new RewardRedemptionError(
          `Yêu cầu đã ở trạng thái ${existing.status}, không thể duyệt lại.`,
          409
        );
      }

      db.prepare(
        `INSERT INTO reward_redemption_audit_logs (redemption_id, action, from_status, to_status, actor, note)
         VALUES (?, ?, 'PENDING', ?, ?, ?)`
      ).run(redemptionId, decision, decision, actor, reason || 'Admin approved');

      db.exec('COMMIT;');
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // ignore
      }
      throw err;
    }

    return this.getRedemptionDetailForAdmin(redemptionId);
  }

  public fulfillRedemption(
    redemptionId: string,
    input: { note?: string; adminUsername: string }
  ): AdminRedemptionDetail {
    const actor = sanitizeStrictText(input.adminUsername || 'admin', 60) || 'admin';
    const note = sanitizeStrictText(input.note || 'Đã xác minh người nhận và trao quà.', 300);
    const db = this.v28Db.getConnection();

    db.exec('BEGIN IMMEDIATE;');
    try {
      const existing = db
        .prepare('SELECT id, status FROM reward_redemptions WHERE id = ?')
        .get(redemptionId) as { id?: string; status?: string } | undefined;

      if (!existing?.id) {
        throw new RewardRedemptionError('Không tìm thấy yêu cầu đăng ký nhận quà.', 404);
      }

      // Strict state machine: ONLY APPROVED -> FULFILLED (blocks PENDING -> FULFILLED and double-fulfill!)
      const res = db
        .prepare(
          `UPDATE reward_redemptions
           SET status = 'FULFILLED',
               fulfilled_by = ?,
               fulfilled_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'APPROVED'`
        )
        .run(actor, redemptionId);

      if (Number(res.changes || 0) === 0) {
        throw new RewardRedemptionError(
          existing.status === 'FULFILLED'
            ? 'Yêu cầu này đã được xác nhận trao quà trước đó.'
            : `Chỉ có thể xác nhận trao quà khi yêu cầu đang ở trạng thái APPROVED (hiện tại: ${existing.status}).`,
          409
        );
      }

      db.prepare(
        `INSERT INTO reward_redemption_audit_logs (redemption_id, action, from_status, to_status, actor, note)
         VALUES (?, 'FULFILLED', 'APPROVED', 'FULFILLED', ?, ?)`
      ).run(redemptionId, actor, note);

      db.exec('COMMIT;');
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // ignore
      }
      throw err;
    }

    return this.getRedemptionDetailForAdmin(redemptionId);
  }

  /**
   * Privacy retention helper: redact contact PII on completed/rejected requests older than `retentionDays`.
   */
  public redactOldContactPii(retentionDays = 90): number {
    const days = Math.max(1, Math.floor(retentionDays));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const db = this.v28Db.getConnection();
    const res = db
      .prepare(
        `UPDATE reward_redemptions
         SET contact_phone = NULL, contact_email = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('REJECTED', 'FULFILLED')
           AND updated_at < ?
           AND (contact_phone IS NOT NULL OR contact_email IS NOT NULL)`
      )
      .run(cutoff);
    return Number(res.changes || 0);
  }
}
