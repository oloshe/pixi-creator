import type { NodeData, RectTransformData } from '@pxe/schema';
import { rectOfTransform } from '@pxe/rendering';
import {
  UIAnchor,
  defaultUIAnchor,
  calculateAnchorLayout,
  type UIAnchorSettings,
} from '@pxe/runtime';
import type { Rect } from './viewport';

export interface NodeSize {
  width: number;
  height: number;
}

/**
 * RectTransform of a node expressed in its parent's local space.
 *
 * Delegates to the shared `rectOfTransform` in `@pxe/rendering` so the editor's
 * bounds, snapping and selection use exactly the runtime's rectangle maths.
 */
export function nodeRect(transform: RectTransformData): Rect {
  return rectOfTransform(transform);
}

export function getAnchorSettings(node: NodeData): UIAnchorSettings | null {
  const anchor = node.components.find((item) => item.type === UIAnchor.componentType && item.enabled);

  if (anchor) {
    return { ...defaultUIAnchor, ...anchor.props } as UIAnchorSettings;
  }

  return null;
}

/**
 * Anchor layout preview.
 *
 * Uses the runtime's own `calculateAnchorLayout`, so a node anchored under UI
 * Anchor resolves to the same rect in the editor and in Play. It must never write
 * computed values back into the SceneDocument: the returned tree is a clone,
 * exactly like the runtime resolves it in `LayoutSystem`.
 */
export function layoutPreview(root: NodeData): NodeData {
  const preview = structuredClone(root);
  visit(preview, null);
  return preview;
}

function visit(node: NodeData, parent: NodeData | null): void {
  const anchor = getAnchorSettings(node);

  if (anchor && parent && node.active) {
    const result = calculateAnchorLayout(
      { width: parent.transform.width, height: parent.transform.height },
      { width: node.transform.width, height: node.transform.height },
      anchor,
      node.transform,
    );

    // Axes without an enabled edge or centre come back unchanged.
    node.transform.x = result.x;
    node.transform.y = result.y;
    node.transform.width = result.width;
    node.transform.height = result.height;
  }

  for (const child of node.children) {
    visit(child, node);
  }
}

export function findNodeInTree(root: NodeData, nodeId: string | null): NodeData | null {
  if (!nodeId) {
    return null;
  }

  if (root.id === nodeId) {
    return root;
  }

  for (const child of root.children) {
    const found = findNodeInTree(child, nodeId);

    if (found) {
      return found;
    }
  }

  return null;
}

/** 2D affine matrix `[a, b, c, d, tx, ty]`, same layout as Pixi's `Matrix`. */
export type Matrix2D = [number, number, number, number, number, number];

export const identityMatrix: Matrix2D = [1, 0, 0, 1, 0, 0];

export function multiplyMatrix(parent: Matrix2D, child: Matrix2D): Matrix2D {
  return [
    parent[0] * child[0] + parent[2] * child[1],
    parent[1] * child[0] + parent[3] * child[1],
    parent[0] * child[2] + parent[2] * child[3],
    parent[1] * child[2] + parent[3] * child[3],
    parent[0] * child[4] + parent[2] * child[5] + parent[4],
    parent[1] * child[4] + parent[3] * child[5] + parent[5],
  ];
}

export function applyMatrix(matrix: Matrix2D, x: number, y: number): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

/** Node local rect (0,0 → width,height) to parent space. */
export function nodeMatrix(transform: RectTransformData): Matrix2D {
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [
    cos * transform.scaleX,
    sin * transform.scaleX,
    -sin * transform.scaleY,
    cos * transform.scaleY,
    transform.x - (cos * transform.scaleX * transform.pivotX) + (sin * transform.scaleY * transform.pivotY),
    transform.y - (sin * transform.scaleX * transform.pivotX) - (cos * transform.scaleY * transform.pivotY),
  ];
}

/** Union of every node rectangle, resolved to artboard (design) space. */
export function contentBounds(root: NodeData): Rect {
  const preview = layoutPreview(root);
  let minX = 0;
  let minY = 0;
  let maxX = preview.transform.width;
  let maxY = preview.transform.height;

  const visit = (node: NodeData, parent: Matrix2D): void => {
    const local = nodeMatrix(node.transform);
    const matrix = multiplyMatrix(parent, local);

    for (const corner of [
      { x: 0, y: 0 },
      { x: node.transform.width, y: 0 },
      { x: 0, y: node.transform.height },
      { x: node.transform.width, y: node.transform.height },
    ]) {
      const point = applyMatrix(matrix, corner.x, corner.y);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    for (const child of node.children) {
      visit(child, matrix);
    }
  };

  for (const child of preview.children) {
    visit(child, identityMatrix);
  }

  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Design-space bounds of a single node, used by Frame Selected. */
export function nodeBounds(root: NodeData, nodeId: string): Rect | null {
  const preview = layoutPreview(root);
  let found: Rect | null = null;

  const visit = (node: NodeData, parent: Matrix2D): void => {
    if (found) {
      return;
    }

    const matrix = multiplyMatrix(parent, nodeMatrix(node.transform));

    if (node.id === nodeId) {
      const points = [
        { x: 0, y: 0 },
        { x: node.transform.width, y: 0 },
        { x: 0, y: node.transform.height },
        { x: node.transform.width, y: node.transform.height },
      ].map((corner) => applyMatrix(matrix, corner.x, corner.y));
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);

      found = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      return;
    }

    for (const child of node.children) {
      visit(child, matrix);
    }
  };

  visit(preview, identityMatrix);
  return found;
}
