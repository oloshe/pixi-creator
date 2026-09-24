import { describe, expect, it, vi } from 'vitest';
import { createDefaultSceneSettings, createDefaultTransform, parseSceneData } from '@pxe/schema';
import { calculateAnchorLayout, defaultUIAnchor } from './layout';

function legacy(version: number) {
  return { schemaVersion: version, id: 'migration', name: 'Migration', settings: createDefaultSceneSettings(),
    root: { id: 'root', name: 'Root', active: true, zIndex: 0, transform: createDefaultTransform(), children: [], components: [
      { id: 'layout', type: 'engine.Widget', enabled: false, props: { alignLeft: true, alignRight: true,
        alignHorizontalCenter: true, left: 10, right: 30, horizontalCenter: 99, custom: { keep: [1, 2] } } },
    ] } };
}

describe('scene layout migration', () => {
  for (const version of [1, 2]) {
    it(`migrates v${version} to v3 with equivalent layout and preserved unknown fields`, () => {
      const scene = parseSceneData(legacy(version));
      expect(scene.schemaVersion).toBe(3);
      const anchor = scene.root.components[0]!;
      expect(anchor).toMatchObject({ id: 'layout', type: 'engine.UIAnchor', enabled: false,
        props: { anchorLeft: true, anchorRight: true, centerX: true, offsetX: 99, custom: { keep: [1, 2] } } });
      expect(anchor.props).not.toHaveProperty('alignLeft');
      const result = calculateAnchorLayout({ width: 600, height: 400 }, { width: 100, height: 50 },
        { ...defaultUIAnchor, ...anchor.props }, createDefaultTransform({ x: 20, y: 35 }));
      expect(result).toEqual({ x: 10, y: 35, width: 560, height: 50 });
      expect(parseSceneData(scene)).toEqual(scene);
    });
  }
  it('keeps an existing anchor and reports the conflicting legacy component', () => {
    const input = legacy(2);
    const anchor = { id: 'anchor', type: 'engine.UIAnchor', enabled: true, props: { left: 99 } };
    const scene = { ...input, root: { ...input.root, components: [...input.root.components, anchor] } };
    const warning = vi.fn();
    expect(parseSceneData(scene, undefined, warning).root.components).toEqual([anchor]);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('root'));
    expect(input.root.components).toHaveLength(1);
  });
  it('stretches before centering, handles each axis separately, and mirrors negative scales', () => {
    const result = calculateAnchorLayout({ width: 600, height: 400 }, { width: 100, height: 50 },
      { ...defaultUIAnchor, anchorLeft: true, anchorRight: true, centerX: true, left: 10, right: 30, centerY: true, offsetY: 20 },
      createDefaultTransform({ scaleX: -2, scaleY: -3, pivotX: 0.25, pivotY: 0.2 }));
    expect(result).toEqual({ x: 430, y: 265, width: 280, height: 50 });
  });
});
