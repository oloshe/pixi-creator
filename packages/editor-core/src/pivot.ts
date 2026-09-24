import type { RectTransformData } from '@pxe/schema';

/** Keep every local point fixed in parent space when changing the pivot. */
export function pivotWithCompensation(
  transform: RectTransformData,
  pivotX: number,
  pivotY: number,
): RectTransformData {
  const dx = (pivotX - transform.pivotX) * transform.scaleX;
  const dy = (pivotY - transform.pivotY) * transform.scaleY;
  const angle = transform.rotationDeg * Math.PI / 180;
  return {
    ...transform, pivotX, pivotY,
    x: transform.x + Math.cos(angle) * dx - Math.sin(angle) * dy,
    y: transform.y + Math.sin(angle) * dx + Math.cos(angle) * dy,
  };
}
