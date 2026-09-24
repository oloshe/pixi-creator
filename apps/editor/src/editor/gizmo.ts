/**
 * Pure math for the Cocos-style transform gizmos (move axes, rotate ring, scale
 * handles). Kept free of Pixi/React so the constraints are unit-testable; the
 * viewport feeds them screen/parent-local coordinates.
 */

export type GizmoHandle =
  | 'move-x'
  | 'move-y'
  | 'move-center'
  | 'rotate-ring'
  | 'scale-x'
  | 'scale-y'
  | 'scale-uniform';

export const GIZMO_AXIS_LENGTH = 56;
export const GIZMO_ROTATE_RADIUS = 60;
export const GIZMO_HIT_TOLERANCE = 8;
export const GIZMO_CENTER_RADIUS = 10;

export interface Vector2 {
  x: number;
  y: number;
}

/** Node-local X/Y unit vectors in parent-local 2D space for a rotation (degrees). */
export function axisVectors(rotationDeg: number): { x: Vector2; y: Vector2 } {
  const angle = (rotationDeg * Math.PI) / 180;
  return {
    x: { x: Math.cos(angle), y: Math.sin(angle) },
    y: { x: -Math.sin(angle), y: Math.cos(angle) },
  };
}

export function dot(a: Vector2, b: Vector2): number {
  return a.x * b.x + a.y * b.y;
}

export function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Signed projection of `delta` onto a unit `axis`. */
export function projectOntoAxis(delta: Vector2, axis: Vector2): number {
  return dot(delta, axis);
}

/** Distance from `point` to the segment `a → b`. */
export function pointToSegmentDistance(point: Vector2, a: Vector2, b: Vector2): number {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const lengthSq = ab.x * ab.x + ab.y * ab.y;

  if (lengthSq === 0) {
    return distance(point, a);
  }

  const t = Math.max(0, Math.min(1, dot({ x: point.x - a.x, y: point.y - a.y }, ab) / lengthSq));
  return distance(point, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

/** True when `pointer` lies on the rotation ring (annulus around `center`). */
export function ringHit(pointer: Vector2, center: Vector2, radius: number, tolerance = GIZMO_HIT_TOLERANCE): boolean {
  return Math.abs(distance(pointer, center) - radius) <= tolerance;
}

/** Uniform scale factor from a start/current distance to the pivot. */
export function uniformScaleRatio(
  pivot: Vector2,
  start: Vector2,
  current: Vector2,
): number {
  const startDistance = Math.max(1, distance(start, pivot));
  const currentDistance = Math.max(1, distance(current, pivot));
  return currentDistance / startDistance;
}

/** Axis scale factor from a start/current projection onto the axis from the pivot. */
export function axisScaleRatio(
  pivot: Vector2,
  start: Vector2,
  current: Vector2,
  axis: Vector2,
): number {
  const startProj = projectOntoAxis({ x: start.x - pivot.x, y: start.y - pivot.y }, axis);
  const currentProj = projectOntoAxis({ x: current.x - pivot.x, y: current.y - pivot.y }, axis);
  return Math.abs(startProj) < 0.0001 ? 1 : currentProj / startProj;
}
