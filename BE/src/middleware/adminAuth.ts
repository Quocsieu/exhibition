import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

const FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 10;

const failedLoginBuckets = new Map<string, { count: number; resetAt: number }>();

function getSigningSecret(): string {
  return process.env.ADMIN_TOKEN_SECRET || FALLBACK_SECRET;
}

function getExpectedCredentials(): { username: string; password: string } {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'expo-admin-2026';
  return { username, password };
}

function constantTimeStringEquals(a: string, b: string): boolean {
  const hashA = crypto.createHmac('sha256', FALLBACK_SECRET).update(a, 'utf8').digest();
  const hashB = crypto.createHmac('sha256', FALLBACK_SECRET).update(b, 'utf8').digest();
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
  const exp = Date.now() + 12 * 60 * 60 * 1000;
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
      decoded.sub.trim().length === 0 ||
      typeof decoded.exp !== 'number' ||
      !Number.isFinite(decoded.exp) ||
      Date.now() >= decoded.exp
    ) {
      return { valid: false };
    }
    return { valid: true, username: decoded.sub };
  } catch {
    return { valid: false };
  }
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
  const userMatch = constantTimeStringEquals(username, expected.username);
  const passMatch = constantTimeStringEquals(password, expected.password);
  if (userMatch && passMatch) {
    return issueAdminToken(expected.username);
  }
  return null;
}
