import net from 'node:net';

export const DEFAULT_PORT = 18118;
export const BIND_HOST = '127.0.0.1';

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Walks upward from `startPort` until a free port on `127.0.0.1` is found.
 *
 * The editor never hardcodes the port (it uses relative `/api/...` URLs), so
 * the fallback sequence `18118 → 18119 → 18120 …` is transparent to the UI.
 */
export async function findAvailablePort(startPort = DEFAULT_PORT, host = BIND_HOST): Promise<number> {
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
    throw new Error(`Invalid port: ${startPort}`);
  }

  let port = startPort;

  while (!(await isPortAvailable(port, host))) {
    port += 1;

    if (port > 65535) {
      throw new Error('No available port found');
    }
  }

  return port;
}
