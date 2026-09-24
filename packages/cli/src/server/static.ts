import type { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeOf(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Serves the prebuilt React editor from `web/` (index.html + play.html + assets).
 *
 * Unknown non-API paths fall back to `index.html`. API paths are never served
 * here — they are handled by the routes registered earlier.
 */
export function serveWeb(app: Hono, webRoot: string): void {
  app.get('*', (c) => {
    const urlPath = c.req.path;

    if (urlPath.startsWith('/api/')) {
      return c.text('not found', 404);
    }

    let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
    if (rel === '') {
      rel = 'index.html';
    }

    const filePath = path.normalize(path.join(webRoot, rel));

    if (filePath !== webRoot && !filePath.startsWith(webRoot + path.sep)) {
      return c.text('forbidden', 403);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return c.body(fs.readFileSync(filePath), 200, { 'content-type': mimeOf(filePath) });
    }

    const index = path.join(webRoot, 'index.html');

    if (fs.existsSync(index)) {
      return c.body(fs.readFileSync(index), 200, { 'content-type': 'text/html; charset=utf-8' });
    }

    return c.text('Pixi Creator web build not found — run `pnpm build:web && pnpm copy:web` first.', 404);
  });
}
