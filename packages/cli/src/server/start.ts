import { serve } from '@hono/node-server';
import { createApp, type AppOptions } from './app.js';

export interface StartOptions extends AppOptions {
  port: number;
  hostname?: string;
}

export function startServer(options: StartOptions) {
  const app = createApp(options);

  return serve({
    fetch: app.fetch,
    // Localhost only: the backend has filesystem + process permissions a normal
    // web page must never reach.
    hostname: options.hostname ?? '127.0.0.1',
    port: options.port,
  });
}
