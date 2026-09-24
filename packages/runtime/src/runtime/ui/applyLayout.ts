import type { GameNode } from '../GameNode';
import {
  calculateAnchorLayout,
  type UIAnchorSettings,
} from './layout';

/** Resolves one node against its parent's RectTransform. */
export function applyAnchorLayout(node: GameNode, anchor: UIAnchorSettings): void {
  const parent = node.parent;

  if (!parent) {
    return;
  }

  const result = calculateAnchorLayout(
    { width: parent.width, height: parent.height },
    { width: node.width, height: node.height },
    anchor,
    {
      x: node.x,
      y: node.y,
      scaleX: node.scaleX,
      scaleY: node.scaleY,
      pivotX: node.pivotX,
      pivotY: node.pivotY,
    },
  );

  node.x = result.x;
  node.y = result.y;
  node.setSize(result.width, result.height);
}

