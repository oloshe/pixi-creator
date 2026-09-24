import { describe, expect, it } from 'vitest';
import { createDefaultSceneSettings } from '@pxe/schema';
import { computeDevicePreview, getDevicePreset } from './devicePreview';
import { collectGuides, measureSpacing, snapRectToGuides } from './guides';
import { positionStep, snapPosition, snapRotation, snapScale, snapValue } from './snapping';
import {
  cameraContainerTransform,
  clampZoom,
  designToDevice,
  designToScreen,
  deviceRectOfDesignRect,
  deviceToDesign,
  frameRect,
  panCamera,
  screenToDesign,
  screenToDevice,
  visibleDeviceRect,
  zoomAt,
} from './viewport';

const settings = createDefaultSceneSettings({ designWidth: 750, designHeight: 1334 });

describe('Device preview', () => {
  it('Design mode is a 1:1 mapping and draws no frame', () => {
    const preview = computeDevicePreview(settings, getDevicePreset('design'));

    expect(preview.active).toBe(false);
    expect(preview.screenWidth).toBe(750);
    expect(preview.transform).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 });
  });

  it('does not change the design resolution', () => {
    const preview = computeDevicePreview(settings, getDevicePreset('iphone-14'));

    expect(settings.designWidth).toBe(750);
    expect(settings.designHeight).toBe(1334);
    expect(preview.screenWidth).toBe(390);
    expect(preview.screenHeight).toBe(844);
  });

  it('shows contain letterboxing', () => {
    const preview = computeDevicePreview(settings, getDevicePreset('iphone-14'));

    expect(preview.transform.scaleX).toBeCloseTo(390 / 750);
    expect(preview.transform.offsetY).toBeGreaterThan(0);
  });

  it('shows cover cropping', () => {
    const preview = computeDevicePreview({ ...settings, resizeMode: 'cover' }, getDevicePreset('iphone-14'));

    expect(preview.transform.scaleX).toBeCloseTo(844 / 1334);
    expect(preview.transform.offsetX).toBeLessThan(0);
    expect(preview.transform.offsetY).toBeCloseTo(0);
  });

  it('shows the extra fixed-width area on a taller screen', () => {
    const tall = { id: 'custom', label: 'Custom', width: 750, height: 1624 };
    const preview = computeDevicePreview({ ...settings, resizeMode: 'fixed-width' }, tall);

    expect(preview.transform.scaleY).toBeCloseTo(1);
    expect(preview.transform.offsetX).toBeCloseTo(0);
    // 1624 logical pixels of height are visible instead of 1334.
    expect(preview.resolution.visibleDesignHeight).toBeCloseTo(1624);
    expect(preview.transform.offsetY).toBeCloseTo((1624 - 1334) / 2);
  });
});

describe('Viewport camera', () => {
  const viewport = { width: 1000, height: 800 };

  it('maps design → device → screen and back', () => {
    const device = { scaleX: 0.5, scaleY: 0.5, offsetX: 10, offsetY: 20 };
    const camera = { x: 100, y: 100, zoom: 2 };

    expect(designToDevice(device, 200, 300)).toEqual({ x: 110, y: 170 });
    expect(deviceToDesign(device, 110, 170)).toEqual({ x: 200, y: 300 });

    const screen = designToScreen(camera, viewport, device, 200, 300);
    const roundTrip = screenToDesign(camera, viewport, device, screen.x, screen.y);
    expect(roundTrip.x).toBeCloseTo(200);
    expect(roundTrip.y).toBeCloseTo(300);
  });

  it('places the camera container so the camera point lands in the middle', () => {
    const camera = { x: 100, y: 200, zoom: 0.5 };
    const transform = cameraContainerTransform(camera, viewport);

    expect(transform).toEqual({ x: 500 - 50, y: 400 - 100, scale: 0.5 });
  });

  it('zooms around the pointer anchor', () => {
    const camera = { x: 0, y: 0, zoom: 1 };
    const anchor = { x: 250, y: 300 };
    const before = screenToDevice(camera, viewport, anchor.x, anchor.y);
    const zoomed = zoomAt(camera, viewport, anchor, 2);
    const after = screenToDevice(zoomed, viewport, anchor.x, anchor.y);

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('pans in device units and clamps the zoom', () => {
    const camera = { x: 0, y: 0, zoom: 4 };
    expect(panCamera(camera, 40, -80)).toEqual({ x: -10, y: 20, zoom: 4 });
    expect(clampZoom(1000)).toBeLessThanOrEqual(16);
    expect(clampZoom(0.0000001)).toBeGreaterThanOrEqual(0.02);
  });

  it('frames a device-space rect with padding', () => {
    const framed = frameRect({ x: 0, y: 0, width: 750, height: 1334 }, viewport, { padding: 48 });

    expect(framed.x).toBe(375);
    expect(framed.y).toBe(667);
    expect(framed.zoom).toBeLessThan(1);
  });

  it('reports the visible device rect', () => {
    const visible = visibleDeviceRect({ x: 0, y: 0, zoom: 1 }, viewport);
    expect(visible).toEqual({ x: -500, y: -400, width: 1000, height: 800 });
  });

  it('maps a design rect into device space', () => {
    const rect = deviceRectOfDesignRect({ scaleX: 0.5, scaleY: 0.5, offsetX: 5, offsetY: 7 }, { x: 0, y: 0, width: 750, height: 1334 });
    expect(rect).toEqual({ x: 5, y: 7, width: 375, height: 667 });
  });
});

describe('Snapping', () => {
  const config = { enabled: true, position: 10, rotation: 15, scale: 0.1, snapToGrid: false, gridSize: 4 };

  it('snaps to the explicit position step and otherwise to the grid', () => {
    expect(snapValue(23, 10)).toBe(20);
    expect(positionStep(config)).toBe(10);
    expect(positionStep({ ...config, enabled: false, snapToGrid: true })).toBe(4);
    expect(positionStep({ ...config, enabled: false, snapToGrid: false })).toBe(0);
    expect(snapPosition(23, config)).toBe(20);
  });

  it('inverts snapping while Ctrl/Cmd is held', () => {
    expect(positionStep(config, true)).toBe(0);
    expect(positionStep({ ...config, enabled: false, snapToGrid: false }, true)).toBe(10);
  });

  it('snaps rotation and scale steps', () => {
    expect(snapRotation(52, config)).toBe(45);
    expect(snapScale(1.24, config)).toBeCloseTo(1.2);
  });
});

describe('Smart guides', () => {
  const parent = { x: 0, y: 0, width: 750, height: 1334 };

  it('snaps to the parent centre line', () => {
    const rect = { x: 250, y: 100, width: 200, height: 100 };
    const result = snapRectToGuides(rect, collectGuides(parent, [], rect), 10);

    // Centre of the rect is 350, parent centre is 375 → snap by 25 is beyond
    // the threshold, so shift the rect closer first.
    expect(result.rect.x).toBe(250);

    const closer = { x: 271, y: 100, width: 200, height: 100 };
    const snapped = snapRectToGuides(closer, collectGuides(parent, [], closer), 10);
    expect(snapped.rect.x).toBe(275);
    expect(snapped.lines.some((line) => line.axis === 'x' && line.kind === 'center')).toBe(true);
  });

  it('aligns edges with siblings', () => {
    const sibling = { x: 100, y: 400, width: 100, height: 100 };
    const rect = { x: 104, y: 100, width: 100, height: 100 };
    const result = snapRectToGuides(rect, collectGuides(parent, [sibling], rect), 6);

    expect(result.rect.x).toBe(100);
  });

  it('measures the nearest gap to a sibling', () => {
    const sibling = { x: 300, y: 100, width: 100, height: 100 };
    const rect = { x: 100, y: 100, width: 100, height: 100 };
    const spacing = measureSpacing(rect, [sibling]);

    expect(spacing).toEqual([{ axis: 'x', gap: 100, from: 200, to: 300 }]);
  });
});
