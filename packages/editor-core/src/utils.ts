import type { ComponentData, NodeData, SceneData, SceneSettings } from '@pxe/schema';
import { normalizeRootTransform, canvasNodeName, createDefaultSceneSettings, createDefaultTransform, createId, defaultLayer } from '@pxe/schema';
import type { ComponentLocation, NodeLocation } from './types';

export function cloneSceneData(data: SceneData): SceneData {
  return structuredClone(data);
}

export function createEmptyNode(name = 'Node', overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: createId('node'),
    name,
    active: true,
    layer: defaultLayer,
    zIndex: 0,
    transform: createDefaultTransform(),
    components: [],
    children: [],
    ...overrides,
  };
}

/**
 * The scene root node: the design space root of the scene.
 *
 * It cannot be deleted, reparented or duplicated, and its size always matches
 * `scene.settings.designWidth × designHeight`.
 */
export function createCanvasNode(
  settings: SceneSettings = createDefaultSceneSettings(),
  overrides: Partial<NodeData> = {},
): NodeData {
  const root = createEmptyNode(canvasNodeName, {
    id: 'canvas',
    transform: createDefaultTransform({
      width: settings.designWidth,
      height: settings.designHeight,
    }),
    ...overrides,
  });
  normalizeRootTransform(root, settings);
  return root;
}

export function isSceneRoot(root: NodeData, nodeId: string | null): boolean {
  return nodeId === root.id;
}

export function findParentNode(root: NodeData, nodeId: string): NodeData | null {
  return findNode(root, nodeId)?.parent ?? null;
}

export function getNodePath(root: NodeData, nodeId: string): string {
  const walk = (node: NodeData, path: string): string | null => {
    if (node.id === nodeId) {
      return path;
    }

    for (const child of node.children) {
      const found = walk(child, `${path}/${child.name}`);

      if (found) {
        return found;
      }
    }

    return null;
  };

  return walk(root, root.name) ?? nodeId;
}


export function createComponentData(type: string, props: Record<string, unknown> = {}): ComponentData {
  return {
    id: createId('component'),
    type,
    enabled: true,
    props,
  };
}

export function visitNodes(root: NodeData, visitor: (node: NodeData, parent: NodeData | null) => void): void {
  const walk = (node: NodeData, parent: NodeData | null): void => {
    visitor(node, parent);
    for (const child of node.children) {
      walk(child, node);
    }
  };

  walk(root, null);
}

export function findNode(root: NodeData, nodeId: string): NodeLocation | null {
  if (root.id === nodeId) {
    return { parent: null, node: root, index: 0 };
  }

  const stack: NodeData[] = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const index = current.children.findIndex((child) => child.id === nodeId);

    if (index >= 0) {
      return { parent: current, node: current.children[index]!, index };
    }

    for (const child of current.children) {
      stack.push(child);
    }
  }

  return null;
}

export function findComponent(root: NodeData, componentId: string): ComponentLocation | null {
  let found: ComponentLocation | null = null;

  visitNodes(root, (node) => {
    if (found) {
      return;
    }

    const index = node.components.findIndex((component) => component.id === componentId);
    if (index >= 0) {
      found = { node, component: node.components[index]!, index };
    }
  });

  return found;
}

export function removeNode(root: NodeData, nodeId: string): NodeLocation | null {
  const location = findNode(root, nodeId);

  if (!location || !location.parent) {
    return null;
  }

  const [node] = location.parent.children.splice(location.index, 1);
  return node ? { ...location, node } : null;
}

export function insertNode(parent: NodeData, node: NodeData, index = parent.children.length): void {
  parent.children.splice(clampIndex(index, parent.children.length), 0, node);
}

export function isDescendant(root: NodeData, possibleAncestorId: string, possibleDescendantId: string): boolean {
  const ancestor = findNode(root, possibleAncestorId)?.node;

  if (!ancestor) {
    return false;
  }

  let result = false;
  visitNodes(ancestor, (node) => {
    if (node.id === possibleDescendantId) {
      result = true;
    }
  });

  return result;
}

export function duplicateNodeData(node: NodeData): NodeData {
  const idMap = new Map<string, string>();
  const componentIdMap = new Map<string, string>();
  const clone = structuredClone(node);

  visitNodes(clone, (item) => {
    const oldId = item.id;
    item.id = createId('node');
    idMap.set(oldId, item.id);

    for (const component of item.components) {
      const oldComponentId = component.id;
      component.id = createId('component');
      componentIdMap.set(oldComponentId, component.id);
    }
  });
  visitNodes(clone, (item) => {
    for (const component of item.components) remapNodeRefs(component.props, idMap, componentIdMap);
  });

  return clone;
}

function remapNodeRefs(value: unknown, idMap: Map<string, string>, componentIdMap: Map<string, string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }

  if ('nodeId' in value) {
    const ref = value as { nodeId: unknown };
    if (typeof ref.nodeId === 'string' && idMap.has(ref.nodeId)) {
      ref.nodeId = idMap.get(ref.nodeId)!;
      if ('componentId' in value && typeof value.componentId === 'string' && componentIdMap.has(value.componentId)) {
        value.componentId = componentIdMap.get(value.componentId)!;
      }
    }
  }

  for (const child of Object.values(value)) {
    remapNodeRefs(child, idMap, componentIdMap);
  }
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}
