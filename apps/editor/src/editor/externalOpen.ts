import type { EditorId } from './editorSettings';

/**
 * Browser-side deep links for desktop editors.
 *
 * VS Code and Zed register URI schemes (`vscode://`, `zed://file`) that let a web
 * page ask the OS to open a file/folder without a local Node backend. They need
 * an *absolute* path, which is only known when the editor runs under `pxe web`
 * (the CLI backend exposes the workspace's absolute root). Editors without a
 * scheme (Sublime / Notepad / custom command) keep using the backend spawn.
 */

/** Joins an absolute root with a project-relative path using forward slashes. */
export function joinAbsolute(root: string, rel: string): string {
  const base = root.replace(/[\\/]+$/, '');
  const suffix = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${base}/${suffix}`;
}

function forwardSlash(path: string): string {
  return path.replace(/\\/g, '/');
}

/** URI scheme an editor supports, or `null` when it must be spawned instead. */
export function hasEditorScheme(editor: EditorId): boolean {
  return editor === 'vscode' || editor === 'zed';
}

/** Builds a deep-link URL for a file or folder, or `null` when unsupported. */
export function editorDeepLink(editor: EditorId, absolutePath: string, isFolder: boolean): string | null {
  const path = forwardSlash(absolutePath);

  if (editor === 'vscode') {
    // `vscode://file/<path>` opens a file; a trailing slash opens the folder.
    return `vscode://file/${encodeURI(path)}${isFolder ? '/' : ''}`;
  }

  if (editor === 'zed') {
    // Zed strips `zed://file` and URL-decodes the remainder (see its
    // `open_listener.rs`), so fully encode the path.
    return `zed://file${encodeURIComponent(path)}`;
  }

  return null;
}

/** Fires a custom-protocol URL without navigating the editor page away. */
export function triggerDeepLink(href: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.rel = 'noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
