import { useUiStore } from '../../../stores/uiStore.ts';
import { ApiError } from '../ApiClient.ts';

/* ============================================================================
 * Transport HTTP commun (JSON, CSV, binaires PDF/backups, query string)
 * ============================================================================ */

function buildHeaders(init: RequestInit): Headers {
  const token = useUiStore.getState().token;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && token !== 'cookie-session') {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-DepotPro-Token', token);
  }
  return headers;
}

export async function httpRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = buildHeaders(init);
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    useUiStore.getState().setToken(null);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const err = (await res.json()) as { code?: string; message?: string };
      throw new ApiError(err.code || 'API_ERROR', err.message || 'Erreur lors de la requête.', res.status);
    }
    throw new ApiError('HTTP_ERROR', `Erreur HTTP ${res.status}`, res.status);
  }
  if (contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

export async function httpRequestBytes(path: string, init: RequestInit = {}): Promise<Uint8Array> {
  const headers = buildHeaders(init);
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    useUiStore.getState().setToken(null);
  }
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const err = (await res.json()) as { code?: string; message?: string };
      throw new ApiError(err.code || 'API_ERROR', err.message || 'Erreur lors de la requête.', res.status);
    }
    throw new ApiError('HTTP_ERROR', `Erreur HTTP ${res.status}`, res.status);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export function buildQueryString(params: Record<string, unknown> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
