import { describe, expect, it } from 'vitest';
import { resolveAssetManifest } from './index';

describe('static player assets', () => {
  it('resolves relative URLs against the scene, preserving ids and absolute/blob/data URLs', () => {
    const paths = ['assets/player.svg', '../shared/font.woff2', '/root/a.png', 'https://cdn.example/a.png', 'blob:https://example/id', 'data:image/png;base64,AA'];
    const manifest = { schemaVersion: 2, assets: paths.map((path, i) => ({ id: String(i), type: 'texture' as const, path, format: 'svg' })), scenePreloads: {} };
    const result = resolveAssetManifest(manifest, 'https://example/pages/demo/scene.json');
    expect(result.assets.map((asset) => asset.path)).toEqual(['https://example/pages/demo/assets/player.svg', 'https://example/pages/shared/font.woff2',
      'https://example/root/a.png', ...paths.slice(3)]);
    expect(result.assets.map((asset) => asset.id)).toEqual(paths.map((_, i) => String(i)));
    expect(manifest.assets[0]!.path).toBe('assets/player.svg');
  });
});
