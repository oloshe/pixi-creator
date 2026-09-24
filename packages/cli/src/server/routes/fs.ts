import type { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  resolveWorkspacePath,
  walkWorkspace,
  type WorkspaceState,
} from '../workspace.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.txt': 'text/plain',
};

function mimeOf(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

export function registerFsRoutes(app: Hono, workspace: WorkspaceState): void {
  app.get('/api/workspace', (c) => c.json({ path: workspace.current, name: workspace.name }));

  app.post('/api/fs/list', async (c) => {
    const { roots } = await c.req.json<{ roots?: string[] }>();
    const out: string[] = [];

    for (const sub of roots ?? []) {
      await walkWorkspace(workspace.current, resolveWorkspacePath(workspace.current, sub), out);
    }

    out.sort();
    return c.json([...new Set(out)]);
  });

  app.post('/api/fs/read', async (c) => {
    const { path: inputPath } = await c.req.json<{ path: string }>();
    const filePath = resolveWorkspacePath(workspace.current, inputPath);

    try {
      return c.json({ content: await fs.readFile(filePath, 'utf8') });
    } catch (error) {
      if (isNotFound(error)) {
        return c.json({ content: null });
      }
      throw error;
    }
  });

  app.post('/api/fs/bytes', async (c) => {
    const { path: inputPath } = await c.req.json<{ path: string }>();
    const filePath = resolveWorkspacePath(workspace.current, inputPath);
    const buffer = await fs.readFile(filePath);
    return c.body(buffer, 200, { 'content-type': mimeOf(inputPath) });
  });

  app.post('/api/fs/write', async (c) => {
    const { path: inputPath, text } = await c.req.json<{ path: string; text: string }>();
    const filePath = resolveWorkspacePath(workspace.current, inputPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, text, 'utf8');
    return c.json({ ok: true });
  });

  app.post('/api/fs/rename', async (c) => {
    const { from, to } = await c.req.json<{ from: string; to: string }>();
    const fromPath = resolveWorkspacePath(workspace.current, from);
    const toPath = resolveWorkspacePath(workspace.current, to);
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
    return c.json({ ok: true });
  });

  app.post('/api/fs/delete', async (c) => {
    const { path: inputPath } = await c.req.json<{ path: string }>();
    const filePath = resolveWorkspacePath(workspace.current, inputPath);
    await fs.unlink(filePath);
    return c.json({ ok: true });
  });
}
