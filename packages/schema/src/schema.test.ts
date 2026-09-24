import { describe, expect, it } from 'vitest';
import {
  createDefaultTransform,
  matchResolutionPreset,
  parseSceneData,
  resolutionPresets,
} from './index';

describe('SceneSchema', () => {
  it('validates recursive v2 scene data with settings', () => {
    const scene = parseSceneData({
      schemaVersion: 2,
      id: 'scene-test',
      name: 'Test',
      settings: {
        designWidth: 750,
        designHeight: 1334,
        backgroundColor: '#1e1e1e',
        resizeMode: 'contain',
        orientation: 'portrait',
        clipContent: true,
      },
      root: {
        id: 'canvas',
        name: 'Canvas',
        active: true,
        layer: 'World',
        zIndex: 0,
        transform: createDefaultTransform({ width: 750, height: 1334 }),
        components: [],
        children: [
          {
            id: 'player',
            name: 'Player',
            active: true,
            zIndex: 3,
            transform: createDefaultTransform({ x: 10, width: 96, height: 96, pivotX: 0.5, pivotY: 0.5 }),
            components: [
              { id: 'move', type: 'game.move', enabled: true, props: { speed: 100 } },
            ],
            children: [],
          },
        ],
      },
    });

    expect(scene.settings.designWidth).toBe(750);
    expect(scene.root.children[0]?.transform.x).toBe(10);
    expect(scene.root.children[0]?.transform.pivotX).toBe(0.5);
    expect(scene.root.children[0]?.zIndex).toBe(3);
    expect(scene.root.children[0]?.layer).toBeUndefined();
  });

  it('defaults missing zIndex to 0', () => {
    const scene = parseSceneData({
      schemaVersion: 2,
      id: 'scene-test',
      name: 'Test',
      settings: {
        designWidth: 100,
        designHeight: 100,
        backgroundColor: '#000000',
        resizeMode: 'contain',
        orientation: 'any',
        clipContent: false,
      },
      root: {
        id: 'root',
        name: 'Root',
        active: true,
        transform: createDefaultTransform(),
        components: [],
        children: [],
      },
    });

    expect(scene.root.zIndex).toBe(0);
  });

  it('migrates v1 scenes: UITransform becomes the node RectTransform', () => {
    const scene = parseSceneData({
      schemaVersion: 1,
      id: 'scene-test',
      name: 'Legacy',
      root: {
        id: 'root',
        name: 'Root',
        active: true,
        transform: { x: 5, y: 6, scaleX: 1, scaleY: 1, rotationDeg: 0, pivotX: 0, pivotY: 0, alpha: 1, visible: true },
        components: [],
        children: [
          {
            id: 'panel',
            name: 'Panel',
            active: true,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, pivotX: 0, pivotY: 0, alpha: 1, visible: true },
            components: [
              { id: 'ui', type: 'engine.UITransform', enabled: true, props: { width: 480, height: 320, anchorX: 0.5, anchorY: 1 } },
            ],
            children: [],
          },
        ],
      },
    });

    expect(scene.schemaVersion).toBe(3);
    expect(scene.settings.designWidth).toBeGreaterThan(0);
    const panel = scene.root.children[0]!;
    expect(panel.transform.width).toBe(480);
    expect(panel.transform.height).toBe(320);
    expect(panel.transform.pivotX).toBe(0.5);
    expect(panel.transform.pivotY).toBe(1);
    expect(panel.components.some((component) => component.type === 'engine.UITransform')).toBe(false);
    expect(panel.zIndex).toBe(0);
  });

  it('rejects unsupported schema versions', () => {
    expect(() =>
      parseSceneData({
        schemaVersion: 4,
        id: 'scene-test',
        name: 'Test',
        root: {},
      }),
    ).toThrow('Unsupported schemaVersion');
  });
});

describe('resolution presets', () => {
  it('are quick input only — scenes store width and height', () => {
    expect(resolutionPresets[0]).toEqual({ label: '750 × 1334', width: 750, height: 1334 });
    expect(matchResolutionPreset(750, 1334)?.label).toBe('750 × 1334');
    expect(matchResolutionPreset(123, 456)).toBeNull();
  });
});
