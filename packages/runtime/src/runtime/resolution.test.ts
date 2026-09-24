import { describe, expect, it } from 'vitest';
import { ResolutionManager } from './ResolutionManager';
import { ScreenManager } from './ScreenManager';

describe('ResolutionManager', () => {
  it('contain letterboxes the design area and centres it', () => {
    const resolution = new ResolutionManager(750, 1334, 'contain');
    resolution.resize(1170, 2532);

    const scale = Math.min(1170 / 750, 2532 / 1334);
    expect(resolution.scaleX).toBeCloseTo(scale);
    expect(resolution.scaleY).toBeCloseTo(scale);
    expect(resolution.viewportWidth).toBeCloseTo(750 * scale);
    expect(resolution.viewportHeight).toBeCloseTo(1334 * scale);
    expect(resolution.offsetX).toBeCloseTo((1170 - resolution.viewportWidth) / 2);
    expect(resolution.offsetY).toBeCloseTo((2532 - resolution.viewportHeight) / 2);
  });

  it('cover fills the screen and crops the edges', () => {
    const resolution = new ResolutionManager(750, 1334, 'cover');
    resolution.resize(1000, 1000);

    expect(resolution.scaleX).toBeCloseTo(1000 / 750);
    expect(resolution.viewportHeight).toBeGreaterThan(1000);
    expect(resolution.offsetY).toBeLessThan(0);
    expect(resolution.visibleDesignHeight).toBeCloseTo(1000 / resolution.scaleY);
  });

  it('fixed-width always shows the full design width', () => {
    const resolution = new ResolutionManager(750, 1334, 'fixed-width');
    resolution.resize(750, 1624);

    expect(resolution.scaleX).toBeCloseTo(1);
    expect(resolution.viewportWidth).toBeCloseTo(750);
    expect(resolution.offsetX).toBe(0);
    // The extra tall screen reveals more logical height than the design.
    expect(resolution.visibleDesignHeight).toBeCloseTo(1624);
    expect(resolution.visibleDesignWidth).toBeCloseTo(750);
  });

  it('fixed-height always shows the full design height and reports the visible width', () => {
    const resolution = new ResolutionManager(750, 1334, 'fixed-height');
    resolution.resize(2000, 1334);

    expect(resolution.scaleY).toBeCloseTo(1);
    expect(resolution.viewportHeight).toBeCloseTo(1334);
    expect(resolution.offsetY).toBe(0);
    expect(resolution.visibleDesignWidth).toBeCloseTo(2000);
  });

  it('stretch uses independent axis scales', () => {
    const resolution = new ResolutionManager(750, 1334, 'stretch');
    resolution.resize(375, 667);

    expect(resolution.scaleX).toBeCloseTo(0.5);
    expect(resolution.scaleY).toBeCloseTo(0.5);
    expect(resolution.offsetX).toBe(0);
    expect(resolution.offsetY).toBe(0);

    resolution.resize(1500, 1334);
    expect(resolution.scaleX).toBeCloseTo(2);
    expect(resolution.scaleY).toBeCloseTo(1);
  });

  it('round-trips between design and screen coordinates', () => {
    const resolution = new ResolutionManager(750, 1334, 'contain');
    resolution.resize(1170, 2532);

    const screen = resolution.toScreen(100, 200);
    const design = resolution.toDesign(screen.x, screen.y);

    expect(design.x).toBeCloseTo(100);
    expect(design.y).toBeCloseTo(200);
  });
});

describe('ScreenManager', () => {
  it('converts safe-area insets from screen pixels into design units', () => {
    const screen = new ScreenManager(750, 1334, 'contain');
    screen.resize(1500, 2668);

    expect(screen.resolution.scaleX).toBeCloseTo(2);
    screen.setSafeArea({ top: 88, bottom: 68, left: 0, right: 0 });

    expect(screen.safeAreaInDesign.top).toBeCloseTo(44);
    expect(screen.safeAreaRect).toEqual({ x: 0, y: 44, width: 750, height: 1334 - 44 - 34 });
  });

  it('re-targets a new design resolution without losing the screen size', () => {
    const screen = new ScreenManager(750, 1334, 'contain');
    screen.resize(1000, 1000);
    screen.configure(500, 500, 'contain');

    expect(screen.designWidth).toBe(500);
    expect(screen.screenWidth).toBe(1000);
    expect(screen.resolution.scaleX).toBeCloseTo(2);
  });
});
