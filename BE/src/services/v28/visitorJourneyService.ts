import crypto from 'node:crypto';
import type { V28CatalogDatabase } from '../../database/v28Database.js';
import type { V28ExhibitionService } from './exhibitionService.js';
import { ARCHETYPE_MAP, type V28ArchetypeId } from './layoutGenerator.js';

export type VisitorInteractionType = 'booth_focus' | 'product_inspect' | 'npc_consult';

export const VISITOR_SESSION_TTL_DAYS = 30;
export const VISIT_APPROACH_MAX_DISTANCE_M = 12.0;
export const VISIT_RATE_WINDOW_MS = 60_000;
export const VISIT_RATE_MAX_NEW_PER_WINDOW = 12;
export const VISIT_MIN_COOLDOWN_MS = 2_500;
export const VISIT_ENGAGEMENT_TTL_MS = 120_000;
export const VISIT_MIN_DWELL_MS_FOCUS = 1_400;
export const VISIT_MIN_DWELL_MS_INTERACT = 600;

export interface SpatialPresenceSample {
  socketId: string;
  sessionId: string;
  x: number;
  z: number;
  updatedAt: number;
  lastTeleportTs: number;
}

export interface SpatialPresenceProvider {
  getAuthoritativePositionsForVisitor(
    visitorId: string,
    versionId: string
  ): SpatialPresenceSample[];
}

export interface StartBoothEngagementInput {
  visitorToken: string;
  versionId?: string;
  boothId: string;
}

export interface StartBoothEngagementResult {
  engagementToken: string;
  boothId: string;
  versionId: string;
  expiresAt: string;
  minDwellFocusMs: number;
  minDwellInteractMs: number;
  alreadyVisited: boolean;
}

interface EngagementSessionRecord {
  token: string;
  visitorId: string;
  versionId: string;
  boothId: string;
  startedAt: number;
  expiresAtMs: number;
  used: boolean;
}

export interface VisitorSessionResult {
  visitorToken: string;
  expiresAt: string;
  resumed: boolean;
}

export interface VisitorBoothVisitRecord {
  boothId: string;
  interactionType: VisitorInteractionType;
  firstVisitedAt: string;
}

export interface VisitorJourneySnapshot {
  exhibitionId: string;
  versionId: string;
  totalBooths: number;
  visitedCount: number;
  visitedBoothIds: string[];
  visits: VisitorBoothVisitRecord[];
}

export interface RecordBoothVisitInput {
  visitorToken: string;
  versionId?: string;
  boothId: string;
  interactionType: VisitorInteractionType;
  engagementToken?: string;
  /** Deprecated: ignored by server proximity validation (Phase 4 Security Hardening). */
  avatarX?: number;
  /** Deprecated: ignored by server proximity validation (Phase 4 Security Hardening). */
  avatarZ?: number;
}

export interface RecordBoothVisitResult extends VisitorJourneySnapshot {
  boothId: string;
  recorded: boolean;
  duplicate: boolean;
  firstVisitedAt: string;
}

export class VisitorJourneyError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'VisitorJourneyError';
    this.statusCode = statusCode;
  }
}

function hashVisitorToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function isValidTokenFormat(rawToken: unknown): rawToken is string {
  return typeof rawToken === 'string' && /^v28v_[0-9a-f]{64}$/.test(rawToken);
}

/**
 * Server-Verified Visitor Journey Tracking Service (Grand Expo V28 Phase 4 — Hardened).
 *
 * Security & Integrity Guarantees:
 * - Opaque 256-bit CSPRNG visitor tokens stored only as SHA-256 hashes in SQLite `visitor_sessions`.
 * - Zero PII collected; raw tokens are never logged.
 * - Strictly scoped to `(visitor_id, version_id, booth_id)` with DB-level UNIQUE constraint + atomic `INSERT OR IGNORE`.
 * - NEVER trusts client-supplied `avatarX/avatarZ`, `focusDurationMs`, or `isNearBooth`.
 * - Proximity is validated EXCLUSIVELY against server-tracked `/v28-dynamic` Socket.IO positions bound to `visitorId`.
 * - Requires two-step server-timed engagement proof (`startEngagement` -> `recordVisit`) with single-use token,
 *   server wall-clock minimum dwell time, live proximity re-verification, booth-to-booth cooldown, and sliding-window rate limit.
 * - Fail-closed: rejects visit recording when no authenticated realtime presence exists on the target version.
 */
export class V28VisitorJourneyService {
  private readonly newVisitRateMap = new Map<string, number[]>();
  private readonly lastNewVisitTsMap = new Map<string, number>();
  private readonly engagementSessions = new Map<string, EngagementSessionRecord>();
  private readonly getSpatialPresenceProvider: () => SpatialPresenceProvider | undefined;

  constructor(
    private readonly v28Db: V28CatalogDatabase,
    private readonly exhibitionService: V28ExhibitionService,
    getSpatialPresenceProvider?: () => SpatialPresenceProvider | undefined
  ) {
    this.getSpatialPresenceProvider = getSpatialPresenceProvider || (() => undefined);
  }

  /**
   * Non-throwing helper for Socket.IO `/v28-dynamic` handshake authentication.
   */
  public tryResolveVisitorId(rawToken: unknown): string | null {
    try {
      return this.resolveVisitorId(rawToken);
    } catch {
      return null;
    }
  }

  /**
   * Ensure or resume a server-issued visitor session.
   * Never accepts or trusts client-chosen visitorIds.
   */
  public ensureSession(existingToken?: string): VisitorSessionResult {
    const db = this.v28Db.getConnection();
    const now = Date.now();

    if (isValidTokenFormat(existingToken)) {
      const tokenHash = hashVisitorToken(existingToken);
      const row = db
        .prepare('SELECT visitor_id, expires_at FROM visitor_sessions WHERE token_hash = ?')
        .get(tokenHash) as { visitor_id?: string; expires_at?: string } | undefined;

      if (row?.visitor_id && row.expires_at && Date.parse(row.expires_at) > now) {
        db.prepare('UPDATE visitor_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE visitor_id = ?').run(
          row.visitor_id
        );
        return {
          visitorToken: existingToken,
          expiresAt: row.expires_at,
          resumed: true,
        };
      }
    }

    const visitorId = `vis_${crypto.randomBytes(12).toString('hex')}`;
    const rawToken = `v28v_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = hashVisitorToken(rawToken);
    const expiresAt = new Date(now + VISITOR_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO visitor_sessions (visitor_id, token_hash, expires_at)
       VALUES (?, ?, ?)`
    ).run(visitorId, tokenHash, expiresAt);

    return {
      visitorToken: rawToken,
      expiresAt,
      resumed: false,
    };
  }

  /**
   * Verify an opaque visitor token against `visitor_sessions` and return its internal `visitor_id`.
   */
  public resolveVisitorId(rawToken: unknown): string {
    if (!isValidTokenFormat(rawToken)) {
      throw new VisitorJourneyError('Phiên khách tham quan không hợp lệ hoặc bị thiếu.', 401);
    }
    const db = this.v28Db.getConnection();
    const tokenHash = hashVisitorToken(rawToken);
    const row = db
      .prepare('SELECT visitor_id, expires_at FROM visitor_sessions WHERE token_hash = ?')
      .get(tokenHash) as { visitor_id?: string; expires_at?: string } | undefined;

    if (!row?.visitor_id || !row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
      throw new VisitorJourneyError('Phiên khách tham quan đã hết hạn hoặc không tồn tại.', 401);
    }

    db.prepare('UPDATE visitor_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE visitor_id = ?').run(
      row.visitor_id
    );
    return row.visitor_id;
  }

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
        throw new VisitorJourneyError('Không tìm thấy phiên bản triển lãm hợp lệ.', 404);
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

  private buildJourneySnapshot(
    visitorId: string,
    exhibitionId: string,
    versionId: string,
    totalBooths: number
  ): VisitorJourneySnapshot {
    const db = this.v28Db.getConnection();
    const rows = db
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

    const visits: VisitorBoothVisitRecord[] = rows.map((r) => ({
      boothId: String(r.booth_id),
      interactionType: (r.interaction_type as VisitorInteractionType) || 'booth_focus',
      firstVisitedAt: String(r.first_visited_at),
    }));

    return {
      exhibitionId,
      versionId,
      totalBooths,
      visitedCount: Math.min(totalBooths, visits.length),
      visitedBoothIds: visits.map((v) => v.boothId),
      visits,
    };
  }

  /**
   * Read verified visited booths and progress for the current visitor & exhibition version.
   */
  public getJourney(visitorToken: unknown, requestedVersionId?: string): VisitorJourneySnapshot {
    const visitorId = this.resolveVisitorId(visitorToken);
    const { exhibitionId, versionId, totalBooths } = this.resolveTargetVersion(requestedVersionId);
    return this.buildJourneySnapshot(visitorId, exhibitionId, versionId, totalBooths);
  }

  private pruneExpiredEngagements(now: number): void {
    if (this.engagementSessions.size <= 500) return;
    for (const [key, rec] of this.engagementSessions.entries()) {
      if (rec.expiresAtMs <= now || rec.used) {
        this.engagementSessions.delete(key);
      }
    }
  }

  private resolveLiveBoothApproach(versionId: string, boothId: string): { apX: number; apZ: number } {
    const versionDetail = this.exhibitionService.getVersionDetail(versionId, { includeHidden: false });
    const liveBooth = versionDetail?.booths.find((b) => b.boothId === boothId);

    if (!liveBooth) {
      throw new VisitorJourneyError('Gian hàng không tồn tại hoặc đã bị xóa khỏi phiên bản triển lãm này.', 404);
    }

    // Use live (zone-compacted if applicable) booth coordinates for approach-zone proximity check
    const posX = Number(liveBooth.positionX);
    const posZ = Number(liveBooth.positionZ);
    const rotY = Number(liveBooth.rotationY || 0);
    const arch = ARCHETYPE_MAP[liveBooth.archetypeId as V28ArchetypeId];
    const footprintDepth = arch ? arch.depth : 6.49;
    const approachOffset = footprintDepth / 2 + 2.8;
    const apX = posX + Math.sin(rotY) * approachOffset;
    const apZ = posZ + Math.cos(rotY) * approachOffset;

    if (!Number.isFinite(apX) || !Number.isFinite(apZ)) {
      throw new VisitorJourneyError('Gian hàng chưa có tọa độ tiếp cận hợp lệ.', 422);
    }

    return { apX, apZ };
  }

  private assertServerAuthoritativeProximity(
    visitorId: string,
    versionId: string,
    apX: number,
    apZ: number
  ): SpatialPresenceSample {
    const provider = this.getSpatialPresenceProvider();
    if (!provider) {
      throw new VisitorJourneyError(
        'Không thể xác thực vị trí trực tuyến trong không gian 3D. Vui lòng tải lại triển lãm.',
        503
      );
    }

    const positions = provider.getAuthoritativePositionsForVisitor(visitorId, versionId);
    if (positions.length === 0) {
      throw new VisitorJourneyError(
        'Vui lòng tham gia không gian triển lãm 3D để ghi nhận lượt tham quan hợp lệ.',
        422
      );
    }

    let best: SpatialPresenceSample | null = null;
    let bestDist = Infinity;
    for (const sample of positions) {
      const dist = Math.hypot(sample.x - apX, sample.z - apZ);
      if (dist < bestDist) {
        bestDist = dist;
        best = sample;
      }
    }

    if (!best || bestDist > VISIT_APPROACH_MAX_DISTANCE_M) {
      throw new VisitorJourneyError(
        'Avatar chưa tiến đến vùng tiếp cận hợp lệ của gian hàng này.',
        422
      );
    }

    return best;
  }

  private checkNewVisitRateAndCooldown(visitorId: string): void {
    const now = Date.now();
    const lastTs = this.lastNewVisitTsMap.get(visitorId) || 0;
    if (lastTs > 0 && now - lastTs < VISIT_MIN_COOLDOWN_MS) {
      throw new VisitorJourneyError(
        'Thao tác ghi nhận tham quan giữa các gian hàng quá nhanh. Vui lòng dừng lại xem gian hàng trước khi chuyển tiếp.',
        429
      );
    }

    const recent = (this.newVisitRateMap.get(visitorId) || []).filter(
      (ts) => now - ts < VISIT_RATE_WINDOW_MS
    );
    if (recent.length >= VISIT_RATE_MAX_NEW_PER_WINDOW) {
      this.newVisitRateMap.set(visitorId, recent);
      throw new VisitorJourneyError(
        'Tốc độ ghi nhận tham quan vượt giới hạn cho phép. Vui lòng thử lại sau ít phút.',
        429
      );
    }
    recent.push(now);
    this.newVisitRateMap.set(visitorId, recent);
    this.lastNewVisitTsMap.set(visitorId, now);
  }

  /**
   * Step 1 of Server-Verified Visit Proof:
   * Starts a server-timed engagement session ONLY if the visitor's live server-tracked avatar
   * on `/v28-dynamic` is inside the booth's live approach zone. Does NOT record a visit.
   */
  public startEngagement(input: StartBoothEngagementInput): StartBoothEngagementResult {
    const visitorId = this.resolveVisitorId(input.visitorToken);
    const { versionId } = this.resolveTargetVersion(input.versionId);

    const boothId = String(input.boothId || '').trim();
    if (!boothId) {
      throw new VisitorJourneyError('Thiếu mã gian hàng hợp lệ.', 400);
    }

    const { apX, apZ } = this.resolveLiveBoothApproach(versionId, boothId);
    this.assertServerAuthoritativeProximity(visitorId, versionId, apX, apZ);

    const db = this.v28Db.getConnection();
    const existing = db
      .prepare(
        `SELECT first_visited_at
         FROM visitor_booth_visits
         WHERE visitor_id = ? AND version_id = ? AND booth_id = ?`
      )
      .get(visitorId, versionId, boothId) as { first_visited_at?: string } | undefined;

    const now = Date.now();
    this.pruneExpiredEngagements(now);

    const engagementToken = `v28e_${crypto.randomBytes(16).toString('hex')}`;
    const expiresAtMs = now + VISIT_ENGAGEMENT_TTL_MS;
    this.engagementSessions.set(engagementToken, {
      token: engagementToken,
      visitorId,
      versionId,
      boothId,
      startedAt: now,
      expiresAtMs,
      used: false,
    });

    return {
      engagementToken,
      boothId,
      versionId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      minDwellFocusMs: VISIT_MIN_DWELL_MS_FOCUS,
      minDwellInteractMs: VISIT_MIN_DWELL_MS_INTERACT,
      alreadyVisited: Boolean(existing?.first_visited_at),
    };
  }

  /**
   * Step 2 of Server-Verified Visit Proof:
   * Records a booth visit ONLY after verifying:
   * 1. Authenticated visitor session & live booth membership in target version.
   * 2. Valid server-issued engagementToken matching (visitorId, versionId, boothId), not expired.
   * 3. Server-tracked live avatar proximity on `/v28-dynamic` (client avatarX/avatarZ are IGNORED).
   * 4. Server wall-clock minimum dwell duration (cannot be spoofed by client).
   * 5. Single-use engagement token anti-replay, booth-to-booth cooldown, sliding-window rate limit,
   *    and atomic DB deduplication.
   */
  public recordVisit(input: RecordBoothVisitInput): RecordBoothVisitResult {
    const visitorId = this.resolveVisitorId(input.visitorToken);
    const { exhibitionId, versionId, totalBooths } = this.resolveTargetVersion(input.versionId);

    const boothId = String(input.boothId || '').trim();
    if (!boothId) {
      throw new VisitorJourneyError('Thiếu mã gian hàng hợp lệ.', 400);
    }

    const { apX, apZ } = this.resolveLiveBoothApproach(versionId, boothId);
    // Strictly verify server-authoritative position (NEVER trust input.avatarX / input.avatarZ)
    this.assertServerAuthoritativeProximity(visitorId, versionId, apX, apZ);

    const rawEngagementToken = typeof input.engagementToken === 'string' ? input.engagementToken.trim() : '';
    const engagement = rawEngagementToken ? this.engagementSessions.get(rawEngagementToken) : undefined;
    if (
      !engagement ||
      engagement.visitorId !== visitorId ||
      engagement.versionId !== versionId ||
      engagement.boothId !== boothId
    ) {
      throw new VisitorJourneyError(
        'Thiếu hoặc không hợp lệ phiên tương tác gian hàng do máy chủ cấp.',
        422
      );
    }

    const now = Date.now();
    if (engagement.expiresAtMs <= now) {
      this.engagementSessions.delete(rawEngagementToken);
      throw new VisitorJourneyError('Phiên tương tác gian hàng đã hết hạn. Vui lòng xem lại gian hàng.', 422);
    }

    const db = this.v28Db.getConnection();
    // Fast-path idempotent check: already-visited booths never consume rate-limit/cooldown quota and never duplicate
    const existing = db
      .prepare(
        `SELECT first_visited_at
         FROM visitor_booth_visits
         WHERE visitor_id = ? AND version_id = ? AND booth_id = ?`
      )
      .get(visitorId, versionId, boothId) as { first_visited_at?: string } | undefined;

    if (existing?.first_visited_at) {
      const snapshot = this.buildJourneySnapshot(visitorId, exhibitionId, versionId, totalBooths);
      return {
        ...snapshot,
        boothId,
        recorded: false,
        duplicate: true,
        firstVisitedAt: existing.first_visited_at,
      };
    }

    if (engagement.used) {
      throw new VisitorJourneyError('Mã phiên tương tác đã được sử dụng.', 422);
    }

    const requiredDwellMs =
      input.interactionType === 'booth_focus'
        ? VISIT_MIN_DWELL_MS_FOCUS
        : VISIT_MIN_DWELL_MS_INTERACT;
    const elapsedMs = now - engagement.startedAt;
    if (elapsedMs < requiredDwellMs) {
      throw new VisitorJourneyError(
        'Thời gian dừng xem gian hàng chưa đủ điều kiện ghi nhận lượt tham quan.',
        422
      );
    }

    // Enforce booth-to-booth cooldown & sliding-window anti-spam ONLY for brand-new booth visits
    this.checkNewVisitRateAndCooldown(visitorId);

    // Mark engagement single-use token consumed BEFORE DB insert
    engagement.used = true;

    // Atomic deduplication via UNIQUE (visitor_id, version_id, booth_id)
    const insertRes = db
      .prepare(
        `INSERT OR IGNORE INTO visitor_booth_visits
           (visitor_id, exhibition_id, version_id, booth_id, interaction_type)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(visitorId, exhibitionId, versionId, boothId, input.interactionType);

    const recorded = Number(insertRes.changes || 0) > 0;
    const savedRow = db
      .prepare(
        `SELECT first_visited_at
         FROM visitor_booth_visits
         WHERE visitor_id = ? AND version_id = ? AND booth_id = ?`
      )
      .get(visitorId, versionId, boothId) as { first_visited_at?: string } | undefined;

    const snapshot = this.buildJourneySnapshot(visitorId, exhibitionId, versionId, totalBooths);
    return {
      ...snapshot,
      boothId,
      recorded,
      duplicate: !recorded,
      firstVisitedAt: savedRow?.first_visited_at || new Date().toISOString(),
    };
  }
}
