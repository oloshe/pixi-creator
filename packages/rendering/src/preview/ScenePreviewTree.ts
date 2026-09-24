import type { NodeData, SceneData } from '@pxe/schema';
import { Container } from 'pixi.js';
import type { AssetResolver, RenderContext, RenderMode, ResolutionInfo } from '../core/RendererView';
import type { RendererRegistry } from '../core/RendererRegistry';
import { buildLayerOrder, layerOrderOf } from '../core/sceneOrder';
import {
  createPreviewSyncStats,
  defaultPreviewNodeState,
  PreviewNode,
  type PreviewNodeState,
  type PreviewSyncStats,
} from './PreviewNode';

export interface ScenePreviewSyncOptions {
  mode: RenderMode;
  assets: AssetResolver;
  resolution: ResolutionInfo;
  /** Editor-only metadata (lock / hide); never written back to the scene. */
  nodeState?(nodeId: string): PreviewNodeState;
  requestRender?(): void;
  reportWarning?(message: string): void;
}

/**
 * `SceneData` → live Pixi preview tree, synchronised incrementally.
 *
 * The whole point is that an Inspector edit must not rebuild the scene:
 *
 * ```
 * SceneData change
 *   ↓ sync()
 *   ├── unchanged node      → transform skipped, renderers self-diff to a no-op
 *   ├── moved node          → syncTransform() only
 *   └── edited component    → that one RendererView.update()
 * ```
 *
 * `SceneData` is never mutated and no Pixi object is ever stored on it.
 */
export class ScenePreviewTree {
  readonly nodes = new Map<string, PreviewNode>();
  root: PreviewNode | null = null;

  constructor(
    private readonly registry: RendererRegistry,
    /** Container the design root is attached to (the artboard's `designRoot`). */
    private readonly container: Container = new Container(),
  ) {}

  /** The container holding the whole preview; add it to the Pixi stage once. */
  get rootContainer(): Container {
    return this.container;
  }

  get stats(): PreviewSyncStats {
    return this.lastStats;
  }

  private lastStats: PreviewSyncStats = createPreviewSyncStats();

  /** Incremental sync: creates, updates, reparents and prunes to match `scene`. */
  sync(scene: SceneData | NodeData, options: ScenePreviewSyncOptions): PreviewSyncStats {
    const stats = createPreviewSyncStats();
    const rootData = 'root' in scene ? scene.root : scene;
    const layerOrder = buildLayerOrder(rootData);
    const alive = new Set<string>();

    this.lastStats = stats;
    this.visit(rootData, this.container, null, layerOrder, options, alive, stats);
    this.root = this.nodes.get(rootData.id) ?? null;

    for (const [nodeId, node] of [...this.nodes]) {
      if (alive.has(nodeId)) {
        continue;
      }

      node.destroy();
      this.nodes.delete(nodeId);
      stats.nodesRemoved += 1;
    }

    return stats;
  }

  createNode(nodeData: NodeData, parentContainer: Container = this.container): PreviewNode {
    const node = new PreviewNode(nodeData.id);
    node.nodeName = nodeData.name;
    parentContainer.addChild(node.container);
    this.nodes.set(nodeData.id, node);
    return node;
  }

  updateNode(
    nodeData: NodeData,
    options: ScenePreviewSyncOptions,
    parentContainer: Container = this.container,
  ): void {
    const stats = createPreviewSyncStats();
    const state = options.nodeState?.(nodeData.id) ?? defaultPreviewNodeState;
    const visible = nodeData.active && nodeData.transform.visible && state.editorVisible;
    const node = this.ensureNode(nodeData, parentContainer, null, stats);

    node.syncTransform(nodeData.transform, visible);
    node.syncRenderers(nodeData.components, this.contextFor(nodeData, options), this.registry, stats);
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);

    if (!node) {
      return;
    }

    for (const child of [...this.nodes.values()]) {
      if (child.parentId === nodeId) {
        this.removeNode(child.nodeId);
      }
    }

    node.destroy();
    this.nodes.delete(nodeId);
  }

  reparentNode(nodeId: string, parentId: string | null): void {
    const node = this.nodes.get(nodeId);
    const parent = parentId ? this.nodes.get(parentId) : null;

    if (!node) {
      return;
    }

    const container = parent ? parent.container : this.container;

    if (node.container.parent !== container) {
      container.addChild(node.container);
    }

    node.parentId = parent ? parent.nodeId : null;
  }

  /** The node's parent id, as resolved by the last sync. */
  parentOf(nodeId: string): string | null {
    return this.nodes.get(nodeId)?.parentId ?? null;
  }

  containerOf(nodeId: string): Container | null {
    return this.nodes.get(nodeId)?.container ?? null;
  }

  destroy(): void {
    for (const node of this.nodes.values()) {
      node.destroy();
    }

    this.nodes.clear();
    this.root = null;

    if (!this.container.destroyed) {
      this.container.destroy({ children: true });
    }
  }

  private visit(
    nodeData: NodeData,
    parentContainer: Container,
    parentId: string | null,
    layerOrder: ReadonlyMap<string, number>,
    options: ScenePreviewSyncOptions,
    alive: Set<string>,
    stats: PreviewSyncStats,
  ): void {
    alive.add(nodeData.id);

    const node = this.ensureNode(nodeData, parentContainer, parentId, stats);
    const state = options.nodeState?.(nodeData.id) ?? defaultPreviewNodeState;
    const visible = nodeData.active && nodeData.transform.visible && state.editorVisible;

    if (node.syncTransform(nodeData.transform, visible)) {
      stats.transformUpdates += 1;
    }

    // Always re-offered: renderer views self-diff, so a prop edit reaches exactly
    // one view while everything else stays a cheap no-op.
    node.syncRenderers(nodeData.components, this.contextFor(nodeData, options), this.registry, stats);
    node.applyOrder(layerOrderOf(nodeData.layer, layerOrder), nodeData.zIndex);

    for (const child of nodeData.children) {
      this.visit(child, node.container, nodeData.id, layerOrder, options, alive, stats);
    }
  }

  private ensureNode(
    nodeData: NodeData,
    parentContainer: Container,
    parentId: string | null,
    stats: PreviewSyncStats,
  ): PreviewNode {
    let node = this.nodes.get(nodeData.id);

    if (!node) {
      node = this.createNode(nodeData, parentContainer);
      stats.nodesCreated += 1;
    } else if (node.container.parent !== parentContainer) {
      parentContainer.addChild(node.container);
    }

    node.nodeName = nodeData.name;
    node.parentId = parentId;
    return node;
  }

  private contextFor(nodeData: NodeData, options: ScenePreviewSyncOptions): RenderContext {
    return {
      mode: options.mode,
      assets: options.assets,
      resolution: options.resolution,
      transform: nodeData.transform,
      requestRender: options.requestRender,
      reportWarning: options.reportWarning,
    };
  }
}
