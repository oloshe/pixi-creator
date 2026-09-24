import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Copies the editor's Vite build into packages/cli/web so the CLI ships the
// static frontend as a single artifact.
const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDist = path.resolve(cliRoot, '../../apps/editor/dist');
const webOut = path.resolve(cliRoot, 'web');

if (!existsSync(path.join(webDist, 'index.html'))) {
  console.error(`Web build not found at ${webDist}`);
  console.error('Run `pnpm build:web` first.');
  process.exit(1);
}

rmSync(webOut, { recursive: true, force: true });
mkdirSync(webOut, { recursive: true });
cpSync(webDist, webOut, { recursive: true });

console.log(`Copied web build: ${webDist} -> ${webOut}`);
