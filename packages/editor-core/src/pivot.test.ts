import { describe, expect, it } from 'vitest';
import { createDefaultSceneSettings, createDefaultTransform, normalizeRootTransform } from '@pxe/schema';
import { createCanvasNode } from './utils';
import { pivotWithCompensation } from './pivot';

describe('pivot compensation', () => {
  for (const [pivotX, pivotY] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    for (const [scaleX, scaleY, rotationDeg] of [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-2, 3, 37]]) {
      it(`preserves visual corners at ${pivotX},${pivotY}; scale ${scaleX},${scaleY}; angle ${rotationDeg}`, () => {
        const before = createDefaultTransform({ x: 80, y: 120, width: 160, height: 90, pivotX: 0.5, pivotY: 0.5, scaleX, scaleY, rotationDeg });
        const after = pivotWithCompensation(before, pivotX!, pivotY!);
        const point = (t: typeof before, x: number, y: number) => {
          const a = t.rotationDeg * Math.PI / 180;
          const dx = (x - t.width * t.pivotX) * t.scaleX;
          const dy = (y - t.height * t.pivotY) * t.scaleY;
          return [t.x + Math.cos(a) * dx - Math.sin(a) * dy, t.y + Math.sin(a) * dx + Math.cos(a) * dy];
        };
        for (const [x, y] of [[0, 0], [160, 90]]) {
          const oldPoint = point(before, x!, y!);
          point(after, x!, y!).forEach((value, i) => expect(value).toBeCloseTo(oldPoint[i]!));
        }
      });
    }
  }

  it('normalizes an existing root and is idempotent', () => {
    const settings = createDefaultSceneSettings();
    const root = createCanvasNode(settings);
    Object.assign(root.transform, { x: -100, rotationDeg: 30, scaleX: 2, pivotX: 0.5 });
    expect(normalizeRootTransform(root, settings)).toBe(true);
    expect(root.transform).toMatchObject({ x: 0, y: 0, rotationDeg: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0, width: settings.designWidth });
    expect(normalizeRootTransform(root, settings)).toBe(false);
  });
});
