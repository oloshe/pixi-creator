import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { BIND_HOST, DEFAULT_PORT, findAvailablePort } from '../server/port.js';
import { startServer } from '../server/start.js';

export interface WebCommandOptions {
  preferredPort: number;
  openBrowser: boolean;
}

/**
 * Resolves the bundled React build relative to this compiled file, never
 * `process.cwd()`: `npx pxe web` runs with the user's project as cwd, so the
 * web assets must be located from `import.meta.url`.
 */
function resolveWebRoot(): string {
  // dist/commands/web.js → packages/cli/web
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');
}

export async function runWebCommand(options: WebCommandOptions): Promise<void> {
  const workspace = process.cwd();
  const port = await findAvailablePort(options.preferredPort);

  startServer({
    port,
    workspace,
    webRoot: resolveWebRoot(),
    hostname: BIND_HOST,
  });

  const url = `http://${BIND_HOST}:${port}/`;

  console.log();
  console.log('Pixi Creator Editor');
  console.log(`Workspace: ${workspace}`);
  console.log(url);
  console.log();

  if (port !== options.preferredPort) {
    console.log(`Port ${options.preferredPort} is busy, using ${port} instead.`);
  }

  if (options.openBrowser) {
    try {
      await open(url);
    } catch (error) {
      console.error(`Could not open the browser automatically: ${String(error)}`);
      console.error(`Open this URL manually: ${url}`);
    }
  }
}

export { BIND_HOST, DEFAULT_PORT };
