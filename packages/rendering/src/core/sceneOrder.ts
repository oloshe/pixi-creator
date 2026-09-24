import { defaultLayers, type NodeData } from '@pxe/schema';

/**
 * Layer bucket → sort rank.
 *
 * Layer buckets follow {@link defaultLayers}; unknown names are appended in
 * document order. Shared so the editor preview stacks nodes exactly like the
 * runtime does.
 */
export function buildLayerOrder(root: NodeData): Map<string, number> {
  const order = new Map<string, number>();
  defaultLayers.forEach((name, index) => order.set(name, index));

  const visit = (node: NodeData): void => {
    if (node.layer && !order.has(node.layer)) {
      order.set(node.layer, order.size);
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return order;
}

/**
 * Pixi `zIndex` for a node: the layer bucket dominates, `zIndex` breaks ties
 * inside a bucket. Both the preview tree and `GameNode` use this formula.
 */
export function renderSortKey(layerOrder: number, zIndex: number): number {
  return layerOrder * 1_000_000 + zIndex;
}

/** Sort rank of a node's `layer` string, defaulting to bucket 0. */
export function layerOrderOf(layer: string | undefined, order: ReadonlyMap<string, number>): number {
  return layer ? order.get(layer) ?? 0 : 0;
}
