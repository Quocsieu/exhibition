import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

const RUNTIME_SECRET = process.env.ADMIN_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

function getExpectedCredentials(): { username: string; password: string } {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'expo-admin-2026';
  return { username, password };
}

export function issueAdminToken(username: string): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: username, role: 'admin', exp })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', RUNTIME_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string): { valid: boolean; username?: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', RUNTIME_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      sub: string;
      role: string;
      exp: number;
    };
    if (decoded.role !== 'admin' || Date.now() > decoded.exp) {
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

  next();
}

export function authenticateAdminCredentials(username?: string, password?: string): string | null {
  const expected = getExpectedCredentials();
  if (
    typeof username === 'string' &&
    typeof password === 'string' &&
    username === expected.username &&
    password === expected.password
  ) {
    return issueAdminToken(username);
  }
  return null;
}
