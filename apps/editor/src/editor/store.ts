import { createComponentManifest, type EditorComponentManifestItem } from './componentManifest';
import { buildAssetManifest } from './assetDatabase';
import { createEmbedSnippet, downloadJSON } from './exportScene';
import {
  AddComponentCommand,
  AddNodeCommand,
  BatchCommand,
  createCanvasNode,
  createDefaultEditorSceneMeta,
  DeleteNodeCommand,
  DuplicateNodeCommand,
  duplicateNodeData,
  EditorMetadata,
  findComponent,
  findNode,
  RemoveComponentCommand,
  SceneDocument,
  sceneFileName,
  SetComponentPropertyCommand,
  SetNodePropertyCommand,
  SetSceneSettingsCommand,
} from '@pxe/editor-core';
import type { EditorCameraState, EditorNodeMeta, EditorViewPreferences, SelectionState } from '@pxe/editor-core';
import {
  assetDatabasePath,
  createDefaultSceneSettings,
  createId,
  projectConfigFileName,
  parseSceneData,
  projectPathJoin,
  type AssetManifest,
  type ComponentData,
  type NodeData,
  type SceneData,
  type SceneSettings,
} from '@pxe/schema';
import { create } from 'zustand';
import { LOCALE_STORAGE_KEY, readStoredLocale, type Locale } from '../i18n/translate';
import { computeDevicePreview, getDevicePreset, type DevicePreset } from './devicePreview';
import { componentTemplate, scriptIdentifiers } from './componentTemplate';
import { contentBounds, nodeBounds } from './previewLayout';
import {
  deleteProjectFile,
  ensureProjectScaffold,
  openProjectFromBackend,
  openProjectFromDirectory,
  openProjectFromEntries,
  pickProject,
  readProjectFileText,
  readSceneBundle,
  rememberEntry,
  renameProjectFile,
  writeProjectText,
  writeSceneBundle,
  type OpenedProject,
  type ProjectFileEntry,
} from './project';
import { currentWorkspace, openInEditor, openInFileManager } from './backend';
import { readCustomCommand, readDefaultEditor, writeCustomCommand, writeDefaultEditor, type EditorId } from './editorSettings';
import { editorDeepLink, hasEditorScheme, joinAbsolute, triggerDeepLink } from './externalOpen';
import {
  clampPanelWidth,
  defaultEditorWorkspaceSettings,
  editorSettingsPath,
  parseEditorWorkspaceSettings,
  readCachedWorkspaceSettings,
  serializeEditorWorkspaceSettings,
  writeCachedWorkspaceSettings,
} from './workspaceSettings';
import { runtimeTypeDeclarations, typeStubPath } from './typeStub';
import { ProjectSession, type ProjectAsset } from './projectSession';
import {
  clampZoom,
  deviceRectOfDesignRect,
  frameRect,
  nextZoom,
  panCamera,
  zoomAt,
  type Rect,
  type ViewportSize,
} from './viewport';

export type EditorTool = 'select' | 'move' | 'rotate' | 'scale' | 'pivot';

export interface DeviceCustomSize {
  width: number;
  height: number;
}

/** Plain mirror of the opened project, safe to keep in the React store. */
export interface ProjectInfo {
  name: string;
  /** Picked folder name (`demo-project`). */
  rootName: string;
  assetsDir: string;
  /** False when the project was opened through the `<input>` fallback. */
  hasWriteAccess: boolean;
  databasePath: string;
  configPath: string;
}

const emptyManifest: AssetManifest = { schemaVersion: 2, assets: [], scenePreloads: {} };

/**
 * The open project owns file handles and object URLs, so it lives outside the
 * React store; the store keeps a plain, serialisable mirror of it.
 */
let session: ProjectSession | null = null;

export function activeSession(): ProjectSession | null {
  return session;
}

interface EditorState {
  project: ProjectInfo | null;
  document: SceneDocument | null;
  /** Project-relative path of the open scene; `null` for an unsaved scene. */
  scenePath: string | null;
  assets: ProjectAsset[];
  assetManifest: AssetManifest;
  componentManifest: EditorComponentManifestItem[];
  meta: EditorMetadata;
  activeTool: EditorTool;
  selection: SelectionState;
  sceneSelected: boolean;
  revision: number;
  status: string;
  playState: 'stopped' | 'playing' | 'paused';
  camera: EditorCameraState;
  viewportSize: ViewportSize;
  deviceId: string;
  customDevice: DeviceCustomSize;
  /** Keeps re-framing the artboard on resize until the user moves the camera. */
  autoFit: boolean;
  busy: boolean;
  /** UI language; `zh-CN` is the default. */
  locale: Locale;
  /** Node held by the "Copy" action, pasted as a child via "Paste as child". */
  clipboard: NodeData | null;
  /** Whole component held by "Copy Component", pasted via "Paste Component". */
  componentClipboard: ComponentData | null;
  /** Component property values held by "Copy Component Value". */
  componentValueClipboard: { type: string; props: Record<string, unknown> } | null;
  /** External editor used by double-click / right-click on project components. */
  defaultEditor: EditorId;
  /** Custom launch command template (`{file}` placeholder) when editor is "custom". */
  customEditorCommand: string;
  /** Sidebar widths, persisted to `.pxe/editor-settings.json` per project. */
  leftPanelWidth: number;
  rightPanelWidth: number;

  openProject(): Promise<void>;
  openProjectAt(entries: ProjectFileEntry[], rootName?: string): Promise<void>;
  openProjectFromHandle(directory: FileSystemDirectoryHandle): Promise<void>;
  /** Auto-opens the backend's current workspace on startup (no picker). */
  openCurrentWorkspace(): Promise<void>;
  closeProject(): void;
  openScene(scenePath: string): Promise<void>;
  newScene(): void;
  openSceneJSON(): Promise<void>;
  saveScene(): Promise<void>;
  exportScene(): void;
  copyEmbedSnippet(): Promise<void>;
  refreshAssets(): Promise<void>;
  createScript(name: string): Promise<void>;

  setPlayState(state: 'stopped' | 'playing' | 'paused'): Promise<void>;
  setLocale(locale: Locale): void;
  setDocument(data: SceneData, meta?: EditorMetadata): void;
  setMeta(meta: EditorMetadata): void;
  setTool(tool: EditorTool): void;
  selectNode(nodeId: string | null): void;
  selectScene(): void;
  copyNode(nodeId?: string | null): void;
  pasteNode(parentId?: string | null): void;
  copyComponent(componentId: string | null): void;
  pasteComponent(nodeId?: string | null): void;
  copyComponentValue(componentId: string | null): void;
  pasteComponentValue(componentId: string | null): void;
  renameNode(nodeId: string, name: string): void;
  duplicateNode(nodeId?: string | null): void;
  deleteNode(nodeId?: string | null): void;
  refreshFromDocument(status?: string): void;
  setStatus(status: string): void;
  setViewportSize(size: ViewportSize): void;
  setCamera(camera: EditorCameraState): void;
  pan(dx: number, dy: number): void;
  zoomAtPoint(anchor: { x: number; y: number }, factor: number): void;
  zoomStep(direction: 1 | -1): void;
  setZoom(zoom: number): void;
  fitCanvas(): void;
  frameAll(): void;
  frameSelection(): void;
  updateView(patch: Partial<EditorViewPreferences>): void;
  updateSceneSettings(patch: Partial<SceneSettings>): void;
  updateNodeMeta(nodeId: string, patch: Partial<EditorNodeMeta>): void;
  setComponentCollapsed(componentId: string, collapsed: boolean): void;
  setDevice(deviceId: string, custom?: Partial<DeviceCustomSize>): void;

  setDefaultEditor(editor: EditorId): void;
  setCustomEditorCommand(command: string): void;
  setPanelWidth(side: 'left' | 'right', width: number): void;
  persistPanelWidths(): Promise<void>;
  renameComponentScript(type: string, name: string): Promise<void>;
  deleteComponentScript(type: string): Promise<void>;
  openComponentInEditor(type: string): Promise<void>;
  /** Opens the project folder (or `rel` file) in `editor`. */
  openProjectWith(editor: EditorId): Promise<void>;
  /** Opens the project folder in the OS file manager. */
  openProjectInFileManager(): Promise<void>;
  /** Reveals a project-relative file in the OS file manager. */
  revealInFileManager(rel: string): Promise<void>;
  generateTypeDefinitions(): Promise<void>;
}

export const useEditorStore = create<EditorState>((set, get) => {
  /** Adopts an assembled project: scan assets, reconcile ids, pick a start scene. */
  async function adoptProject(opened: OpenedProject): Promise<void> {
    session?.dispose();
    session = null;

    const next = await ProjectSession.open(opened);
    session = next;

    // Project-level UI prefs (sidebar widths): the project file wins over the
    // per-project localStorage fallback, which wins over the defaults.
    let panel = readCachedWorkspaceSettings(opened.rootName);
    try {
      const settingsText = await readProjectFileText(opened, editorSettingsPath);
      if (settingsText) panel = parseEditorWorkspaceSettings(JSON.parse(settingsText));
    } catch {
      /* Corrupt settings file → keep the cached/default values. */
    }

    set({
      project: {
        name: next.name,
        rootName: opened.rootName,
        assetsDir: next.config.assets,
        hasWriteAccess: next.hasWriteAccess,
        databasePath: assetDatabasePath,
        configPath: projectConfigFileName,
      },
      assets: next.assets,
      assetManifest: next.manifest,
      componentManifest: createComponentManifest(next.componentManifest),
      document: null,
      scenePath: null,
      selection: { nodeIds: [], primaryNodeId: null },
      sceneSelected: false,
      revision: 0,
      playState: 'stopped',
      status: `Opened project ${next.name} · ${next.assets.length} asset(s)`,
      leftPanelWidth: panel.leftPanelWidth,
      rightPanelWidth: panel.rightPanelWidth,
    });

    // Scaffolds `pxe.config.json` when the picked folder does not have one yet.
    await ensureProjectScaffold(opened);

    const preferred = next.config.startScene ? next.assetByPath(next.config.startScene) : null;
    const startScene = preferred ?? next.assets.find((asset) => asset.type === 'scene') ?? null;

    if (startScene) {
      await get().openScene(startScene.path);
    } else {
      set({ status: `Project ${next.name} has no scene yet — create one to start` });
    }
    if (next.componentWarnings.length) set({ status: `${get().status} · ${next.componentWarnings.join('; ')}` });
  }

  /**
   * Opens a project-relative file (`rel`) or the project folder (`rel` null)
   * in an external editor. Prefers a browser deep link for VS Code/Zed (which
   * only needs the absolute workspace path), falls back to the backend spawn,
   * and finally downloads the file in pure-browser mode.
   */
  async function openExternalPath(rel: string | null, editor: EditorId): Promise<void> {
    const project = session?.project ?? null;

    if (!project) {
      set({ status: 'Open a project first' });
      return;
    }

    const root = project.rootPath;
    const label = rel ?? project.rootName;

    // Browser deep link (scheme) — synchronous so it stays within the click.
    if (root && hasEditorScheme(editor)) {
      const absolute = rel ? joinAbsolute(root, rel) : root;
      const href = editorDeepLink(editor, absolute, rel === null);
      if (href) {
        triggerDeepLink(href);
        set({ status: `Opening ${label} in external editor` });
        return;
      }
    }

    // Backend spawn — the only path for Sublime / Notepad / custom commands.
    if (root) {
      try {
        await openInEditor(editor, root, rel, get().customEditorCommand || undefined);
        set({ status: `Opening ${label} in external editor` });
      } catch (error) {
        set({ status: `Open failed: ${String(error)}` });
      }
      return;
    }

    // Pure browser without an absolute path: the best we can do for a file is
    // download it; folders cannot be handed to an external tool.
    if (rel) {
      const entry = project.entries.get(rel);
      const text = entry ? await entry.text() : null;
      if (text === null || text === undefined) {
        set({ status: 'Open failed: source not found' });
        return;
      }
      const name = rel.split('/').pop() ?? 'component.ts';
      const blob = new Blob([text], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
      set({ status: `Downloaded ${rel} — run pxe web to open it in ${editor}` });
      return;
    }

    set({ status: 'Open the project via pxe web to launch external editors or the file manager' });
  }

  return {
    project: null,
    document: null,
    scenePath: null,
    assets: [],
    assetManifest: emptyManifest,
    componentManifest: createComponentManifest(),
    meta: new EditorMetadata(),
    activeTool: 'select',
    selection: { nodeIds: [], primaryNodeId: null },
    sceneSelected: false,
    revision: 0,
    status: 'Create or open a scene, or choose a project workspace',
    playState: 'stopped',
    camera: { x: 0, y: 0, zoom: 1 },
    viewportSize: { width: 1280, height: 720 },
    deviceId: 'design',
    customDevice: { width: 390, height: 844 },
    autoFit: true,
    busy: false,
    locale: readStoredLocale(),
    clipboard: null,
    componentClipboard: null,
    componentValueClipboard: null,
    defaultEditor: readDefaultEditor(),
    customEditorCommand: readCustomCommand(),
    leftPanelWidth: defaultEditorWorkspaceSettings.leftPanelWidth,
    rightPanelWidth: defaultEditorWorkspaceSettings.rightPanelWidth,

    async openProject() {
      // Always use the browser-native directory picker (File System Access
      // API). Under `pxe web` the auto-opened workspace stays Node-backed via
      // `openCurrentWorkspace()`; a picked folder is read/written through the
      // browser handle the picker returns.
      try {
        set({ busy: true });
        const opened = await pickProject();

        if (opened) {
          await adoptProject(opened);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          set({ status: `Open project failed: ${String(error)}` });
        }
      } finally {
        set({ busy: false });
      }
    },

    async openCurrentWorkspace() {
      set({ busy: true });

      try {
        const picked = await currentWorkspace();
        await adoptProject(await openProjectFromBackend(picked));
      } catch (error) {
        set({ status: `Open project failed: ${String(error)}` });
      } finally {
        set({ busy: false });
      }
    },

    async openProjectAt(entries, rootName) {
      set({ busy: true });

      try {
        await adoptProject(await openProjectFromEntries(entries, { rootName }));
      } catch (error) {
        set({ status: `Open project failed: ${String(error)}` });
      } finally {
        set({ busy: false });
      }
    },

    async openProjectFromHandle(directory) {
      set({ busy: true });

      try {
        await adoptProject(await openProjectFromDirectory(directory));
      } catch (error) {
        set({ status: `Open project failed: ${String(error)}` });
      } finally {
        set({ busy: false });
      }
    },

    closeProject() {
      session?.dispose();
      session = null;
      set({
        project: null,
        document: null,
        scenePath: null,
        assets: [],
        assetManifest: emptyManifest,
        componentManifest: createComponentManifest(),
        playState: 'stopped',
        status: 'Project closed',
        leftPanelWidth: defaultEditorWorkspaceSettings.leftPanelWidth,
        rightPanelWidth: defaultEditorWorkspaceSettings.rightPanelWidth,
      });
    },

    async openScene(scenePath) {
      if (!session) {
        return;
      }

      try {
        const bundle = await readSceneBundle(session.project, scenePath);

        if (!bundle) {
          set({ status: `Scene not found: ${scenePath}` });
          return;
        }

        get().setDocument(bundle.data, bundle.meta);
        set({ scenePath, autoFit: true });
        if (bundle.warnings.length) set({ status: `${get().status} · ${bundle.warnings.join('; ')}` });
      } catch (error) {
        set({ status: `Open scene failed: ${String(error)}` });
      }
    },

    async openSceneJSON() {
      const input = window.document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      const file = await new Promise<File | undefined>((resolve) => {
        input.onchange = () => resolve(input.files?.[0]);
        input.oncancel = () => resolve(undefined);
        input.click();
      });
      if (!file) return;
      try {
        const warnings: string[] = [];
        const data = parseSceneData(JSON.parse(await file.text()), undefined, (message) => warnings.push(message));
        get().closeProject();
        get().setDocument(data);
        if (warnings.length) set({ status: `${get().status} · ${warnings.join('; ')}` });
      } catch (error) { set({ status: `Open scene failed: ${String(error)}` }); }
    },

    newScene() {
      const settings = createDefaultSceneSettings({ backgroundColor: '#1e1e1e' });
      get().setDocument({
        schemaVersion: 3,
        id: createId('scene'),
        name: 'Untitled',
        settings,
        root: createCanvasNode(settings, { id: createId('node') }),
      }, new EditorMetadata(createDefaultEditorSceneMeta()));
      set({ scenePath: null, autoFit: true, status: session ? 'New scene — save it into assets/scenes/' : 'New scene — export JSON to embed it in a page' });
    },

    async saveScene() {
      const state = get();
      const document = state.document;

      if (!document) {
        return;
      }

      if (!session) {
        downloadJSON('scene.json', document.serialize());
        document.markSaved();
        set({ status: 'Downloaded scene.json', revision: document.version });
        return;
      }

      const name = document.data.name || 'Scene';
      const path = state.scenePath
        ?? projectPathJoin(session.config.assets, 'scenes', sceneFileName(name));

      try {
        const result = await writeSceneBundle(session.project, path, document.serialize(), state.meta);
        document.markSaved();
        session.addKnownPath(path);
        set({ scenePath: path });
        await get().refreshAssets();
        set({
          status: result === 'written'
            ? `Saved ${path} + editor metadata`
            : `Downloaded ${path.split('/').pop()} + editor metadata (read-only project)`,
        });
      } catch (error) {
        set({ status: `Save failed: ${String(error)}` });
      }
    },

    exportScene() {
      const document = get().document;
      if (!document) return;
      downloadJSON('scene.json', document.serialize());
      set({ status: 'Exported scene.json · Copy embed snippet and place assets/ + pxe-player.js beside it' });
    },

    async copyEmbedSnippet() {
      const document = get().document;
      if (!document) return;
      const assets = session ? buildAssetManifest(session.database, (record) => record.path) : emptyManifest;
      try {
        await navigator.clipboard.writeText(createEmbedSnippet(document.serialize(), assets, session?.componentModules));
        set({ status: 'Embed snippet copied · Place scene.json, assets/ and pxe-player.js beside your HTML' });
      } catch (error) { set({ status: `Clipboard failed: ${String(error)}` }); }
    },

    async refreshAssets() {
      if (!session) {
        return;
      }

      const current = session;
      const summary = await current.rescan();
      if (session !== current) return;
      set({
        assets: session.assets,
        assetManifest: session.manifest,
        componentManifest: createComponentManifest(session.componentManifest),
        status: `Assets: ${summary.total} (${summary.added} new, ${summary.removed} removed, ${summary.ignored} ignored) · ${summary.persisted}${session.componentWarnings.length ? ` · ${session.componentWarnings.join("; ")}` : ""}`,
      });
    },

    setLocale(locale) {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        /* Persisting the language is best-effort. */
      }
      set({ locale });
    },

    setDefaultEditor(editor) {
      writeDefaultEditor(editor);
      set({ defaultEditor: editor });
    },

    setCustomEditorCommand(command) {
      writeCustomCommand(command);
      set({ customEditorCommand: command });
    },

    setPanelWidth(side, width) {
      const clamped = clampPanelWidth(width);
      set(side === 'left' ? { leftPanelWidth: clamped } : { rightPanelWidth: clamped });
    },

    async persistPanelWidths() {
      const project = session?.project;

      if (!project) {
        return;
      }

      const settings = {
        leftPanelWidth: get().leftPanelWidth,
        rightPanelWidth: get().rightPanelWidth,
      };

      if (project.hasWriteAccess) {
        try {
          await writeProjectText(project, editorSettingsPath, serializeEditorWorkspaceSettings(settings));
        } catch {
          /* Best-effort. */
        }
      } else {
        writeCachedWorkspaceSettings(project.rootName, settings);
      }
    },

    async createScript(name) {
      if (!session) {
        set({ status: 'Create a script inside an open project (File → Open Project)' });
        return;
      }

      const { fileName, type } = scriptIdentifiers(name);
      const className = fileName.replace(/\.ts$/i, '');
      const path = projectPathJoin(session.config.components, 'components', fileName);
      const text = componentTemplate(type, className);

      try {
        const result = await writeProjectText(session.project, path, text);

        if (result === 'downloaded') {
          set({ status: `Read-only project — downloaded ${fileName}` });
          return;
        }

        if (result === 'failed') {
          set({ status: `Create script failed: could not write ${path}` });
          return;
        }

        rememberEntry(session.project, path, text, 'text/typescript');
        await get().refreshAssets();
        set({ status: `Created ${path} — the component is now in the palette` });
      } catch (error) {
        set({ status: `Create script failed: ${String(error)}` });
      }
    },

    async renameComponentScript(type, name) {
      const item = get().componentManifest.find((definition) => definition.type === type);
      if (!item?.sourcePath || !session) {
        set({ status: 'Rename failed: project component has no source file' });
        return;
      }
      if (!session.project.hasWriteAccess) {
        set({ status: 'Read-only project — cannot rename files' });
        return;
      }

      const sourcePath = item.sourcePath;
      const { fileName } = scriptIdentifiers(name);
      const directory = sourcePath.split('/').slice(0, -1).join('/');
      const newPath = directory ? `${directory}/${fileName}` : fileName;

      if (newPath === sourcePath) {
        set({ status: 'Rename skipped: file name unchanged' });
        return;
      }

      const sidecar = sourcePath.replace(/\.ts$/i, '.component.json');

      try {
        const result = await renameProjectFile(session.project, sourcePath, newPath);
        if (result !== 'written') {
          set({ status: `Rename failed: ${result}` });
          return;
        }
        if (session.project.entries.has(sidecar)) {
          await renameProjectFile(session.project, sidecar, newPath.replace(/\.ts$/i, '.component.json'));
        }
        await get().refreshAssets();
        set({ status: `Renamed ${sourcePath} → ${newPath}` });
      } catch (error) {
        set({ status: `Rename failed: ${String(error)}` });
      }
    },

    async deleteComponentScript(type) {
      const item = get().componentManifest.find((definition) => definition.type === type);
      if (!item?.sourcePath || !session) {
        set({ status: 'Delete failed: project component has no source file' });
        return;
      }
      if (!session.project.hasWriteAccess) {
        set({ status: 'Read-only project — cannot delete files' });
        return;
      }

      const sourcePath = item.sourcePath;
      const sidecar = sourcePath.replace(/\.ts$/i, '.component.json');

      try {
        const result = await deleteProjectFile(session.project, sourcePath);
        if (result !== 'written') {
          set({ status: `Delete failed: ${result}` });
          return;
        }
        if (session.project.entries.has(sidecar)) {
          await deleteProjectFile(session.project, sidecar);
        }
        await get().refreshAssets();
        set({ status: `Deleted ${sourcePath} — component data on nodes is preserved` });
      } catch (error) {
        set({ status: `Delete failed: ${String(error)}` });
      }
    },

    async openComponentInEditor(type) {
      // Resolve the source directory from component-db.json (the component
      // manifest), then open that exact file. Fall back to the project folder
      // when the component has no source path on record.
      const sourcePath = get().componentManifest.find((definition) => definition.type === type)?.sourcePath ?? null;

      if (!sourcePath) {
        await get().openProjectWith(get().defaultEditor);
        return;
      }

      await openExternalPath(sourcePath, get().defaultEditor);
    },

    async openProjectWith(editor) {
      await openExternalPath(null, editor);
    },

    async openProjectInFileManager() {
      const project = session?.project ?? null;

      if (!project) {
        set({ status: 'Open a project first' });
        return;
      }

      if (!project.rootPath) {
        set({ status: 'Open the project via pxe web to use the file manager' });
        return;
      }

      try {
        await openInFileManager(project.rootPath, null);
        set({ status: `Opened ${project.rootName} in the file manager` });
      } catch (error) {
        set({ status: `Open failed: ${String(error)}` });
      }
    },

    async revealInFileManager(rel) {
      const project = session?.project ?? null;

      if (!project) {
        set({ status: 'Open a project first' });
        return;
      }

      if (!project.rootPath) {
        set({ status: 'Open the project via pxe web to use the file manager' });
        return;
      }

      try {
        await openInFileManager(project.rootPath, rel, true);
        set({ status: `Revealed ${rel} in the file manager` });
      } catch (error) {
        set({ status: `Open failed: ${String(error)}` });
      }
    },

    async generateTypeDefinitions() {
      if (!session) {
        set({ status: 'Generate type definitions inside an open project' });
        return;
      }
      if (!session.project.hasWriteAccess) {
        set({ status: 'Read-only project — cannot write type definitions' });
        return;
      }

      const text = runtimeTypeDeclarations();
      try {
        const result = await writeProjectText(session.project, typeStubPath, text);
        if (result === 'written') {
          rememberEntry(session.project, typeStubPath, text, 'text/plain');
          set({ status: `Generated ${typeStubPath}` });
        } else {
          set({ status: `Generate type definitions failed: ${result}` });
        }
      } catch (error) {
        set({ status: `Generate type definitions failed: ${String(error)}` });
      }
    },

    async setPlayState(playState) {
      if (playState === 'playing' && get().playState === 'stopped' && session) {
        const current = session;
        set({ busy: true });
        try { await get().refreshAssets(); }
        catch (error) { set({ status: `Reload components failed: ${String(error)}` }); return; }
        finally { set({ busy: false }); }
        if (session !== current) return;
      }
      set({ playState });
    },

    setDocument(data, meta) {
      const document = new SceneDocument(data);
      const nextMeta = meta ?? new EditorMetadata();
      nextMeta.prune(collectNodeIds(data.root), collectComponentIds(data.root));
      set({
        document,
        meta: nextMeta,
        selection: document.selection.value,
        sceneSelected: false,
        revision: document.version,
        camera: { ...nextMeta.camera },
        deviceId: nextMeta.view.devicePreviewId,
        status: `Opened ${data.name}${document.rootNormalized ? ' · Root transform normalized' : ''}`,
      });
    },

    setMeta(meta) { set({ meta }); },

    setTool(tool) { set({ activeTool: tool }); },

    selectNode(nodeId) {
      const document = get().document;

      if (!document) {
        return;
      }

      document.selectNode(nodeId);
      get().meta.setSelection(nodeId);
      set({ selection: document.selection.value, sceneSelected: false, revision: document.version });
    },

    selectScene() {
      const document = get().document;

      if (!document) {
        return;
      }

      document.selectNode(null);
      get().meta.setSelection(null);
      set({ selection: document.selection.value, sceneSelected: true, revision: document.version });
    },

    copyNode(nodeId) {
      const document = get().document;
      const id = nodeId ?? get().selection.primaryNodeId;

      if (!document || !id || id === document.data.root.id) {
        return;
      }

      const node = findNode(document.data.root, id)?.node;

      if (!node) {
        return;
      }

      set({ clipboard: duplicateNodeData(node), status: `Copied ${node.name}` });
    },

    pasteNode(parentId) {
      const document = get().document;
      const clipboard = get().clipboard;

      if (!document || !clipboard) {
        return;
      }

      // Pasted children always land under a real node; the scene root is the
      // fallback when nothing is selected.
      const parent = parentId ?? get().selection.primaryNodeId ?? document.data.root.id;
      const clone = duplicateNodeData(clipboard);
      document.execute(new AddNodeCommand(document.data.root, parent, clone));
      document.selectNode(clone.id);
      get().refreshFromDocument('Node pasted');
    },

    copyComponent(componentId) {
      const document = get().document;

      if (!document || !componentId) {
        return;
      }

      const component = findComponent(document.data.root, componentId)?.component;

      if (!component) {
        return;
      }

      set({ componentClipboard: structuredClone(component), status: `Copied component ${component.type}` });
    },

    pasteComponent(nodeId) {
      const document = get().document;
      const clipboard = get().componentClipboard;
      const id = nodeId ?? get().selection.primaryNodeId;

      if (!document || !clipboard || !id) {
        return;
      }

      const node = findNode(document.data.root, id)?.node;

      if (!node) {
        return;
      }

      if (clipboard.type.startsWith('engine.') && node.components.some((component) => component.type === clipboard.type)) {
        set({ status: `Component ${clipboard.type} already exists on this node` });
        return;
      }

      const clone = structuredClone(clipboard);
      clone.id = createId('component');
      document.execute(new AddComponentCommand(document.data.root, id, clone));
      get().refreshFromDocument('Component pasted');
    },

    copyComponentValue(componentId) {
      const document = get().document;

      if (!document || !componentId) {
        return;
      }

      const component = findComponent(document.data.root, componentId)?.component;

      if (!component) {
        return;
      }

      set({
        componentValueClipboard: { type: component.type, props: structuredClone(component.props) },
        status: `Copied values of ${component.type}`,
      });
    },

    pasteComponentValue(componentId) {
      const document = get().document;
      const clipboard = get().componentValueClipboard;

      if (!document || !componentId || !clipboard) {
        return;
      }

      const component = findComponent(document.data.root, componentId)?.component;

      if (!component) {
        return;
      }

      if (component.type !== clipboard.type) {
        set({ status: `Value type mismatch: copied ${clipboard.type}, target ${component.type}` });
        return;
      }

      const commands = Object.entries(clipboard.props).map(
        ([key, value]) => new SetComponentPropertyCommand(document.data.root, componentId, `props.${key}`, value),
      );
      document.execute(new BatchCommand('Paste Component Values', commands));
      get().refreshFromDocument('Component values pasted');
    },

    renameNode(nodeId, name) {
      const document = get().document;

      if (!document || !nodeId || nodeId === document.data.root.id) {
        return;
      }

      const next = name.trim();
      if (!next) {
        return;
      }

      document.execute(new SetNodePropertyCommand(document.data.root, nodeId, 'name', next));
      get().refreshFromDocument('Node renamed');
    },

    duplicateNode(nodeId) {
      const document = get().document;
      const id = nodeId ?? get().selection.primaryNodeId;

      if (!document || !id || id === document.data.root.id) {
        return;
      }

      const command = new DuplicateNodeCommand(document.data.root, id);
      document.execute(command);
      document.selectNode(command.duplicatedNode.id);
      get().refreshFromDocument('Node duplicated');
    },

    deleteNode(nodeId) {
      const document = get().document;
      const id = nodeId ?? get().selection.primaryNodeId;

      if (!document || !id || id === document.data.root.id) {
        return;
      }

      document.execute(new DeleteNodeCommand(document.data.root, id));
      document.selectNode(document.data.root.id);
      get().refreshFromDocument('Node deleted');
    },

    refreshFromDocument(status) {
      const document = get().document;

      if (!document) {
        return;
      }

      get().meta.setSelection(document.selection.value.primaryNodeId);
      set({
        selection: document.selection.value,
        revision: document.version,
        status: status ?? get().status,
      });
    },

    setStatus(status) { set({ status }); },

    setViewportSize(size) {
      const current = get().viewportSize;
      if (current.width === size.width && current.height === size.height) return;
      set({ viewportSize: size });
    },

    setCamera(camera) {
      const next = { ...camera, zoom: clampZoom(camera.zoom) };
      get().meta.setCamera(next);
      set({ camera: next });
    },

    pan(dx, dy) {
      set({ autoFit: false });
      get().setCamera(panCamera(get().camera, dx, dy));
    },

    zoomAtPoint(anchor, factor) {
      set({ autoFit: false });
      get().setCamera(zoomAt(get().camera, get().viewportSize, anchor, get().camera.zoom * factor));
    },

    zoomStep(direction) {
      const { camera, viewportSize } = get();
      set({ autoFit: false });
      get().setCamera(zoomAt(camera, viewportSize, { x: viewportSize.width / 2, y: viewportSize.height / 2 }, nextZoom(camera.zoom, direction)));
    },

    setZoom(zoom) {
      const { camera, viewportSize } = get();
      set({ autoFit: false });
      get().setCamera(zoomAt(camera, viewportSize, { x: viewportSize.width / 2, y: viewportSize.height / 2 }, zoom));
    },

    fitCanvas() {
      const state = get();

      if (!state.document) {
        return;
      }

      const preview = computeDevicePreview(state.document.data.settings, activeDevice(state));
      // With a device preview the whole simulated screen is framed, so the
      // letterbox / crop is part of the default view.
      const rect: Rect = preview.active
        ? { x: 0, y: 0, width: preview.screenWidth, height: preview.screenHeight }
        : deviceRectOfDesignRect(preview.transform, artboardRectOf(state));
      set({ autoFit: true });
      state.setCamera(frameRect(rect, state.viewportSize));
    },

    frameAll() {
      const state = get();

      if (!state.document) {
        return;
      }

      const rect = contentBounds(state.document.data.root);
      const device = deviceRectOfDesignRect(deviceTransformOf(state), rect);
      set({ autoFit: false });
      state.setCamera(frameRect(device, state.viewportSize, { padding: 64 }));
    },

    frameSelection() {
      const state = get();
      const nodeId = state.selection.primaryNodeId;

      if (!state.document || !nodeId) {
        state.fitCanvas();
        return;
      }

      const bounds = nodeBounds(state.document.data.root, nodeId);

      if (!bounds) {
        state.fitCanvas();
        return;
      }

      set({ autoFit: false });
      state.setCamera(frameRect(deviceRectOfDesignRect(deviceTransformOf(state), bounds), state.viewportSize));
    },

    updateView(patch) {
      const meta = get().meta;
      meta.updateView(patch);
      set({ meta, deviceId: meta.view.devicePreviewId });
    },

    updateSceneSettings(patch) {
      const document = get().document;

      if (!document) {
        return;
      }

      document.execute(new SetSceneSettingsCommand(document.data, patch));
      get().refreshFromDocument('Scene settings updated');
    },

    updateNodeMeta(nodeId, patch) {
      // Clone so `state.meta` gets a new reference — Hierarchy/Inspector select
      // `state.meta` and must re-render when a node's lock/visibility/expanded
      // state changes (the previous in-place mutation was invisible to React).
      const meta = get().meta.clone();
      meta.updateNodeMeta(nodeId, patch);
      set({ meta, revision: get().revision + 1 });
    },

    setComponentCollapsed(componentId, collapsed) {
      const meta = get().meta.clone();
      meta.setComponentCollapsed(componentId, collapsed);
      set({ meta, revision: get().revision + 1 });
    },

    setDevice(deviceId, custom) {
      const state = get();
      if (custom) set({ customDevice: { ...state.customDevice, ...custom } });
      state.meta.updateView({ devicePreviewId: deviceId });
      set({ meta: state.meta, deviceId });
    },
  };
});

export function activeDevice(state: EditorState): DevicePreset {
  const preset = getDevicePreset(state.deviceId);

  if (preset.id === 'custom') {
    return { ...preset, width: state.customDevice.width, height: state.customDevice.height };
  }

  return preset;
}

/**
 * Development hook: `window.__pxeEditor.store` exposes the editor state for
 * debugging in the browser console (and for automated UI checks).
 */
if (typeof window !== 'undefined' && (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __pxeEditor?: unknown }).__pxeEditor = { store: useEditorStore };
}

export function deviceTransformOf(state: EditorState) {
  const device = activeDevice(state);
  const settings = state.document?.data.settings ?? createDefaultSceneSettings();
  return computeDevicePreview(settings, device).transform;
}

export function artboardRectOf(state: EditorState): Rect {
  const settings = state.document?.data.settings ?? createDefaultSceneSettings();
  return { x: 0, y: 0, width: settings.designWidth, height: settings.designHeight };
}

export function collectNodeIds(root: SceneData['root']): string[] {
  return [root.id, ...root.children.flatMap(collectNodeIds)];
}

export function collectComponentIds(root: SceneData['root']): string[] {
  return [
    ...root.components.map((component) => component.id),
    ...root.children.flatMap(collectComponentIds),
  ];
}
