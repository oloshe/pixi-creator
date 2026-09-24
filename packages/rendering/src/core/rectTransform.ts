import type { RectTransformData } from '@pxe/schema';
import type { Container } from 'pixi.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Pixi pivot in local pixel units — `pivotX` / `pivotY` are already pixels.
 *
 * This is the only place the engine hands a pivot to Pixi: the editor and the
 * runtime both go through it, so a node can never look different in the two.
 */
export function pixelPivot(
  transform: Pick<RectTransformData, 'pivotX' | 'pivotY'>,
): { x: number; y: number } {
  return {
    x: transform.pivotX,
    y: transform.pivotY,
  };
}

/**
 * Mirror-aware pixel pivot.
 *
 * A negatively scaled axis flips the rect, so the pivot offset from the visual
 * top-left edge becomes `size - pivot`.
 */
export function effectivePivot(scale: number, pivot: number, size: number): number {
  return scale < 0 ? size - pivot : pivot;
}

/** Effective size of the node in the parent's local space, in design units. */
export function rectSize(transform: RectTransformData): { width: number; height: number } {
  return {
    width: transform.width * Math.abs(transform.scaleX),
    height: transform.height * Math.abs(transform.scaleY),
  };
}

/**
 * Unrotated rect of a node in its parent's local space.
 *
 * Shared by `GameNode.getRect()` and the editor preview so bounds, snapping and
 * selection agree everywhere.
 */
export function rectOfTransform(transform: RectTransformData): Rect {
  const { width, height } = rectSize(transform);

  return {
    x: transform.x - effectivePivot(transform.scaleX, transform.pivotX, transform.width) * Math.abs(transform.scaleX),
    y: transform.y - effectivePivot(transform.scaleY, transform.pivotY, transform.height) * Math.abs(transform.scaleY),
    width,
    height,
  };
}

/**
 * Writes a RectTransform onto a node container.
 *
 * Every node — editor preview or runtime `GameNode` — goes through this, so
 * position, scale, rotation and pivot can never drift apart between the two.
 */
export function applyRectTransform(container: Container, transform: RectTransformData): void {
  container.position.set(transform.x, transform.y);
  container.scale.set(transform.scaleX, transform.scaleY);
  container.rotation = degToRad(transform.rotationDeg);

  const pivot = pixelPivot(transform);
  container.pivot.set(pivot.x, pivot.y);
  container.alpha = transform.alpha;
}
