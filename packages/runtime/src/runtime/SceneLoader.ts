import type { ComponentData, NodeData, SceneData } from '@pxe/schema';
import { normalizeRootTransform, parseSceneData } from '@pxe/schema';
import { buildLayerOrder } from '@pxe/rendering';
import { ComponentRegistry } from './ComponentRegistry';
import type { Component } from './Component';
import type { AssetManager } from './AssetManager';
import { createResolutionInfo, GameNode } from './GameNode';
import { LayoutSystem } from './LayoutSystem';
import { MissingComponent } from './MissingComponent';
import { Scene } from './Scene';
import { syncUI } from './ui/syncUI';

export { buildLayerOrder };

export class SceneLoader {
  constructor(
    private readonly componentRegistry: ComponentRegistry,
    private readonly assetManager: AssetManager,
  ) {}

  async load(data: SceneData): Promise<Scene> {
    const sceneData = parseSceneData(data);
    normalizeRootTransform(sceneData.root, sceneData.settings);
    await this.assetManager.loadScenePreload(sceneData.id);

    const layout = new LayoutSystem();
    const layerOrder = buildLayerOrder(sceneData.root);
    const nodes = new Map<string, GameNode>();
    const sceneOrder = flattenNodes(sceneData.root);
    // One shared object for the whole scene, mirroring how `layout` is shared.
    const resolution = createResolutionInfo(sceneData.settings.designWidth, sceneData.settings.designHeight);

    for (const nodeData of sceneOrder) {
      if (nodes.has(nodeData.id)) {
        throw new Error(`Duplicate node id: ${nodeData.id}`);
      }

      const node = new GameNode(nodeData.id, nodeData.name);
      node.active = nodeData.active;
      node.applyTransform(nodeData.transform);
      node.layer = nodeData.layer ?? null;
      node.layerOrder = nodeData.layer ? layerOrder.get(nodeData.layer) ?? 0 : 0;
      node.zIndex = nodeData.zIndex;
      node.layout = layout;
      node.resolution = resolution;
      nodes.set(node.id, node);
    }

    for (const nodeData of sceneOrder) {
      const node = requiredNode(nodes, nodeData.id);

      for (const childData of nodeData.children) {
        node.addChild(requiredNode(nodes, childData.id));
      }
    }

    // The scene root *is* the design space: it always matches the scene canvas.
    const root = requiredNode(nodes, sceneData.root.id);
    root.setSize(sceneData.settings.designWidth, sceneData.settings.designHeight);

    const components: Component[] = [];

    for (const nodeData of sceneOrder) {
      const node = requiredNode(nodes, nodeData.id);

      for (const componentData of nodeData.components) {
        if (components.some((component) => component.id === componentData.id)) throw new Error(`Duplicate component id: ${componentData.id}`);
        const component = createComponent(this.componentRegistry, componentData);
        component.setRuntimeId(componentData.id);
        component.enabled = componentData.enabled;
        injectAssetManager(component, this.assetManager);

        if (!(component instanceof MissingComponent)) {
          Object.assign(component, componentData.props);
        }

        node.addComponent(component);
        components.push(component);
      }
    }

    const componentsById = new Map(components.map((component) => [component.id, component]));
    for (const nodeData of sceneOrder) {
      for (const data of nodeData.components) {
        const instance = componentsById.get(data.id)!;
        const definition = this.componentRegistry.get(data.type);
        if (!definition) continue;
        for (const [key, property] of Object.entries(definition.properties)) {
          const value = data.props[key];
          if (property.type === 'nodeRef' || property.type === 'componentRef') {
            const ref = value as { nodeId?: string; componentId?: string } | null | undefined;
            let resolved: unknown = null;
            if (ref?.nodeId) {
              const target = nodes.get(ref.nodeId);
              if (property.type === 'nodeRef') resolved = target ?? null;
              else if (ref.componentId) {
                const candidate = componentsById.get(ref.componentId);
                const targetData = sceneOrder.find((node) => node.id === ref.nodeId)?.components.find((item) => item.id === ref.componentId);
                if (target && candidate?.node === target && (!property.componentType || targetData?.type === property.componentType)) resolved = candidate;
              }
            }
            Object.assign(instance, { [key]: resolved });
          }
        }
      }
    }

    for (const component of components) {
      await component.onLoad?.();
    }

    root.refreshActiveInHierarchy();

    for (const component of components) {
      if (component.enabled && component.node.activeInHierarchy) {
        component.onEnable?.();
      }
    }

    layout.markSubtreeDirty(root);
    layout.flush();
    syncUI(root);

    return new Scene(sceneData, root, nodes, components, layout, resolution);
  }
}

function createComponent(registry: ComponentRegistry, data: ComponentData) {
  const component = registry.create(data.type);

  if (component instanceof MissingComponent) {
    return new MissingComponent(data.type, data.props);
  }

  return component;
}

function injectAssetManager(component: unknown, assetManager: AssetManager): void {
  if (
    component &&
    typeof component === 'object' &&
    'setAssetManager' in component &&
    typeof component.setAssetManager === 'function'
  ) {
    component.setAssetManager(assetManager);
  }
}

function flattenNodes(root: NodeData): NodeData[] {
  const nodes = [root];

  for (const child of root.children) {
    nodes.push(...flattenNodes(child));
  }

  return nodes;
}

function requiredNode(nodes: Map<string, GameNode>, id: string): GameNode {
  const node = nodes.get(id);

  if (!node) {
    throw new Error(`Missing node: ${id}`);
  }

  return node;
}
