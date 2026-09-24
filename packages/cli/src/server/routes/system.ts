import type { Hono } from 'hono';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { resolveWorkspacePath, type WorkspaceState } from '../workspace.js';

/**
 * Whitelisted "open in external editor / file manager" action. The editor string
 * never reaches a generic shell: it maps to a fixed command, and only the
 * resolved project path is passed as an argument.
 *
 * `path` may be omitted (or empty) to target the workspace root itself, which is
 * how "Open Project With…" opens a whole folder rather than a single file.
 */

type EditorKind = 'vscode' | 'zed' | 'sublime' | 'notepad' | 'custom' | 'file-manager';

function isEditorKind(value: string): value is EditorKind {
  return ['vscode', 'zed', 'sublime', 'notepad', 'custom', 'file-manager'].includes(value);
}

/** Quotes one Windows command-line token so paths with spaces survive `cmd /c`. */
function quoteWindows(token: string): string {
  if (/^[a-zA-Z0-9_./\\:+-]*$/.test(token) && token !== '') {
    return token;
  }
  return `"${token.replace(/"/g, '""')}"`;
}

function fileManagerCommand(filePath: string, reveal: boolean): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    // `explorer /select,<path>` selects a file; `explorer <dir>` opens a folder.
    return reveal
      ? { command: 'explorer', args: ['/select,', filePath] }
      : { command: 'explorer', args: [filePath] };
  }

  if (process.platform === 'darwin') {
    // `open -R` reveals a file in Finder; `open` opens a folder.
    return reveal
      ? { command: 'open', args: ['-R', filePath] }
      : { command: 'open', args: [filePath] };
  }

  // Linux has no portable "reveal"; open the containing folder instead.
  const target = reveal ? path.dirname(filePath) : filePath;
  return { command: 'xdg-open', args: [target] };
}

function editorCommand(
  editor: string,
  filePath: string,
  custom?: string,
  reveal = false,
): { command: string; args: string[] } {
  if (editor === 'file-manager') {
    return fileManagerCommand(filePath, reveal);
  }

  switch (editor) {
    case 'vscode':
      return { command: process.platform === 'win32' ? 'code.cmd' : 'code', args: ['-r', filePath] };
    case 'zed':
      return { command: 'zed', args: [filePath] };
    case 'sublime':
      return { command: 'subl', args: [filePath] };
    case 'notepad':
      return { command: process.platform === 'win32' ? 'notepad' : 'gedit', args: [filePath] };
    case 'custom': {
      const template = custom ?? '';
      if (template.trim() === '') {
        throw new Error('custom command is empty');
      }
      const parts = template.replace('{file}', () => filePath).split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        throw new Error('custom command is empty');
      }
      return { command: parts[0]!, args: parts.slice(1) };
    }
    default:
      throw new Error(`unknown editor: ${editor}`);
  }
}

/** Reports whether an executable resolves on PATH (best-effort pre-flight). */
function commandExists(command: string): boolean {
  try {
    const check = process.platform === 'win32'
      ? spawnSync('where', [command], { stdio: 'pipe', windowsHide: true })
      : spawnSync('which', [command], { stdio: 'pipe' });
    return check.status === 0;
  } catch {
    // Cannot verify — let the real spawn try and report its own error.
    return true;
  }
}

function launch(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!commandExists(command)) {
      reject(new Error(`command not found: ${command}`));
      return;
    }

    // On Windows the command is usually a `.cmd` shim (`code.cmd`) that only runs
    // through a shell; `explorer` and `notepad` also expect a shell. Build one
    // quoted command line there instead of letting Node mangle the args array.
    console.log('[pxe] open-editor:', command, args.join(' '));
    const child = process.platform === 'win32'
      ? spawn([command, ...args].map(quoteWindows).join(' '), {
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      : spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

    child.once('spawn', () => {
      child.unref();
      resolve();
    });
    child.once('error', (error) => {
      reject(error);
    });
  });
}

export function registerSystemRoutes(app: Hono, workspace: WorkspaceState): void {
  app.post('/api/system/open-editor', async (c) => {
    const { editor, path: inputPath, custom, reveal } = await c.req.json<{
      editor: string;
      path?: string | null;
      custom?: string | null;
      reveal?: boolean;
    }>();

    if (!isEditorKind(editor)) {
      throw new Error(`unknown editor: ${editor}`);
    }

    // An empty/missing path targets the workspace root (the project folder).
    const target = inputPath ? resolveWorkspacePath(workspace.current, inputPath) : workspace.current;
    const { command, args } = editorCommand(editor, target, custom ?? undefined, reveal ?? false);
    await launch(command, args);
    return c.json({ ok: true });
  });
}
