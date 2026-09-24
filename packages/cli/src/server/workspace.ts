import path from 'node:path';
import fs from 'node:fs';

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.pxe']);

/** Raised when a request path cannot be resolved inside the workspace. */
export class WorkspaceError extends Error {}

/**
 * Workspace holder. The CLI binds the workspace to `process.cwd()` for the
 * server's lifetime; routes read `.current` (and `.name`) from this holder
 * instead of capturing a raw string.
 */
export class WorkspaceState {
  readonly current: string;

  constructor(initial: string) {
    this.current = path.resolve(initial);
  }

  get name(): string {
    return workspaceName(this.current);
  }
}

/**
 * Rejects `..`, absolute paths and drive-absolute paths so a project-relative
 * path can never escape the workspace, then normalises separators.
 */
export function normalizeRel(rel: string): string {
  const trimmed = rel.trim().replace(/\\/g, '/');
  if (trimmed === '') {
    throw new WorkspaceError('empty path');
  }
  if (trimmed.startsWith('/') || (trimmed.length >= 2 && trimmed[1] === ':')) {
    throw new WorkspaceError('absolute paths are not allowed');
  }

  const parts: string[] = [];
  for (const part of trimmed.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      throw new WorkspaceError('path traversal is not allowed');
    }
    parts.push(part);
  }

  return parts.join('/');
}

/**
 * Resolves a project-relative path against the workspace and verifies it stays
 * inside (belt-and-suspenders on top of `normalizeRel`).
 */
export function resolveWorkspacePath(workspace: string, inputPath: string): string {
  const rel = normalizeRel(inputPath);
  const resolved = path.resolve(workspace, rel);
  const root = path.resolve(workspace);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new WorkspaceError('path outside workspace');
  }

  return resolved;
}

export function workspaceName(workspace: string): string {
  return path.basename(path.resolve(workspace)) || 'project';
}

/** Recursively lists files, skipping `node_modules`, `dist`, `.git`, `.pxe` and dotfiles. */
export async function walkWorkspace(root: string, dir: string, out: string[]): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    // A missing sub-root is not an error.
    return;
  }

  for (const entry of entries) {
    const name = entry.name;
    const full = path.join(dir, name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(name) || name.startsWith('.')) {
        continue;
      }
      await walkWorkspace(root, full, out);
    } else if (entry.isFile()) {
      if (name.startsWith('.')) {
        continue;
      }
      out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }
}

