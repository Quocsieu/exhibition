/**
 * Centralized API & Socket.IO endpoint configuration for Virtual Expo (FE <-> BE).
 *
 * Ensures consistent URL resolution across:
 * 1. Local development (`npm run dev` with Vite proxy to http://localhost:4000)
 * 2. Production deployment on Vercel (`https://exhibition-*.vercel.app`) connected to
 *    Render Backend (`https://exhibition-xl20.onrender.com`).
 */

export const DEFAULT_PRODUCTION_BACKEND_URL = 'https://exhibition-xl20.onrender.com';

/**
 * Normalizes a backend base URL:
 * - Trims whitespace
 * - Adds `https://` (or `http://` for localhost) if protocol was omitted in env config
 * - Removes trailing slashes
 * - Removes accidental `/api` or `/socket.io` suffix so paths like `/api/booths` never double up
 */
export function normalizeBackendOrigin(rawUrl: string | undefined | null): string {
  if (!rawUrl) return '';
  let cleaned = rawUrl.trim();
  if (!cleaned) return '';

  if (!/^https?:\/\//i.test(cleaned)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(cleaned);
    cleaned = `${isLocal ? 'http' : 'https'}://${cleaned}`;
  }

  cleaned = cleaned.replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/(api|socket\.io)$/i, '');
  return cleaned;
}

/**
 * Resolves the primary REST API base URL.
 * - In local dev (`import.meta.env.DEV`), returns `''` by default so requests use Vite's `/api` proxy
 *   to the local backend (unless `VITE_USE_REMOTE_API_IN_DEV=true` is set).
 * - In production (`import.meta.env.PROD`), uses normalized `VITE_API_URL` or falls back to
 *   `DEFAULT_PRODUCTION_BACKEND_URL`.
 */
export function resolveApiBaseUrl(): string {
  const isDev = Boolean(import.meta.env.DEV);
  const useRemoteInDev = import.meta.env.VITE_USE_REMOTE_API_IN_DEV === 'true';

  if (isDev && !useRemoteInDev) {
    return '';
  }

  const envApiUrl = normalizeBackendOrigin(import.meta.env.VITE_API_URL as string | undefined);
  if (envApiUrl) {
    return envApiUrl;
  }

  return isDev ? '' : DEFAULT_PRODUCTION_BACKEND_URL;
}

/**
 * Resolves the Socket.IO server URL.
 * - In local dev (`import.meta.env.DEV`), returns `undefined` by default so `socket.io-client`
 *   connects through Vite's `/socket.io` WebSocket proxy.
 * - In production (`import.meta.env.PROD`), connects directly to Render (`VITE_SOCKET_URL`,
 *   `VITE_API_URL`, or `DEFAULT_PRODUCTION_BACKEND_URL`) because Vercel static rewrites do not
 *   maintain persistent stateful WebSocket upgrades.
 */
export function resolveSocketBaseUrl(): string | undefined {
  const isDev = Boolean(import.meta.env.DEV);
  const useRemoteInDev = import.meta.env.VITE_USE_REMOTE_API_IN_DEV === 'true';

  if (isDev && !useRemoteInDev) {
    return undefined;
  }

  const envSocketUrl = normalizeBackendOrigin(
    (import.meta.env.VITE_SOCKET_URL as string | undefined) ||
      (import.meta.env.VITE_API_URL as string | undefined)
  );
  if (envSocketUrl) {
    return envSocketUrl;
  }

  return isDev ? undefined : DEFAULT_PRODUCTION_BACKEND_URL;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SOCKET_BASE_URL = resolveSocketBaseUrl();

/**
 * Builds the full URL for an API path (e.g. `/api/booths`).
 */
export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
