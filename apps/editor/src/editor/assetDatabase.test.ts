import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseAssetDatabase, parseProjectConfig, parseSceneData } from '@pxe/schema';
import {
  buildAssetManifest,
  groupAssetsByFolder,
  reconcileAssetDatabase,
  scanAssetPaths,
  sceneRecords,
} from './assetDatabase';
import { openProjectFromEntries, sceneEditorPath, type ProjectFileEntry } from './project';

function jsonEntry(path: string, data: unknown): ProjectFileEntry {
  const text = JSON.stringify(data);
  return { path, file: new File([text], path.split('/').pop() ?? 'file', { type: 'application/json' }), handle: null };
}

describe('scanAssetPaths', () => {
  it('classifies assets under the assets folder and ignores everything else', () => {
    const scan = scanAssetPaths([
      'pxe.config.json',
      '.pxe/asset-db.json',
      'assets/player.png',
      'assets/textures/hero.webp',
      'assets/audio/theme.mp3',
      'assets/fonts/main.woff2',
      'assets/scenes/Game.scene.json',
      'assets/scenes/Game.scene.editor.json',
      'assets/prefabs/Button.prefab.json',
      'assets/data/level.json',
      'assets/notes.txt',
      'assets/.DS_Store',
      'node_modules/pkg/index.png',
      'dist/output.png',
      'src/components/Move.ts',
    ]);

    expect(scan.assets.map((asset) => `${asset.path}:${asset.type}`)).toEqual([
      'assets/audio/theme.mp3:audio',
      'assets/data/level.json:json',
      'assets/fonts/main.woff2:font',
      'assets/player.png:texture',
      'assets/prefabs/Button.prefab.json:prefab',
      'assets/scenes/Game.scene.json:scene',
      'assets/textures/hero.webp:texture',
    ]);

    // Unknown extensions are reported instead of silently dropped.
    expect(scan.ignored).toEqual(['assets/notes.txt']);
  });

  it('never lists editor sidecars as assets', () => {
    const scan = scanAssetPaths(['assets/scenes/Game.scene.editor.json'], 'assets');
    expect(scan.assets).toHaveLength(0);
  });

  it('respects a custom assets folder', () => {
    const scan = scanAssetPaths(['game/art/hero.png', 'assets/hero.png'], 'game');
    expect(scan.assets.map((asset) => asset.path)).toEqual(['game/art/hero.png']);
  });

  it('de-duplicates and normalizes paths', () => {
    const scan = scanAssetPaths(['./assets//player.png', 'assets\\player.png', 'assets/player.png']);
    expect(scan.assets).toHaveLength(1);
    expect(scan.assets[0]!.path).toBe('assets/player.png');
  });
});

describe('reconcileAssetDatabase', () => {
  it('generates ids on the first scan', () => {
    const scan = scanAssetPaths(['assets/player.png', 'assets/scenes/Game.scene.json']);
    const update = reconcileAssetDatabase(null, scan, (path) => `id:${path}`);

    expect(update.added).toHaveLength(2);
    expect(update.removed).toHaveLength(0);
    expect(update.database.schemaVersion).toBe(1);
    expect(update.database.assets).toEqual([
      { id: 'id:assets/player.png', path: 'assets/player.png', type: 'texture' },
      { id: 'id:assets/scenes/Game.scene.json', path: 'assets/scenes/Game.scene.json', type: 'scene' },
    ]);
  });

  it('keeps ids stable across rescans — the whole point of the database', () => {
    const first = reconcileAssetDatabase(null, scanAssetPaths(['assets/player.png']), () => 'asset-player');
    const second = reconcileAssetDatabase(first.database, scanAssetPaths(['assets/player.png']), () => 'should-not-be-used');

    expect(second.unchanged).toBe(1);
    expect(second.added).toHaveLength(0);
    expect(second.database.assets[0]!.id).toBe('asset-player');
  });

  it('adds new files and drops deleted ones', () => {
    const first = reconcileAssetDatabase(null, scanAssetPaths(['assets/player.png', 'assets/old.png']), (path) => `id:${path}`);
    const second = reconcileAssetDatabase(first.database, scanAssetPaths(['assets/player.png', 'assets/new.png']), (path) => `id:${path}`);

    expect(second.added.map((record) => record.path)).toEqual(['assets/new.png']);
    expect(second.removed.map((record) => record.path)).toEqual(['assets/old.png']);
    expect(second.database.assets.map((record) => record.id)).toEqual(['id:assets/new.png', 'id:assets/player.png']);
  });

  it('retags a record when the extension changes type', () => {
    const first = reconcileAssetDatabase(null, scanAssetPaths(['assets/data.json']), () => 'asset-data');
    const second = reconcileAssetDatabase(first.database, scanAssetPaths(['assets/data.json']), () => 'unused');

    expect(second.retyped).toHaveLength(0);
    expect(second.database.assets[0]!.type).toBe('json');
  });

  it('survives a deleted .pxe/asset-db.json (regenerates from assets/)', () => {
    const scan = scanAssetPaths(['assets/player.png']);
    const rebuilt = reconcileAssetDatabase(parseAssetDatabase(null), scan, () => 'fresh-id');

    expect(rebuilt.added).toHaveLength(1);
    expect(rebuilt.database.assets[0]!.id).toBe('fresh-id');
  });
});

describe('buildAssetManifest', () => {
  it('lists loadable assets with their loader format and skips scenes', () => {
    const { database } = reconcileAssetDatabase(null, scanAssetPaths([
      'assets/textures/player.svg',
      'assets/fonts/main.woff2',
      'assets/scenes/Game.scene.json',
    ]), (path) => `id:${path}`);

    const manifest = buildAssetManifest(database, (record) => `blob:${record.path}`);

    expect(manifest.assets).toEqual([
      { id: 'id:assets/fonts/main.woff2', type: 'font', path: 'blob:assets/fonts/main.woff2', bundle: 'fonts', format: 'woff2' },
      {
        id: 'id:assets/textures/player.svg',
        type: 'texture',
        path: 'blob:assets/textures/player.svg',
        bundle: 'textures',
        format: 'svg',
      },
    ]);
  });

  it('drops entries the host cannot resolve to a URL', () => {
    const { database } = reconcileAssetDatabase(null, scanAssetPaths(['assets/player.png']), () => 'asset-player');
    expect(buildAssetManifest(database, () => null).assets).toHaveLength(0);
  });
});

describe('groupAssetsByFolder / sceneRecords', () => {
  it('groups by folder relative to the assets root', () => {
    const { database } = reconcileAssetDatabase(null, scanAssetPaths([
      'assets/player.png',
      'assets/textures/hero.png',
      'assets/scenes/Game.scene.json',
    ]), (path) => path);

    expect(groupAssetsByFolder(database.assets).map((folder) => [folder.path, folder.assets.length])).toEqual([
      ['', 1],
      ['scenes', 1],
      ['textures', 1],
    ]);
    expect(sceneRecords(database).map((record) => record.id)).toEqual(['assets/scenes/Game.scene.json']);
  });
});

describe('project files', () => {
  const entries: ProjectFileEntry[] = [
    jsonEntry('pxe.config.json', { name: 'Demo', startScene: 'assets/scenes/Game.scene.json' }),
    { path: 'assets/textures/player.svg', file: new File(['<svg/>'], 'player.svg', { type: 'image/svg+xml' }), handle: null },
    jsonEntry('assets/scenes/Game.scene.json', { schemaVersion: 2 }),
    jsonEntry('.pxe/asset-db.json', { schemaVersion: 1, assets: [{ id: 'asset-player', path: 'assets/textures/player.svg', type: 'texture' }] }),
    jsonEntry('package.json', { name: 'demo' }),
  ];

  it('assembles a project from entries, keeping only project-relevant files', async () => {
    const project = await openProjectFromEntries(entries, { rootName: 'demo-project' });

    expect(project.config).toEqual({ name: 'Demo', assets: 'assets', components: 'src', startScene: 'assets/scenes/Game.scene.json' });
    expect(project.assetPaths).toEqual([
      'assets/textures/player.svg',
      'assets/scenes/Game.scene.json',
    ]);
    expect(project.entries.has('pxe.config.json')).toBe(true);
    expect(project.entries.has('.pxe/asset-db.json')).toBe(true);
    expect(project.entries.has('package.json')).toBe(false);
    expect(project.hasWriteAccess).toBe(false);
    expect(project.databaseFileExists).toBe(true);
  });

  it('falls back to the folder name when pxe.config.json is missing', async () => {
    const project = await openProjectFromEntries(entries.filter((entry) => entry.path !== 'pxe.config.json'), {
      rootName: 'demo-project',
    });

    expect(project.config.name).toBe('demo-project');
    expect(project.configFileExists).toBe(false);
  });

  it('derives the editor sidecar path from a scene path', () => {
    expect(sceneEditorPath('assets/scenes/Game.scene.json')).toBe('assets/scenes/Game.scene.editor.json');
  });
});

describe('tolerant parsing', () => {
  it('degrades a broken asset database to an empty one', () => {
    expect(parseAssetDatabase({ schemaVersion: 1, assets: [{ id: '', path: '', type: 'nope' }] }).assets).toEqual([]);
    expect(parseAssetDatabase(null).assets).toEqual([]);
  });

  it('fills missing pxe.config.json fields from the fallback', () => {
    expect(parseProjectConfig({ startScene: 'assets/scenes/A.scene.json' }, { name: 'Picked Folder' })).toEqual({
      name: 'Picked Folder',
      assets: 'assets',
      components: 'src',
      startScene: 'assets/scenes/A.scene.json',
    });
    expect(parseProjectConfig('not an object', { name: 'Picked Folder' }).assets).toBe('assets');
  });
});

/**
 * The example project shipped in `examples/demo-project` is the only scene the
 * repo has (the editor no longer carries a default scene), so it is checked here:
 * it must stay openable and its committed asset ids must stay referenced.
 */
describe('examples/demo-project', () => {
  const root = fileURLToPath(new URL('../../../../examples/demo-project/', import.meta.url));
  const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');
  const entry = (path: string): ProjectFileEntry => ({
    path,
    file: new File([read(path)], path.split('/').pop() ?? 'file'),
    handle: null,
  });

  it('opens, scans and keeps the committed asset ids', async () => {
    const project = await openProjectFromEntries([
      entry('pxe.config.json'),
      entry('assets/textures/player.svg'),
      entry('assets/scenes/Game.scene.json'),
      entry('assets/scenes/Game.scene.editor.json'),
      entry('.pxe/asset-db.json'),
    ], { rootName: 'demo-project' });

    expect(project.config).toEqual({
      name: 'Demo Project',
      assets: 'assets',
      components: 'src',
      startScene: 'assets/scenes/Game.scene.json',
    });

    const scan = scanAssetPaths(project.assetPaths, project.config.assets);
    expect(scan.assets.map((asset) => asset.path)).toEqual([
      'assets/scenes/Game.scene.json',
      'assets/textures/player.svg',
    ]);
    expect(scan.ignored).toEqual([]);

    const previous = parseAssetDatabase(JSON.parse(read('.pxe/asset-db.json')));
    const update = reconcileAssetDatabase(previous, scan, () => 'regenerated');
    expect(update.added).toHaveLength(0);
    expect(update.retyped).toHaveLength(0);
    expect(update.database.assets.map((asset) => asset.id)).toEqual(['asset-scene-game', 'asset-player']);

    // The scene must reference ids the database actually provides.
    const scene = parseSceneData(JSON.parse(read('assets/scenes/Game.scene.json')));
    const referenced = scene.root.children
      .flatMap((node) => [node, ...node.children])
      .flatMap((node) => node.components)
      .map((component) => (component.props.texture as { assetId?: string } | undefined)?.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));

    expect(referenced).toEqual(['asset-player']);
    expect(update.database.assets.map((asset) => asset.id)).toEqual(expect.arrayContaining(referenced));
  });
});
