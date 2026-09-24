import type { ComponentData, NodeData } from '@pxe/schema';

export function findNode(root: NodeData, nodeId: string | null): NodeData | null {
  if (!nodeId) {
    return null;
  }

  if (root.id === nodeId) {
    return root;
  }

  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function listComponents(node: NodeData | null): ComponentData[] {
  return node?.components ?? [];
}
