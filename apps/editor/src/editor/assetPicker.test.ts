import { describe, expect, it } from 'vitest';
import type { ProjectAsset } from './projectSession';
import { filterAssets, findAssetById } from './assetPicker';

const assets: ProjectAsset[] = [
  { id: 'asset-player', path: 'assets/textures/player.png', type: 'texture', url: 'blob:player', displayName: 'player', folder: 'textures' },
  { id: 'asset-bg', path: 'assets/textures/bg.jpg', type: 'texture', url: 'blob:bg', displayName: 'bg', folder: 'textures' },
  { id: 'asset-font', path: 'assets/fonts/main.woff2', type: 'font', url: 'blob:font', displayName: 'main', folder: 'fonts' },
  { id: 'asset-scene', path: 'assets/scenes/Game.scene.json', type: 'scene', url: null, displayName: 'Game', folder: 'scenes' },
];

describe('filterAssets', () => {
  it('returns everything when the query is empty', () => {
    expect(filterAssets(assets, { query: '' })).toHaveLength(4);
  });

  it('filters by display name', () => {
    expect(filterAssets(assets, { query: 'player' }).map((a) => a.id)).toEqual(['asset-player']);
  });

  it('filters by path', () => {
    expect(filterAssets(assets, { query: 'fonts/main' }).map((a) => a.id)).toEqual(['asset-font']);
  });

  it('filters by asset id', () => {
    expect(filterAssets(assets, { query: 'asset-bg' }).map((a) => a.id)).toEqual(['asset-bg']);
  });

  it('applies the type filter', () => {
    const textures = filterAssets(assets, { query: '', assetType: 'texture' });
    expect(textures.map((a) => a.id).sort()).toEqual(['asset-bg', 'asset-player']);
  });

  it('sorts by display name', () => {
    const textures = filterAssets(assets, { query: '', assetType: 'texture' });
    expect(textures.map((a) => a.displayName)).toEqual(['bg', 'player']);
  });
});

describe('findAssetById', () => {
  it('finds an exact id', () => {
    expect(findAssetById(assets, 'asset-player')?.path).toBe('assets/textures/player.png');
  });

  it('returns null for an unknown id', () => {
    expect(findAssetById(assets, 'missing')).toBeNull();
  });
});
