/**
 * Anchor based layout operating on the node
 * RectTransform model.
 *
 * Layout is resolved in the parent's local space, whose origin is the parent's
 * top-left corner with +Y pointing down, and against the *unrotated* rectangle
 * of the node. `pivotX` / `pivotY` are pixel offsets within the node rect.
 */
export interface UISize {
  width: number;
  height: number;
}

export interface UIAnchorSettings {
  anchorLeft: boolean;
  anchorRight: boolean;
  anchorTop: boolean;
  anchorBottom: boolean;

  left: number;
  right: number;
  top: number;
  bottom: number;

  centerX: boolean;
  centerY: boolean;

  offsetX: number;
  offsetY: number;
}

export interface AnchorTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  pivotX: number;
  pivotY: number;
}

export interface AnchorResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const defaultUISize: UISize = { width: 160, height: 100 };

export const defaultUIAnchor: UIAnchorSettings = {
  anchorLeft: false,
  anchorRight: false,
  anchorTop: false,
  anchorBottom: false,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  centerX: false,
  centerY: false,
  offsetX: 0,
  offsetY: 0,
};

export function calculateAnchorLayout(
  parent: UISize,
  size: UISize,
  anchor: UIAnchorSettings,
  transform: AnchorTransform,
): AnchorResult {
  const x = axis(
    parent.width,
    size.width,
    transform.scaleX,
    transform.pivotX,
    transform.x,
    anchor.anchorLeft,
    anchor.anchorRight,
    anchor.centerX,
    anchor.left,
    anchor.right,
    anchor.offsetX,
  );
  const y = axis(
    parent.height,
    size.height,
    transform.scaleY,
    transform.pivotY,
    transform.y,
    anchor.anchorTop,
    anchor.anchorBottom,
    anchor.centerY,
    anchor.top,
    anchor.bottom,
    anchor.offsetY,
  );

  return { x: x.position, y: y.position, width: x.length, height: y.length };
}

function axis(
  parentSize: number,
  length: number,
  scale: number,
  pivot: number,
  position: number,
  anchorStart: boolean,
  anchorEnd: boolean,
  center: boolean,
  startMargin: number,
  endMargin: number,
  offset: number,
): { position: number; length: number } {
  const magnitude = Math.abs(scale);
  let extent = length * magnitude;
  let nextLength = length;
  let left: number;

  // Opposite edges take precedence over centering and stretch the size.
  if (anchorStart && anchorEnd) {
    extent = Math.max(0, parentSize - startMargin - endMargin);
    nextLength = magnitude === 0 ? length : extent / magnitude;
    left = startMargin;
  } else if (anchorStart) {
    left = startMargin;
  } else if (anchorEnd) {
    left = parentSize - endMargin - extent;
  } else if (center) {
    left = parentSize / 2 + offset - extent / 2;
  } else {
    return { position, length };
  }

  // A negative scale mirrors the rectangle around the pivot. `nextLength` is the
  // node's logical length after any stretch, so the pixel pivot stays fixed.
  const effectivePivot = scale < 0 ? nextLength - pivot : pivot;
  return { position: left + effectivePivot * magnitude, length: nextLength };
}
