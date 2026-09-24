import type { EditorCameraState } from '@pxe/editor-core';

/**
 * The editor camera lives on the *viewport*, never on the scene:
 * `scene.root.scale` must never receive a zoom value. What the camera scales is
 * the device layer, which maps design coordinates onto the simulated screen.
 */
export interface DeviceTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const minZoom = 0.02;
export const maxZoom = 16;

export const identityDeviceTransform: DeviceTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

export function clampZoom(zoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom));
}

export function designToDevice(device: DeviceTransform, x: number, y: number): { x: number; y: number } {
  return { x: x * device.scaleX + device.offsetX, y: y * device.scaleY + device.offsetY };
}

export function deviceToDesign(device: DeviceTransform, x: number, y: number): { x: number; y: number } {
  return { x: (x - device.offsetX) / device.scaleX, y: (y - device.offsetY) / device.scaleY };
}

export function deviceToScreen(
  camera: EditorCameraState,
  viewport: ViewportSize,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - camera.x) * camera.zoom + viewport.width / 2,
    y: (y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToDevice(
  camera: EditorCameraState,
  viewport: ViewportSize,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - viewport.width / 2) / camera.zoom + camera.x,
    y: (y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

export function screenToDesign(
  camera: EditorCameraState,
  viewport: ViewportSize,
  device: DeviceTransform,
  x: number,
  y: number,
): { x: number; y: number } {
  const point = screenToDevice(camera, viewport, x, y);
  return deviceToDesign(device, point.x, point.y);
}

export function designToScreen(
  camera: EditorCameraState,
  viewport: ViewportSize,
  device: DeviceTransform,
  x: number,
  y: number,
): { x: number; y: number } {
  const point = designToDevice(device, x, y);
  return deviceToScreen(camera, viewport, point.x, point.y);
}

/** Camera container placement for a device-space camera. */
export function cameraContainerTransform(
  camera: EditorCameraState,
  viewport: ViewportSize,
): { x: number; y: number; scale: number } {
  return {
    x: viewport.width / 2 - camera.x * camera.zoom,
    y: viewport.height / 2 - camera.y * camera.zoom,
    scale: camera.zoom,
  };
}

/** Visible device-space rectangle for the current camera. */
export function visibleDeviceRect(camera: EditorCameraState, viewport: ViewportSize): Rect {
  const topLeft = screenToDevice(camera, viewport, 0, 0);
  const bottomRight = screenToDevice(camera, viewport, viewport.width, viewport.height);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/** Zoom keeping the device point under `anchor` (screen px) fixed. */
export function zoomAt(
  camera: EditorCameraState,
  viewport: ViewportSize,
  anchor: { x: number; y: number },
  nextZoom: number,
): EditorCameraState {
  const zoom = clampZoom(nextZoom);
  const focus = screenToDevice(camera, viewport, anchor.x, anchor.y);

  return {
    zoom,
    x: focus.x - (anchor.x - viewport.width / 2) / zoom,
    y: focus.y - (anchor.y - viewport.height / 2) / zoom,
  };
}

export function panCamera(
  camera: EditorCameraState,
  deltaScreenX: number,
  deltaScreenY: number,
): EditorCameraState {
  return {
    ...camera,
    x: camera.x - deltaScreenX / camera.zoom,
    y: camera.y - deltaScreenY / camera.zoom,
  };
}

/** Frames a device-space rect. */
export function frameRect(
  rect: Rect,
  viewport: ViewportSize,
  options: { padding?: number; keepZoom?: number; minZoomLimit?: number; maxZoomLimit?: number } = {},
): EditorCameraState {
  const padding = options.padding ?? 48;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const fit = Math.min(
    (viewport.width - padding * 2) / width,
    (viewport.height - padding * 2) / height,
  );
  const zoom = clampZoom(
    Math.max(
      options.minZoomLimit ?? minZoom,
      Math.min(options.maxZoomLimit ?? maxZoom, options.keepZoom ?? fit),
    ),
  );

  return {
    zoom,
    x: rect.x + width / 2,
    y: rect.y + height / 2,
  };
}

export function deviceRectOfDesignRect(device: DeviceTransform, rect: Rect): Rect {
  const topLeft = designToDevice(device, rect.x, rect.y);
  const bottomRight = designToDevice(device, rect.x + rect.width, rect.y + rect.height);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export const zoomSteps = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    return clampZoom(zoomSteps.find((step) => step > current + 1e-6) ?? current * 1.25);
  }

  return clampZoom([...zoomSteps].reverse().find((step) => step < current - 1e-6) ?? current / 1.25);
}
