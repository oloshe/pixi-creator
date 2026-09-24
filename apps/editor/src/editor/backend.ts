import { api, readBytes, type WorkspaceInfo } from '../lib/api';

/**
 * Backend-neutral file access.
 *
 * - Under the local backend (`pxe web`), the auto-opened workspace is read/
 *   written through the Hono `/api/fs/*` routes (absolute workspace paths, no
 *   browser sandbox, can launch external editors).
 * - "Open Project" always uses the browser-native picker: the File System
 *   Access API (`showDirectoryPicker`, read **and** write) or a
 *   `<input webkitdirectory>` read-only fallback.
 *
 * The pure layers (`assetDatabase`, `componentDatabase`, …) never see either.
 */

export interface ProjectFile {
  readonly path: string;
  /** Reads text; `null` when the file does not exist (backend). */
  text(): Promise<string | null>;
  bytes(): Promise<Uint8Array<ArrayBuffer>>;
  /** A `blob:` URL Pixi can load, cached per file. */
  objectUrl(): Promise<string>;
}

export class BrowserProjectFile implements ProjectFile {
  constructor(readonly path: string, private readonly file: File) {}

  async text(): Promise<string | null> {
    return await this.file.text();
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await this.file.arrayBuffer());
  }

  async objectUrl(): Promise<string> {
    return URL.createObjectURL(this.file);
  }
}

export class HttpProjectFile implements ProjectFile {
  private objectUrlValue: string | null = null;

  constructor(readonly path: string) {}

  async text(): Promise<string | null> {
    const { content } = await api.readText(this.path);
    return content;
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return readBytes(this.path);
  }

  async objectUrl(): Promise<string> {
    if (this.objectUrlValue) {
      return this.objectUrlValue;
    }

    const bytes = await this.bytes();
    this.objectUrlValue = URL.createObjectURL(new Blob([bytes]));
    return this.objectUrlValue;
  }
}

export interface PickedProjectDir {
  name: string;
  path: string;
}

function toPicked(workspace: WorkspaceInfo): PickedProjectDir {
  return { name: workspace.name, path: workspace.path };
}

/** The backend's current workspace (used to auto-open on startup). */
export function currentWorkspace(): Promise<PickedProjectDir> {
  return api.workspace().then(toPicked);
}

export function listProjectDir(_root: string, roots: string[]): Promise<string[]> {
  return api.listDir(roots);
}

export function readProjectText(_root: string, rel: string): Promise<string | null> {
  return api.readText(rel).then(({ content }) => content);
}

export function writeProjectText(_root: string, rel: string, text: string): Promise<void> {
  return api.writeText(rel, text).then(() => undefined);
}

export function renameProjectFile(_root: string, from: string, to: string): Promise<void> {
  return api.rename(from, to).then(() => undefined);
}

export function deleteProjectFile(_root: string, rel: string): Promise<void> {
  return api.delete(rel).then(() => undefined);
}

/**
 * Opens a project-relative file (or the project folder when `rel` is `null`)
 * in an external editor. Only meaningful under the local backend, where the
 * server resolves the absolute workspace path.
 */
export function openInEditor(editor: string, _root: string, rel: string | null, custom?: string): Promise<void> {
  return api.openInEditor(editor, rel, custom, false).then(() => undefined);
}

/**
 * Opens the project folder in the OS file manager, or reveals a specific file
 * inside it (`rel` + `reveal: true`).
 */
export function openInFileManager(_root: string, rel: string | null, reveal = false): Promise<void> {
  return api.openInEditor('file-manager', rel, null, reveal).then(() => undefined);
}
