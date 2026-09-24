import {
  componentDatabasePath,
  assetDisplayName,
  projectPathDirName,
  type AssetDatabase,
  type AssetManifest,
  type AssetRecord,
  type AssetType,
  type ProjectConfig,
} from '@pxe/schema';
import {
  buildAssetManifest,
  reconcileAssetDatabase,
  scanAssetPaths,
} from './assetDatabase';
import {
  loadPreviousDatabase,
  rescanProjectAssets,
  writeAssetDatabase,
  writeProjectText,
  type OpenedProject,
  type WriteResult,
} from './project';
import { buildComponentManifest, parseComponentDatabase, reconcileComponentDatabase, scanComponentPaths } from './componentDatabase';
import { compileProjectComponents } from './componentCompiler';
import type { CompiledModule } from '@pxe/runtime';
import type { EditorComponentManifestItem } from './componentManifest';

export interface ProjectAsset extends AssetRecord {
  /** Object URL for loadable types, `null` for scene/prefab/json. */
  url: string | null;
  displayName: string;
  folder: string;
}

export interface AssetScanSummary {
  total: number;
  added: number;
  removed: number;
  retyped: number;
  ignored: number;
  persisted: WriteResult;
}

/** Types Pixi can actually fetch from a `blob:` URL. */
const loadableTypes = new Set<AssetType>(['texture', 'audio', 'font']);

/**
 * Live project state: the opened folder, the reconciled asset database and the
 * object URLs the renderers load from.
 *
 * Everything here is browser session state; the durable artifacts are the files
 * in `assets/` and `.pxe/asset-db.json`.
 */
export class ProjectSession {
  componentManifest: EditorComponentManifestItem[] = [];
  componentModules: CompiledModule[] = [];
  componentWarnings: string[] = [];
  private disposed = false;
  private databaseValue: AssetDatabase;
  private readonly urls = new Map<string, { url: string; path: string }>();
  private manifestValue: AssetManifest = { schemaVersion: 2, assets: [], scenePreloads: {} };
  private assetsValue: ProjectAsset[] = [];

  private constructor(
    readonly project: OpenedProject,
    database: AssetDatabase,
  ) {
    this.databaseValue = database;
  }

  /** Opens a project: reads `.pxe/asset-db.json`, scans `assets/` and persists the result. */
  static async open(project: OpenedProject): Promise<ProjectSession> {
    const previous = await loadPreviousDatabase(project);
    const scan = scanAssetPaths(project.assetPaths, project.config.assets);
    const update = reconcileAssetDatabase(previous, scan);
    const session = new ProjectSession(project, update.database);
    await session.reloadComponents();
    await session.syncAssets();
    await session.persist();
    return session;
  }

  get name(): string {
    return this.project.config.name;
  }

  get config(): ProjectConfig {
    return this.project.config;
  }

  get database(): AssetDatabase {
    return this.databaseValue;
  }

  get assets(): ProjectAsset[] {
    return this.assetsValue;
  }

  get manifest(): AssetManifest {
    return this.manifestValue;
  }

  get hasWriteAccess(): boolean {
    return this.project.hasWriteAccess;
  }

  asset(assetId: string | null | undefined): ProjectAsset | null {
    if (!assetId) {
      return null;
    }

    return this.assetsValue.find((asset) => asset.id === assetId) ?? null;
  }

  assetByPath(path: string): ProjectAsset | null {
    return this.assetsValue.find((asset) => asset.path === path) ?? null;
  }

  urlFor(record: AssetRecord): string | null {
    if (!loadableTypes.has(record.type)) {
      return null;
    }

    return this.urls.get(record.id)?.url ?? null;
  }

  /** Re-walks `assets/`, reconciles ids and rewrites `.pxe/asset-db.json`. */
  async rescan(): Promise<AssetScanSummary> {
    const previous = this.databaseValue;
    await rescanProjectAssets(this.project);
    await this.reloadComponents();
    const scan = scanAssetPaths(this.project.assetPaths, this.project.config.assets);
    const update = reconcileAssetDatabase(previous, scan);

    this.databaseValue = update.database;
    await this.syncAssets();
    const persisted = await this.persist();

    return {
      total: update.database.assets.length,
      added: update.added.length,
      removed: update.removed.length,
      retyped: update.retyped.length,
      ignored: scan.ignored.length,
      persisted,
    };
  }

  /** Registers an asset that was just created on disk (e.g. a saved scene). */
  addKnownPath(path: string): void {
    if (!this.project.assetPaths.includes(path)) {
      this.project.assetPaths.push(path);
    }
  }

  async persist(): Promise<WriteResult> {
    return writeAssetDatabase(this.project, this.databaseValue);
  }

  dispose(): void {
    this.disposed = true;
    this.componentManifest = [];
    this.componentModules = [];
    for (const { url } of this.urls.values()) {
      URL.revokeObjectURL(url);
    }

    this.urls.clear();
  }

  async reloadComponents(): Promise<void> {
    const project = this.project;
    const scan = scanComponentPaths(project.sourcePaths, project.config.components);
    const warnings: string[] = [];
    const entries: { path: string; metadata: unknown }[] = [];
    for (const path of scan.metadata) {
      try {
        const text = await project.sourceEntries.get(path)?.text();
        if (text === null || text === undefined) throw new Error('metadata file not found');
        entries.push({ path, metadata: JSON.parse(text) });
      } catch (error) { warnings.push(`${path}: ${String(error)}`); }
    }
    let modules: CompiledModule[] = [];
    try {
      const compilation = await compileProjectComponents(await Promise.all(scan.sources.map(async (path) => {
        const text = await project.sourceEntries.get(path)?.text();
        if (text === null || text === undefined) throw new Error(`source not found: ${path}`);
        return { path, text };
      })));
      modules = compilation.modules;
      for (const entry of compilation.entries) {
        const sidecar = entries.find((item) => (item.metadata as { type?: string })?.type === entry.metadata.type);
        if (sidecar) {
          if (JSON.stringify(sidecar.metadata) !== JSON.stringify(entry.metadata)) warnings.push(`Metadata differs from code: ${entry.metadata.type}`);
        } else entries.push(entry);
      }
    } catch (error) { warnings.push(`Components: ${String(error)}`); }

    let previous = parseComponentDatabase(null);
    try {
      const text = await project.entries.get(componentDatabasePath)?.text()
        ?? window.localStorage.getItem(`pxe:component-db:${project.rootName}`);
      if (text) previous = parseComponentDatabase(JSON.parse(text));
    } catch { /* Derived data can always be rebuilt. */ }
    const seenTypes = new Set<string>();
    const validEntries = entries.filter((entry) => {
      try {
        const metadata = reconcileComponentDatabase(previous, [entry]).components[0]!.metadata;
        if (seenTypes.has(metadata.type)) throw new Error(`Duplicate component type: ${metadata.type}`);
        seenTypes.add(metadata.type);
        return true;
      }
      catch (error) { warnings.push(`${entry.path}: ${String(error)}`); return false; }
    });
    const database = reconcileComponentDatabase(previous, validEntries);
    if (this.disposed) return;
    this.componentManifest = buildComponentManifest(database);
    this.componentModules = modules;
    this.componentWarnings = warnings;
    const text = `${JSON.stringify(database, null, 2)}\n`;
    if (project.hasWriteAccess) {
      const result = await writeProjectText(project, componentDatabasePath, text);
      if (result === 'failed') this.componentWarnings.push('Could not save .pxe/component-db.json');
      await writeProjectText(project, '.pxe/components.compiled.json', JSON.stringify(modules));
    } else {
      try { window.localStorage.setItem(`pxe:component-db:${project.rootName}`, text); }
      catch { this.componentWarnings.push('Could not cache component metadata locally'); }
    }
  }

  private async syncAssets(): Promise<void> {
    this.assetsValue = await this.collectAssets();
    this.manifestValue = buildAssetManifest(this.databaseValue, (record) => this.urlFor(record));
  }

  private async collectAssets(): Promise<ProjectAsset[]> {
    const next = new Map<string, { url: string; path: string }>();

    for (const record of this.databaseValue.assets) {
      if (!loadableTypes.has(record.type)) {
        continue;
      }

      const existing = this.urls.get(record.id);

      if (existing && existing.path === record.path) {
        next.set(record.id, existing);
        continue;
      }

      const entry = this.project.entries.get(record.path);

      if (!entry) {
        continue;
      }

      if (existing) {
        URL.revokeObjectURL(existing.url);
      }

      next.set(record.id, { url: await entry.objectUrl(), path: record.path });
    }

    for (const [id, value] of this.urls) {
      if (!next.has(id)) {
        URL.revokeObjectURL(value.url);
      }
    }

    this.urls.clear();

    for (const [id, value] of next) {
      this.urls.set(id, value);
    }

    return this.databaseValue.assets.map((record) => ({
      ...record,
      url: this.urls.get(record.id)?.url ?? null,
      displayName: assetDisplayName(record.path),
      folder: projectPathDirName(record.path).slice(this.project.config.assets.length + 1),
    }));
  }
}
