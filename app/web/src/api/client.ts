export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
  }

  /** Field-level messages from a 422 response, keyed by field path. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as { field?: string; message?: string }[]) {
        if (d?.field && d.message && !out[d.field]) out[d.field] = d.message;
      }
    }
    return out;
  }
}

export const AUTH_EXPIRED_EVENT = 'playlab:auth-expired';
export const NETWORK_ERROR_EVENT = 'playlab:network-error';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Base path; defaults to the versioned API. */
  base?: string;
  /** Set false to skip the refresh-and-retry on 401. */
  retryOnAuth?: boolean;
  /** Called with the headers of a successful response, for example to keep its ETag. */
  onHeaders?: (headers: Headers) => void;
}

const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
const TOKEN_ERRORS = ['TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_REVOKED'];

// Goes up on every login and logout. A 401 for a request sent before the latest one says nothing about the session
// now, so it must not sign out someone who has just logged in.
let authEpoch = 0;
export const authChanged = () => {
  authEpoch++;
};
export const currentAuthEpoch = () => authEpoch;

let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function toError(res: Response): Promise<ApiRequestError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body?.error?.message) {
      return new ApiRequestError(res.status, body.error.code ?? 'ERROR', body.error.message, body.error.details ?? null);
    }
  } catch {
    /* not JSON */
  }
  return new ApiRequestError(res.status, 'HTTP_ERROR', `Request failed (${res.status})`);
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, base = '/api/v1', retryOnAuth = true, onHeaders } = opts;
  const epoch = authEpoch;
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, init);
  } catch {
    window.dispatchEvent(new Event(NETWORK_ERROR_EVENT));
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'We could not reach the server. Check your connection and try again.');
  }

  if (res.status === 401 && retryOnAuth && base === '/api/v1' && !NO_REFRESH_PATHS.includes(path)) {
    if (await refreshSession()) return api<T>(path, { ...opts, retryOnAuth: false });
    if (epoch === authEpoch) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    // The failed refresh cleared the dead login cookies, so a request refused only for its token can go again as a
    // guest: adding to the cart still works after the session has gone (PLS-1.8).
    const error = await toError(res);
    if (TOKEN_ERRORS.includes(error.code)) return api<T>(path, { ...opts, retryOnAuth: false });
    throw error;
  }

  if (!res.ok) throw await toError(res);
  onHeaders?.(res.headers);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiRequestError(res.status, 'BAD_RESPONSE', 'The server sent a response we could not read.');
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  return 'Something went wrong. Please try again.';
}
