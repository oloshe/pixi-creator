import type { ComponentData, RectTransformData } from '@pxe/schema';
import { Container } from 'pixi.js';
import type { RenderContext, RendererView } from '../core/RendererView';
import type { RendererRegistry } from '../core/RendererRegistry';
import { applyRectTransform } from '../core/rectTransform';
import { renderSortKey } from '../core/sceneOrder';
import { buildSignature } from '../core/signature';

export interface PreviewNodeState {
  locked: boolean;
  editorVisible: boolean;
}

export const defaultPreviewNodeState: PreviewNodeState = { locked: false, editorVisible: true };

export interface PreviewSyncStats {
  nodesCreated: number;
  nodesRemoved: number;
  renderersCreated: number;
  renderersDestroyed: number;
  /** Nodes whose RectTransform actually changed. */
  transformUpdates: number;
  /** Renderers whose `update()` ran; a no-op pass that self-diffs still counts. */
  rendererPasses: number;
}

export function createPreviewSyncStats(): PreviewSyncStats {
  return {
    nodesCreated: 0,
    nodesRemoved: 0,
    renderersCreated: 0,
    renderersDestroyed: 0,
    transformUpdates: 0,
    rendererPasses: 0,
  };
}

/**
 * One scene node inside the editor preview.
 *
 * ```
 * PreviewNode.container      ← transform, pivot, alpha, sort order
 * └── RendererView display objects   ← one per renderer component
 * ```
 *
 * A `PreviewNode` is deliberately *not* a runtime `GameNode`: the editor must not
 * run component lifecycles, behaviour components or gameplay state. It shares the
 * parts that decide what things look like — `applyRectTransform`, the
 * `RendererView` implementations and the layout maths — and nothing else.
 */
export class PreviewNode {
  readonly nodeId: string;
  readonly container = new Container();
  /** Keyed by component id, so a prop edit maps onto exactly one view. */
  readonly renderers = new Map<string, RendererView<unknown>>();

  parentId: string | null = null;
  nodeName = '';

  private lastTransformSignature = '';
  private lastVisible: boolean | null = null;
  private lastSortKey: number | null = null;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
    this.container.label = nodeId;
    // Mirrors `GameNode`: layer bucket dominates, zIndex breaks ties.
    this.container.sortableChildren = true;
  }

  /** Applies position / scale / rotation / pivot / alpha, plus hierarchy visibility. */
  syncTransform(transform: RectTransformData, visible: boolean): boolean {
    const signature = buildSignature([
      transform.x,
      transform.y,
      transform.width,
      transform.height,
      transform.pivotX,
      transform.pivotY,
      transform.scaleX,
      transform.scaleY,
      transform.rotationDeg,
      transform.alpha,
      visible,
    ]);

    if (signature === this.lastTransformSignature) {
      return false;
    }

    this.lastTransformSignature = signature;
    applyRectTransform(this.container, transform);
    this.container.visible = visible;
    this.lastVisible = visible;
    return true;
  }

  /**
   * Brings the renderer set in line with the node's components.
   *
   * Renderers are keyed by component id and *reused*: editing a text colour must
   * update one `PIXI.Text`, never destroy and rebuild the node. Each view then
   * self-diffs its own props, which is what makes a per-frame call cheap.
   */
  syncRenderers(
    components: readonly ComponentData[],
    context: RenderContext,
    registry: RendererRegistry,
    stats?: PreviewSyncStats,
  ): void {
    const alive = new Set<string>();

    for (const component of components) {
      if (!component.enabled) {
        continue;
      }

      const factory = registry.factory(component.type);

      if (!factory) {
        continue;
      }

      let view = this.renderers.get(component.id);

      if (!view) {
        view = factory.create();
        view.create();
        this.container.addChild(view.displayObject);
        this.renderers.set(component.id, view);

        if (stats) {
          stats.renderersCreated += 1;
        }
      }

      alive.add(component.id);

      if (stats) {
        stats.rendererPasses += 1;
      }

      view.update(factory.resolveProps(component.props), context);
    }

    for (const [componentId, view] of [...this.renderers]) {
      if (alive.has(componentId)) {
        continue;
      }

      view.destroy();
      this.renderers.delete(componentId);

      if (stats) {
        stats.renderersDestroyed += 1;
      }
    }
  }

  /** Layer bucket + zIndex, mirroring `GameNode.refreshSortOrder`. */
  applyOrder(layerOrder: number, zIndex: number): void {
    const sortKey = renderSortKey(layerOrder, zIndex);

    if (sortKey === this.lastSortKey) {
      return;
    }

    this.lastSortKey = sortKey;
    this.container.zIndex = sortKey;
  }

  get visible(): boolean {
    return this.lastVisible ?? true;
  }

  /** Destroys the Pixi subtree *and* every renderer view (no leaked display objects). */
  destroy(): void {
    for (const view of this.renderers.values()) {
      view.destroy();
    }

    this.renderers.clear();

    if (!this.container.destroyed) {
      this.container.destroy({ children: true });
    }
  }
}
