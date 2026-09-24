import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { DEFAULT_PORT, runWebCommand } from './commands/web.js';

const pkg = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('pxe')
  .description('Pixi Creator — local editor for PixiJS H5 scenes')
  .version(pkg.version);

program
  .command('web')
  .description('Start the local web UI on 127.0.0.1 (workspace = current directory)')
  .option('-p, --port <port>', 'preferred port', String(DEFAULT_PORT))
  .option('--no-open', 'do not open the browser')
  .action(async (options: { port: string; open: boolean }) => {
    await runWebCommand({
      preferredPort: Number(options.port),
      openBrowser: options.open,
    });
  });

await program.parseAsync();
