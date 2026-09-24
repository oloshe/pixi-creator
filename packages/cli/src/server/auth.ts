import type { Context, Next } from 'hono';

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function hostHeader(c: Context): string {
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  return normalizeHostname(host.replace(/:\d+$/, ''));
}

/**
 * Rejects requests whose `Host` header is not loopback. This closes the DNS
 * rebinding hole (a remote domain resolving to 127.0.0.1 would otherwise send
 * a hostile `Host` and read the local backend), and applies to static files
 * too so the whole server is loopback-only.
 */
export function hostGuard() {
  return async (c: Context, next: Next) => {
    if (!ALLOWED_HOSTNAMES.has(hostHeader(c))) {
      return c.json({ error: 'forbidden host' }, 403);
    }
    await next();
  };
}

/**
 * Guards `/api/*`: a browser `Origin` must be loopback (when present), and the
 * request must carry the per-launch `Authorization: Bearer <token>`.
 */
export function authGuard(token: string) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');

    if (origin) {
      let hostname: string;
      try {
        hostname = normalizeHostname(new URL(origin).hostname);
      } catch {
        return c.json({ error: 'invalid origin' }, 403);
      }
      if (!ALLOWED_HOSTNAMES.has(hostname)) {
        return c.json({ error: 'forbidden origin' }, 403);
      }
    }

    if (c.req.header('authorization') !== `Bearer ${token}`) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    await next();
  };
}
