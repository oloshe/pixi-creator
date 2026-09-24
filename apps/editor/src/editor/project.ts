import { componentDatabasePath } from '@pxe/schema';
import { isIgnoredPath, isInsideAssets } from './assetDatabase';
import { EditorMetadata } from '@pxe/editor-core';
import {
  assetDatabasePath,
  normalizeProjectPath,
  parseAssetDatabase,
  parseProjectConfig,
  parseSceneData,
  projectConfigFileName,
  serializeAssetDatabase,
  serializeProjectConfig,
  type AssetDatabase,
  type ProjectConfig,
  type SceneData,
} from '@pxe/schema';
import {
  BrowserProjectFile,
  deleteProjectFile as deleteBackendFile,
  HttpProjectFile,
  listProjectDir,
  readProjectText,
  renameProjectFile as renameBackendFile,
  writeProjectText as writeBackendText,
  type PickedProjectDir,
  type ProjectFile,
} from './backend';

/**
 * Project file access.
 *
 * Three paths produce the same thing — a project whose `entries` map
 * project-relative paths to a backend-neutral `ProjectFile`:
 *
 * - Local backend (`pxe web`): the CLI's `process.cwd()` is the workspace; all
 *   reads/writes and external-editor launches go through `/api/*`.
 * - File System Access API (`showDirectoryPicker`): read **and** write.
 * - `<input type="file" webkitdirectory>`: read only, so scene saves fall back to
 *   a download and `.pxe/asset-db.json` falls back to `localStorage`.
 *
 * `openProjectFromEntries` is the shared seam, which keeps the whole project
 * loading path testable and automatable without a native picker.
 */

export interface ProjectFileEntry {
  /** Project-relative path, e.g. `assets/scenes/Game.scene.json`. */
  path: string;
  file: File;
  handle: FileSystemFileHandle | null;
}

export interface OpenedProject {
  /** Picked folder name; used as the default project name. */
  rootName: string;
  /** Writable root when the project came from a directory picker. */
  directory: FileSystemDirectoryHandle | null;
  /** Absolute project root — only set when running under the local backend (`pxe web`). */
  rootPath: string | null;
  hasWriteAccess: boolean;
  config: ProjectConfig;
  configFileExists: boolean;
  entries: Map<string, ProjectFile>;
  /** Scanned asset paths (`ProjectFile.path`), unsorted. */
  assetPaths: string[];
  sourcePaths: string[];
  sourceEntries: Map<string, ProjectFile>;
  databaseFileExists: boolean;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: (options?: unknown) => Promise<FileSystemDirectoryHandle>;
}

/**
 * Picks a project using the browser-native directory picker.
 *
 * Used in every mode (including under `pxe web`): `showDirectoryPicker` with
 * `mode: 'readwrite'` when available, otherwise the `<input webkitdirectory>`
 * read-only fallback.
 */
export async function pickProject(): Promise<OpenedProject | null> {
  const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;

  if (picker) {
    const directory = await picker({ id: 'pxe-project', mode: 'readwrite' });
    return openProjectFromDirectory(directory);
  }

  return pickProjectViaInput();
}

export async function openProjectFromBackend(picked: PickedProjectDir): Promise<OpenedProject> {
  const entries = new Map<string, ProjectFile>();
  const configText = await readProjectText(picked.path, projectConfigFileName);
  const config = parseProjectConfig(configText ? parseJson(configText) : null, { name: picked.name });

  if (configText !== null) {
    entries.set(projectConfigFileName, new HttpProjectFile(projectConfigFileName));
  }

  const listed = await listProjectDir(picked.path, [config.assets, config.components]);
  for (const path of listed) {
    entries.set(path, new HttpProjectFile(path));
  }

  for (const dbPath of [assetDatabasePath, componentDatabasePath]) {
    if ((await readProjectText(picked.path, dbPath)) !== null) {
      entries.set(dbPath, new HttpProjectFile(dbPath));
    }
  }

  return assembleProject({
    rootName: picked.name,
    directory: null,
    config,
    configFileExists: configText !== null,
    entries,
    rootPath: picked.path,
  });
}

export async function openProjectFromDirectory(directory: FileSystemDirectoryHandle): Promise<OpenedProject> {
  const entries = new Map<string, ProjectFile>();
  const configEntry = await readFileEntry(directory, projectConfigFileName);
  const configText = configEntry ? await configEntry.file.text() : null;
  const config = parseProjectConfig(configText ? parseJson(configText) : null, { name: directory.name });

  if (configEntry) {
    entries.set(configEntry.path, browserProjectFile(configEntry));
  }

  for await (const entry of walkProjectDirectories(directory, config)) {
    entries.set(entry.path, browserProjectFile(entry));
  }

  const componentEntry = await readFileEntry(directory, componentDatabasePath);
  if (componentEntry) entries.set(componentEntry.path, browserProjectFile(componentEntry));
  const databaseEntry = await readFileEntry(directory, assetDatabasePath);

  if (databaseEntry) {
    entries.set(databaseEntry.path, browserProjectFile(databaseEntry));
  }

  return assembleProject({
    rootName: directory.name,
    directory,
    config,
    configFileExists: configEntry !== null,
    entries,
    rootPath: null,
  });
}

async function pickProjectViaInput(): Promise<OpenedProject | null> {
  const files = await pickDirectoryFiles();

  if (!files || files.length === 0) {
    return null;
  }

  // `webkitRelativePath` is `picked-folder/assets/textures/player.png`.
  const rootName = files[0]!.webkitRelativePath.split('/')[0] ?? 'project';
  const entries = files.map((file) => ({
    path: normalizeProjectPath(file.webkitRelativePath.replace(/^[^/]*\//, '')),
    file,
    handle: null,
  }));

  const configEntry = entries.find((entry) => entry.path === projectConfigFileName);
  const config = parseProjectConfig(
    configEntry ? parseJson(await configEntry.file.text()) : null,
    { name: rootName },
  );
  const scoped = entries.filter((entry) => isProjectEntry(entry.path, config));

  return assembleProject({
    rootName,
    directory: null,
    config,
    configFileExists: Boolean(configEntry),
    entries: new Map(scoped.map((entry) => [entry.path, browserProjectFile(entry)])),
    rootPath: null,
  });
}

export async function openProjectFromEntries(
  files: ProjectFileEntry[],
  options: { rootName?: string; directory?: FileSystemDirectoryHandle | null; config?: ProjectConfig | null } = {},
): Promise<OpenedProject> {
  const entries = new Map<string, ProjectFile>();
  for (const entry of files) {
    entries.set(normalizeProjectPath(entry.path), browserProjectFile(entry));
  }

  const configEntry = entries.get(projectConfigFileName);
  const rootName = options.rootName ?? options.directory?.name ?? 'project';
  const config = options.config
    ?? parseProjectConfig(configEntry ? parseJson(await configEntry.text()) : null, { name: rootName });
  const scoped = [...entries.entries()].filter(([path]) => isProjectEntry(path, config));

  return assembleProject({
    rootName,
    directory: options.directory ?? null,
    config,
    configFileExists: Boolean(configEntry),
    entries: new Map(scoped),
    rootPath: null,
  });
}

function browserProjectFile(entry: ProjectFileEntry): ProjectFile {
  return new BrowserProjectFile(normalizeProjectPath(entry.path), entry.file);
}

function assembleProject(input: {
  rootName: string;
  directory: FileSystemDirectoryHandle | null;
  config: ProjectConfig;
  configFileExists: boolean;
  entries: Map<string, ProjectFile>;
  rootPath: string | null;
}): OpenedProject {
  const project: OpenedProject = {
    rootName: input.rootName,
    directory: input.directory,
    rootPath: input.rootPath,
    hasWriteAccess: input.directory !== null || input.rootPath !== null,
    config: input.config,
    configFileExists: input.configFileExists,
    entries: input.entries,
    assetPaths: [],
    sourcePaths: [],
    sourceEntries: new Map(),
    databaseFileExists: false,
  };
  refreshProjectIndexes(project);
  return project;
}

function refreshProjectIndexes(project: OpenedProject): void {
  project.assetPaths = [...project.entries.keys()].filter(
    (path) => isProjectAsset(path, project.config),
  );
  project.sourceEntries = new Map([...project.entries].filter(([path]) => isProjectSource(path, project.config)));
  project.sourcePaths = [...project.sourceEntries.keys()];
  project.databaseFileExists = project.entries.has(assetDatabasePath);
}

export function isProjectAsset(path: string, config: ProjectConfig): boolean {
  return isInsideAssets(path, config.assets) && !isProjectSource(path, config);
}

export function isProjectSource(path: string, config: ProjectConfig): boolean {
  return isInsideAssets(path, config.components) && !isIgnoredPath(path, config.components);
}

function isProjectEntry(path: string, config: ProjectConfig): boolean {
  return path === projectConfigFileName || path === assetDatabasePath || path === componentDatabasePath
    || isProjectAsset(path, config) || isProjectSource(path, config);
}

async function* walkProjectDirectories(directory: FileSystemDirectoryHandle, config: ProjectConfig) {
  for (const prefix of new Set([config.assets, config.components])) {
    yield* walkDirectory(directory, prefix);
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadPreviousDatabase(project: OpenedProject): Promise<AssetDatabase> {
  const entry = project.entries.get(assetDatabasePath);

  if (entry) {
    return parseAssetDatabase(parseJson(await entry.text()));
  }

  const stored = readLocalDatabase(project);

  return stored ? parseAssetDatabase(parseJson(stored)) : parseAssetDatabase(null);
}

export async function readEntryText(project: OpenedProject, path: string): Promise<string | null> {
  const entry = project.entries.get(normalizeProjectPath(path));
  return entry ? entry.text() : null;
}

/**
 * Reads a project file across all backends: the local backend first, then the
 * in-memory entries (`webkitdirectory`), then a direct File System Access read
 * for directory-picked projects.
 */
export async function readProjectFileText(project: OpenedProject, path: string): Promise<string | null> {
  const normalized = normalizeProjectPath(path);

  if (project.rootPath) {
    return readProjectText(project.rootPath, normalized);
  }

  const entry = project.entries.get(normalized);

  if (entry) {
    return entry.text();
  }

  if (project.directory) {
    const handle = await resolveFile(project.directory, normalized);
    if (handle) return (await handle.getFile()).text();
  }

  return null;
}

/**
 * Re-reads the assets/sources from disk.
 *
 * Projects opened through the `<input>` fallback keep the file list they were
 * given, so a rescan only re-runs the reconcile step for them.
 */
export async function rescanProjectAssets(project: OpenedProject): Promise<void> {
  if (project.rootPath) {
    const listed = await listProjectDir(project.rootPath, [project.config.assets, project.config.components]);
    for (const path of [...project.entries.keys()]) {
      if (isProjectAsset(path, project.config) || isProjectSource(path, project.config)) {
        project.entries.delete(path);
      }
    }
    for (const path of listed) {
      project.entries.set(path, new HttpProjectFile(path));
    }
    refreshProjectIndexes(project);
    return;
  }

  if (!project.directory) {
    return;
  }

  for (const path of [...project.entries.keys()]) {
    if (isProjectAsset(path, project.config) || isProjectSource(path, project.config)) {
      project.entries.delete(path);
    }
  }

  for await (const entry of walkProjectDirectories(project.directory, project.config)) {
    project.entries.set(entry.path, browserProjectFile(entry));
  }

  refreshProjectIndexes(project);
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

export type WriteResult = 'written' | 'downloaded' | 'local' | 'failed';

/** Writes `pxe.config.json` when the project does not have one yet. */
export async function ensureProjectScaffold(project: OpenedProject): Promise<boolean> {
  if (!project.hasWriteAccess) {
    return false;
  }

  let wrote = false;

  if (!project.configFileExists) {
    wrote = (await writeProjectText(project, projectConfigFileName, serializeProjectConfig(project.config))) === 'written';
  }

  return wrote;
}

export async function writeAssetDatabase(project: OpenedProject, database: AssetDatabase): Promise<WriteResult> {
  const text = serializeAssetDatabase(database);

  if (project.hasWriteAccess) {
    return writeProjectText(project, assetDatabasePath, text);
  }

  try {
    window.localStorage.setItem(localDatabaseKey(project), text);
    return 'local';
  } catch {
    return 'failed';
  }
}

export async function writeProjectText(project: OpenedProject, path: string, text: string): Promise<WriteResult> {
  const normalized = normalizeProjectPath(path);

  if (project.rootPath) {
    try {
      await writeBackendText(project.rootPath, normalized, text);
      return 'written';
    } catch {
      return 'failed';
    }
  }

  if (!project.directory) {
    download(projectPathName(normalized), text, 'application/json');
    return 'downloaded';
  }

  try {
    await writeDirectoryFile(project.directory, normalized, text);
    return 'written';
  } catch {
    return 'failed';
  }
}

export function rememberEntry(project: OpenedProject, path: string, text: string, type: string): void {
  const normalized = normalizeProjectPath(path);
  const file: ProjectFile = project.rootPath
    ? new HttpProjectFile(normalized)
    : new BrowserProjectFile(normalized, new File([text], projectPathName(normalized), { type }));

  project.entries.set(normalized, file);
  refreshProjectIndexes(project);
}

export async function renameProjectFile(project: OpenedProject, from: string, to: string): Promise<WriteResult> {
  const fromPath = normalizeProjectPath(from);
  const toPath = normalizeProjectPath(to);

  if (project.rootPath) {
    try {
      await renameBackendFile(project.rootPath, fromPath, toPath);
      project.entries.delete(fromPath);
      project.entries.set(toPath, new HttpProjectFile(toPath));
      refreshProjectIndexes(project);
      return 'written';
    } catch {
      return 'failed';
    }
  }

  if (!project.directory) {
    return 'downloaded';
  }

  const entry = project.entries.get(fromPath);
  if (!entry) {
    return 'failed';
  }

  const text = await entry.text();
  const result = await writeProjectText(project, toPath, text ?? '');
  if (result !== 'written') {
    return result;
  }

  try {
    await removeFile(project.directory, fromPath);
  } catch {
    return 'failed';
  }

  project.entries.delete(fromPath);
  rememberEntry(project, toPath, text ?? '', 'text/plain');
  return 'written';
}

export async function deleteProjectFile(project: OpenedProject, path: string): Promise<WriteResult> {
  const normalized = normalizeProjectPath(path);

  if (project.rootPath) {
    try {
      await deleteBackendFile(project.rootPath, normalized);
      project.entries.delete(normalized);
      refreshProjectIndexes(project);
      return 'written';
    } catch {
      return 'failed';
    }
  }

  if (!project.directory) {
    return 'downloaded';
  }

  try {
    await removeFile(project.directory, normalized);
  } catch {
    return 'failed';
  }

  project.entries.delete(normalized);
  refreshProjectIndexes(project);
  return 'written';
}

/* -------------------------------------------------------------------------- */
/* Scenes                                                                      */
/* -------------------------------------------------------------------------- */

export interface SceneBundle {
  data: SceneData;
  meta: EditorMetadata;
  warnings: string[];
}

export function sceneEditorPath(scenePath: string): string {
  return /\.scene\.json$/i.test(scenePath)
    ? scenePath.replace(/\.scene\.json$/i, '.scene.editor.json')
    : scenePath.replace(/\.json$/i, '.editor.json');
}

export async function readSceneBundle(project: OpenedProject, scenePath: string): Promise<SceneBundle | null> {
  const text = await readEntryText(project, scenePath);

  if (text === null) {
    return null;
  }

  const metaText = await readEntryText(project, sceneEditorPath(scenePath));
  const warnings: string[] = [];
  const data = parseSceneData(parseJson(text), undefined, (message) => warnings.push(message));
  const meta = metaText ? EditorMetadata.parse(parseJson(metaText)) : new EditorMetadata();

  return { data, meta: meta.clone(), warnings };
}

export async function writeSceneBundle(
  project: OpenedProject,
  scenePath: string,
  data: SceneData,
  meta: EditorMetadata,
): Promise<WriteResult> {
  const sceneText = `${JSON.stringify(parseSceneData(data), null, 2)}\n`;
  const metaPath = sceneEditorPath(scenePath);
  const sceneResult = await writeProjectText(project, scenePath, sceneText);
  const metaResult = await writeProjectText(project, metaPath, meta.serialize());

  rememberEntry(project, scenePath, sceneText, 'application/json');
  rememberEntry(project, metaPath, meta.serialize(), 'application/json');

  return sceneResult === 'written' && metaResult === 'written' ? 'written' : 'downloaded';
}

/* -------------------------------------------------------------------------- */
/* Browser plumbing                                                            */
/* -------------------------------------------------------------------------- */

async function pickDirectoryFiles(): Promise<File[] | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.setAttribute('directory', '');

  return new Promise<File[] | null>((resolve) => {
    input.onchange = () => resolve(input.files ? [...input.files] : null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function* walkDirectory(
  root: FileSystemDirectoryHandle,
  prefix: string,
): AsyncGenerator<ProjectFileEntry> {
  const directory = prefix ? await resolveDirectory(root, prefix) : root;

  if (!directory) {
    return;
  }

  const iterable = directory as unknown as { entries?: () => AsyncIterableIterator<[string, FileSystemHandle]> };

  if (typeof iterable.entries !== 'function') {
    return;
  }

  for await (const [name, handle] of iterable.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory' && isIgnoredPath(path)) continue;

    if (handle.kind === 'directory') {
      yield* walkDirectory(root, path);
      continue;
    }

    const fileHandle = handle as FileSystemFileHandle;
    yield { path, file: await fileHandle.getFile(), handle: fileHandle };
  }
}

async function readFileEntry(root: FileSystemDirectoryHandle, path: string): Promise<ProjectFileEntry | null> {
  const handle = await resolveFile(root, normalizeProjectPath(path));

  if (!handle) {
    return null;
  }

  return { path: normalizeProjectPath(path), file: await handle.getFile(), handle };
}

async function resolveDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;

  for (const segment of normalizeProjectPath(path).split('/')) {
    if (!segment) {
      continue;
    }

    try {
      current = await current.getDirectoryHandle(segment);
    } catch {
      return null;
    }
  }

  return current;
}

async function resolveFile(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle | null> {
  const segments = path.split('/');
  const name = segments.pop();

  if (!name) {
    return null;
  }

  const directory = await resolveDirectory(root, segments.join('/'));

  if (!directory) {
    return null;
  }

  try {
    return await directory.getFileHandle(name);
  } catch {
    return null;
  }
}

async function removeFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const handle = await resolveFile(root, normalizeProjectPath(path));

  if (!handle) {
    throw new Error(`File not found: ${path}`);
  }

  const removable = handle as FileSystemFileHandle & { remove?: () => Promise<void> };

  if (typeof removable.remove !== 'function') {
    throw new Error('remove() is not supported by this browser');
  }

  await removable.remove();
}

async function writeDirectoryFile(root: FileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  const segments = normalizeProjectPath(path).split('/');
  const name = segments.pop()!;
  let directory = root;

  for (const segment of segments) {
    if (segment) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
  }

  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function localDatabaseKey(project: OpenedProject): string {
  return `pxe:asset-db:${project.rootName}`;
}

function readLocalDatabase(project: OpenedProject): string | null {
  try {
    return window.localStorage.getItem(localDatabaseKey(project));
  } catch {
    return null;
  }
}

function download(name: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function projectPathName(path: string): string {
  const segments = normalizeProjectPath(path).split('/');
  return segments[segments.length - 1] ?? 'file.json';
}

function parseJson(text: string | null): unknown {
  try {
    return JSON.parse(text as string) as unknown;
  } catch {
    return null;
  }
}
