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
 * Normalized pivot (`0 → 1`) to Pixi pivot in local, unscaled units.
 *
 * This is the only place the engine converts a pivot: the editor and the runtime
 * both go through it, so a node can never look different in the two.
 */
export function pixelPivot(
  transform: Pick<RectTransformData, 'width' | 'height' | 'pivotX' | 'pivotY'>,
): { x: number; y: number } {
  return {
    x: transform.width * transform.pivotX,
    y: transform.height * transform.pivotY,
  };
}

/**
 * Mirror-aware normalized pivot.
 *
 * A negatively scaled axis flips the rect, so the pivot that lands on the same
 * visual corner becomes `1 - pivot`.
 */
export function effectivePivot(scale: number, pivot: number): number {
  return scale < 0 ? 1 - pivot : pivot;
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
    x: transform.x - effectivePivot(transform.scaleX, transform.pivotX) * width,
    y: transform.y - effectivePivot(transform.scaleY, transform.pivotY) * height,
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
