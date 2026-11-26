import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PERSISTENT_SECRET_PATH = path.resolve(THIS_DIR, '../../data/.admin_token_secret');

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
let cachedPersistentSecret: string | null = null;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 10;

const failedLoginBuckets = new Map<string, { count: number; resetAt: number }>();

function loadOrCreatePersistentSecret(): string {
  if (cachedPersistentSecret) return cachedPersistentSecret;
  if (process.env.VITEST) {
    cachedPersistentSecret = EPHEMERAL_FALLBACK_SECRET;
    return cachedPersistentSecret;
  }
  try {
    if (fs.existsSync(PERSISTENT_SECRET_PATH)) {
      const existing = fs.readFileSync(PERSISTENT_SECRET_PATH, 'utf8').trim();
      if (existing.length >= 32) {
        cachedPersistentSecret = existing;
        return cachedPersistentSecret;
      }
    }
    fs.mkdirSync(path.dirname(PERSISTENT_SECRET_PATH), { recursive: true });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(PERSISTENT_SECRET_PATH, generated, { mode: 0o600 });
    cachedPersistentSecret = generated;
    return cachedPersistentSecret;
  } catch {
    cachedPersistentSecret = EPHEMERAL_FALLBACK_SECRET;
    return cachedPersistentSecret;
  }
}

function getSigningSecret(): string {
  const fromEnv = (process.env.ADMIN_TOKEN_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  return loadOrCreatePersistentSecret();
}

function resolveAdminTokenExpiry(): number | null {
  const rawHours = (process.env.ADMIN_SESSION_TTL_HOURS || '').trim();
  if (rawHours) {
    const hours = Number(rawHours);
    if (Number.isFinite(hours) && hours > 0) {
      return Date.now() + Math.round(hours * 60 * 60 * 1000);
    }
  }
  // Non-expiring session by default: stays signed in across reloads/restarts until explicit Logout
  return null;
}

function getExpectedCredentials(): { username: string; password: string } | null {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
    return null; // V28-AUDIT-046: Fail closed in production when admin credentials are not configured
  }
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'expo-admin-2026';
  return { username, password };
}

/**
 * Phase 7 — Safe Demo Mode:
 * - Disabled by default when NODE_ENV === 'production' (unless explicitly opted in via ALLOW_PUBLIC_DEMO_LOGIN=true for client demos) or ADMIN_DEMO_MODE === 'false'.
 * - Uses a dedicated demo identity separate from the real Admin account.
 * - Never exposes or reuses real ADMIN_PASSWORD.
 */
export function isDemoLoginEnabled(): boolean {
  if (String(process.env.ALLOW_PUBLIC_DEMO_LOGIN || '').toLowerCase() === 'true') {
    return true;
  }
  if (process.env.NODE_ENV === 'production') return false;
  if (String(process.env.ADMIN_DEMO_MODE || '').toLowerCase() === 'false') return false;
  return true;
}

export function getDemoAccountCredentials(): { username: string; password: string } | null {
  if (!isDemoLoginEnabled()) return null;
  const username = process.env.ADMIN_DEMO_USERNAME || 'demo-admin';
  const password = process.env.ADMIN_DEMO_PASSWORD || 'demo-expo-2026';
  return { username, password };
}

function constantTimeStringEquals(a: string, b: string): boolean {
  const secret = getSigningSecret();
  const hashA = crypto.createHmac('sha256', secret).update(a, 'utf8').digest();
  const hashB = crypto.createHmac('sha256', secret).update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB) && a.length === b.length;
}

export function checkAdminLoginAllowed(clientIp: string): boolean {
  const key = clientIp || 'unknown';
  const now = Date.now();
  const bucket = failedLoginBuckets.get(key);
  if (!bucket) return true;
  if (now >= bucket.resetAt) {
    failedLoginBuckets.delete(key);
    return true;
  }
  return bucket.count < MAX_FAILED_LOGIN_ATTEMPTS;
}

export function recordAdminLoginOutcome(clientIp: string, succeeded: boolean): void {
  const key = clientIp || 'unknown';
  if (succeeded) {
    failedLoginBuckets.delete(key);
    return;
  }
  const now = Date.now();
  if (failedLoginBuckets.size > 500) {
    for (const [k, v] of failedLoginBuckets.entries()) {
      if (now >= v.resetAt) failedLoginBuckets.delete(k);
    }
  }
  const existing = failedLoginBuckets.get(key);
  if (!existing || now >= existing.resetAt) {
    failedLoginBuckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

export function resetAdminLoginRateLimitForTests(): void {
  failedLoginBuckets.clear();
}

export function issueAdminToken(username: string): string {
  const exp = resolveAdminTokenExpiry();
  const payload = Buffer.from(JSON.stringify({ sub: username, role: 'admin', exp })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string): { valid: boolean; username?: string } {
  if (typeof token !== 'string' || token.length < 16 || token.length > 1024) {
    return { valid: false };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false };
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      sub?: unknown;
      role?: unknown;
      exp?: unknown;
    };
    if (
      decoded.role !== 'admin' ||
      typeof decoded.sub !== 'string' ||
      decoded.sub.trim().length === 0
    ) {
      return { valid: false };
    }
    if (decoded.exp !== null && decoded.exp !== undefined) {
      if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || Date.now() >= decoded.exp) {
        return { valid: false };
      }
    }
    return { valid: true, username: decoded.sub };
  } catch {
    return { valid: false };
  }
}

export function isRequestAuthenticatedAdmin(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  return verifyAdminToken(token).valid;
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Yêu cầu xác thực quản trị viên (Missing Bearer token).' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const verified = verifyAdminToken(token);
  if (!verified.valid) {
    res.status(401).json({ error: 'Phiên đăng nhập quản trị không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  res.locals.adminUsername = verified.username || 'admin';
  next();
}

export function authenticateAdminCredentials(username?: unknown, password?: unknown): string | null {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return null;
  }
  const expected = getExpectedCredentials();
  if (expected) {
    const userMatch = constantTimeStringEquals(username, expected.username);
    const passMatch = constantTimeStringEquals(password, expected.password);
    if (userMatch && passMatch) {
      return issueAdminToken(expected.username);
    }
  }
  const demo = getDemoAccountCredentials();
  if (demo) {
    const demoUserMatch = constantTimeStringEquals(username, demo.username);
    const demoPassMatch = constantTimeStringEquals(password, demo.password);
    if (demoUserMatch && demoPassMatch) {
      return issueAdminToken(demo.username);
    }
  }
  return null;
}
