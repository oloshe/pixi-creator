/**
 * Central HTTP client for the local backend served by `pxe web`.
 *
 * The CLI binds 127.0.0.1 and serves the prebuilt editor plus `/api/*` file
 * and system routes. No session token is used: the server is loopback-only and
 * rejects non-loopback `Host`/`Origin` headers to prevent CSRF and DNS
 * rebinding.
 *
 * Components never call `fetch` directly — they go through `api` here, so the
 * transport can change without another full-project migration.
 */

export interface ApiRequest {
  method?: string;
  body?: unknown;
}

export async function apiFetch(path: string, init: ApiRequest = {}): Promise<Response> {
  const headers: Record<string, string> = {};
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

/**
 * Detects whether we are served by `pxe web`. `/api/workspace` only answers
 * with `{ path, name }` on the real backend; a static host (Vite dev or SPA
 * fallback) returns HTML or 404, which fails the JSON/`path` check.
 */
export async function detectHttpBackend(): Promise<boolean> {
  if (httpBackend !== null) {
    return httpBackend;
  }

  httpBackend = false;

  try {
    const info = await api.workspace();
    httpBackend = typeof info?.path === 'string' && info.path.length > 0;
  } catch {
    httpBackend = false;
  }

  return httpBackend;
}

export function isHttpBackend(): boolean {
  return httpBackend === true;
}
