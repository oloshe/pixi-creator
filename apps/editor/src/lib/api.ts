/**
 * Central HTTP client for the local backend served by `pxe web`.
 *
 * The CLI binds 127.0.0.1 and opens `/?token=…`; every `/api/*` call re-sends
 * that token as `Authorization: Bearer …` so a random browser tab (or a
 * cross-origin page) cannot drive the filesystem/process backend.
 *
 * Components never call `fetch` directly — they go through `api` here, so the
 * transport can change without another full-project migration.
 */

const TOKEN_STORAGE_KEY = 'pxe:token';

function readToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const query = new URLSearchParams(window.location.search).get('token');

  if (query) {
    try {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, query);
    } catch {
      /* Best-effort. */
    }
    return query;
  }

  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let tokenValue: string | null | undefined;

export function getToken(): string | null {
  if (tokenValue === undefined) {
    tokenValue = readToken();
  }
  return tokenValue;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export interface ApiRequest {
  method?: string;
  body?: unknown;
}

export async function apiFetch(path: string, init: ApiRequest = {}): Promise<Response> {
  const headers: Record<string, string> = { ...authHeaders() };
  const hasBody = init.body !== undefined;
  const body = hasBody ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)) : undefined;

  if (hasBody && typeof init.body !== 'string') {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: init.method ?? (hasBody ? 'POST' : 'GET'),
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text || `HTTP ${response.status}`;

    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (typeof parsed?.error === 'string' && parsed.error) {
        message = parsed.error;
      }
    } catch {
      /* Body is not JSON — keep the raw text. */
    }

    throw new Error(message);
  }

  return response;
}

async function apiJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(path, { body });
  return response.json() as Promise<T>;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export const api = {
  workspace(): Promise<WorkspaceInfo> {
    return apiJson<WorkspaceInfo>('/api/workspace');
  },
  listDir(roots: string[]): Promise<string[]> {
    return apiJson<string[]>('/api/fs/list', { roots });
  },
  readText(path: string): Promise<{ content: string | null }> {
    return apiJson<{ content: string | null }>('/api/fs/read', { path });
  },
  writeText(path: string, text: string): Promise<{ ok: boolean }> {
    return apiJson<{ ok: boolean }>('/api/fs/write', { path, text });
  },
  rename(from: string, to: string): Promise<{ ok: boolean }> {
    return apiJson<{ ok: boolean }>('/api/fs/rename', { from, to });
  },
  delete(path: string): Promise<{ ok: boolean }> {
    return apiJson<{ ok: boolean }>('/api/fs/delete', { path });
  },
  openInEditor(editor: string, path: string | null, custom?: string | null, reveal = false): Promise<{ ok: boolean }> {
    return apiJson<{ ok: boolean }>('/api/system/open-editor', { editor, path, custom: custom ?? null, reveal });
  },
};

export async function readBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await apiFetch('/api/fs/bytes', { body: { path } });
  return new Uint8Array(await response.arrayBuffer());
}

let httpBackend: boolean | null = null;

/** Detects whether we are served by `pxe web` (token present + `/api` reachable). */
export async function detectHttpBackend(): Promise<boolean> {
  if (httpBackend !== null) {
    return httpBackend;
  }

  httpBackend = false;

  if (!getToken()) {
    return httpBackend;
  }

  try {
    const response = await fetch('/api/workspace', { headers: authHeaders() });
    httpBackend = response.ok;
  } catch {
    httpBackend = false;
  }

  return httpBackend;
}

export function isHttpBackend(): boolean {
  return httpBackend === true;
}
