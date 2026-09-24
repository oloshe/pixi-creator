import { Hono } from 'hono';
import { hostGuard, originGuard } from './auth.js';
import { registerFsRoutes } from './routes/fs.js';
import { registerSystemRoutes } from './routes/system.js';
import { serveWeb } from './static.js';
import { WorkspaceError, WorkspaceState } from './workspace.js';

export interface AppOptions {
  workspace: string;
  webRoot: string;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const workspace = new WorkspaceState(options.workspace);

  // Loopback-only applies to the whole server (static + API) to stop DNS rebinding.
  app.use('*', hostGuard());

  app.get('/api/health', (c) => c.json({ ok: true }));

  // API routes are loopback-only via originGuard (no session token).
  app.use('/api/*', originGuard());

  registerFsRoutes(app, workspace);
  registerSystemRoutes(app, workspace);

  serveWeb(app, options.webRoot);

  app.onError((error, c) => {
    const code = (error as NodeJS.ErrnoException)?.code;

    if (error instanceof WorkspaceError) {
      return c.json({ error: error.message }, 400);
    }
    if (code === 'ENOENT') {
      return c.json({ error: 'not found' }, 404);
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return c.json({ error: error.message }, 403);
    }

    console.error('[pxe]', error);
    return c.json({ error: error instanceof Error ? error.message : 'internal error' }, 500);
  });

  return app;
}
