import {
  assetExtension,
  createAssetDatabase,
  createId,
  inferAssetType,
  normalizeProjectPath,
  projectPathDirName,
  type AssetDatabase,
  type AssetManifest,
  type AssetMeta,
  type AssetRecord,
  type AssetType,
} from '@pxe/schema';

/**
 * The asset database is the whole of the editor's resource pipeline for now:
 *
 * ```
 * assets/**            ← what the user authored (scanned on every project open)
 *        ↓ scan + reconcile
 * .pxe/asset-db.json   ← stable ids, safely deletable and rebuildable
 *        ↓
 * AssetManifest        ← what the Inspector and the runtime consume
 * ```
 *
 * There is intentionally no `library/` or `temp/` directory yet: nothing here is
 * expensive to regenerate, and no derived data (thumbnails, hashes, dependency
 * graph, import artifacts) exists to cache. When that changes, `.pxe/` is the
 * place it goes — not a new top-level folder.
 *
 * This module is pure: it never touches the DOM, the file system or the store.
 */

export interface ScannedAsset {
  /** Project-relative path, e.g. `assets/textures/player.png`. */
  path: string;
  type: AssetType;
}

export interface AssetScan {
  assets: ScannedAsset[];
  /** Files that were scanned but are not assets (unknown extension, editor sidecars…). */
  ignored: string[];
}

export interface AssetDatabaseUpdate {
  database: AssetDatabase;
  added: AssetRecord[];
  removed: AssetRecord[];
  /** Records whose type changed because the file extension changed. */
  retyped: AssetRecord[];
  unchanged: number;
}

/** Project folders that never contain hand-authored assets. */
const ignoredDirectories = new Set(['node_modules', 'dist', '.git', '.pxe']);

/**
 * Classifies scanned paths.
 *
 * `Game.scene.editor.json` is deliberately ignored: editor metadata is a sidecar
 * of a scene, not a game asset the Inspector could reference.
 */
export function scanAssetPaths(paths: Iterable<string>, assetsDir = 'assets'): AssetScan {
  const assets: ScannedAsset[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();

  for (const raw of paths) {
    const path = normalizeProjectPath(raw);

    if (!path || seen.has(path)) {
      continue;
    }

    seen.add(path);

    if (!isInsideAssets(path, assetsDir) || isIgnoredPath(path, assetsDir)) {
      continue;
    }

    const type = inferAssetType(path);

    if (!type) {
      ignored.push(path);
      continue;
    }

    assets.push({ path, type });
  }

  assets.sort((a, b) => a.path.localeCompare(b.path));
  ignored.sort();

  return { assets, ignored };
}

export function isInsideAssets(path: string, assetsDir = 'assets'): boolean {
  const normalized = normalizeProjectPath(path);
  return normalized === assetsDir || normalized.startsWith(`${assetsDir}/`);
}

export function isIgnoredPath(path: string, assetsDir = ''): boolean {
  const relative = path.slice(assetsDir.length).replace(/^\//, '');
  const segments = relative.split('/');

  if (segments.some((segment) => ignoredDirectories.has(segment))) {
    return true;
  }

  if (segments.some((segment) => segment.startsWith('.'))) {
    return true;
  }

  // Editor sidecar of a scene (`Game.scene.editor.json`).
  return /\.editor\.json$/i.test(path);
}

/**
 * Merges a fresh scan into the persisted database.
 *
 * Ids are keyed by path, which is the whole stability story for now: renaming or
 * moving a file in the OS gives it a new id (the old reference turns into a
 * "Missing" entry in the Inspector), while re-opening, re-scanning or deleting
 * `.pxe/asset-db.json` never renumbers the assets that are still there.
 */
export function reconcileAssetDatabase(
  previous: AssetDatabase | null,
  scan: AssetScan,
  createAssetId: (path: string) => string = () => createId('asset'),
): AssetDatabaseUpdate {
  const byPath = new Map<string, AssetRecord>();

  for (const record of previous?.assets ?? []) {
    byPath.set(normalizeProjectPath(record.path), record);
  }

  const added: AssetRecord[] = [];
  const retyped: AssetRecord[] = [];
  const records: AssetRecord[] = [];
  let unchanged = 0;

  for (const scanned of scan.assets) {
    const existing = byPath.get(scanned.path);

    if (!existing) {
      const record: AssetRecord = { id: createAssetId(scanned.path), path: scanned.path, type: scanned.type };
      added.push(record);
      records.push(record);
      continue;
    }

    byPath.delete(scanned.path);

    if (existing.type !== scanned.type) {
      const record: AssetRecord = { ...existing, type: scanned.type };
      retyped.push(record);
      records.push(record);
      continue;
    }

    unchanged += 1;
    records.push(existing);
  }

  return {
    database: createAssetDatabase(records),
    added,
    removed: [...byPath.values()],
    retyped,
    unchanged,
  };
}

/**
 * Packs a database into the runtime/Inspector manifest.
 *
 * `path` carries the loader URL, which for a browser project is a `blob:` URL of
 * the picked file — the runtime never learns where the file came from.
 */
export function buildAssetManifest(
  database: AssetDatabase,
  resolveUrl: (record: AssetRecord) => string | null,
): AssetManifest {
  const assets: AssetMeta[] = [];

  for (const record of database.assets) {
    if (record.type === 'scene' || record.type === 'prefab') {
      continue;
    }

    const url = resolveUrl(record);

    if (!url) {
      continue;
    }

    assets.push({
      id: record.id,
      type: record.type,
      path: url,
      bundle: bundleOf(record.path),
      format: assetExtension(record.path) || undefined,
    });
  }

  return { schemaVersion: 2, assets, scenePreloads: {} };
}

/** First folder under `assets/` — a coarse bundle for future preloading. */
export function bundleOf(path: string): string {
  const parts = normalizeProjectPath(path).split('/');
  return parts.length > 2 ? parts[1]! : '';
}

export interface AssetFolder {
  /** Path relative to the assets root, `''` for the root itself. */
  path: string;
  assets: AssetRecord[];
}

/** Groups records into folders for the Assets Browser, keeping the scan order. */
export function groupAssetsByFolder(records: AssetRecord[], assetsDir = 'assets'): AssetFolder[] {
  const folders = new Map<string, AssetRecord[]>();

  for (const record of records) {
    const directory = projectPathDirName(record.path);
    const relative = directory === assetsDir ? '' : directory.slice(assetsDir.length + 1);
    const bucket = folders.get(relative) ?? [];
    bucket.push(record);
    folders.set(relative, bucket);
  }

  return [...folders.entries()]
    .map(([path, assets]) => ({ path, assets }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Scenes the user can open, newest scan order. */
export function sceneRecords(database: AssetDatabase): AssetRecord[] {
  return database.assets.filter((record) => record.type === 'scene');
}
