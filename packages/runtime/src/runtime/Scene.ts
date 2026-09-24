import type { ResolutionInfo } from '@pxe/rendering';
import type { SceneData, SceneSettings } from '@pxe/schema';
import type { Component } from './Component';
import { createResolutionInfo, GameNode } from './GameNode';
import { LayoutSystem } from './LayoutSystem';
import { syncUI } from './ui/syncUI';

export class Scene {
  readonly data: SceneData;
  readonly root: GameNode;
  readonly nodes: ReadonlyMap<string, GameNode>;
  readonly components: readonly Component[];
  readonly layout: LayoutSystem;
  /** Shared with every node in the scene; mutated on screen resize. */
  readonly resolution: ResolutionInfo;

  constructor(
    data: SceneData,
    root: GameNode,
    nodes: Map<string, GameNode>,
    components: Component[],
    layout: LayoutSystem = new LayoutSystem(),
    resolution: ResolutionInfo = createResolutionInfo(data.settings.designWidth, data.settings.designHeight),
  ) {
    this.data = data;
    this.root = root;
    this.nodes = nodes;
    this.components = components;
    this.layout = layout;
    this.resolution = resolution;
  }

  get settings(): SceneSettings {
    return this.data.settings;
  }

  findNode(id: string): GameNode | null {
    return this.nodes.get(id) ?? null;
  }

  async update(dt: number): Promise<void> {
    for (const component of this.components) {
      if (!shouldRun(component)) {
        continue;
      }

      await component.callStartOnce();
    }

    // Layout is dirty-driven; this is the only place it runs per frame.
    this.layout.flush();

    for (const component of this.components) {
      if (shouldRun(component)) {
        component.update?.(dt);
      }
    }

    for (const component of this.components) {
      if (shouldRun(component)) {
        component.lateUpdate?.(dt);
      }
    }
    syncUI(this.root);
  }

  /** Call after a resolution change so anchored nodes re-resolve. */
  markLayoutDirty(): void {
    this.layout.markSubtreeDirty(this.root);
  }

  /** Screen size the scene is being rendered into; renderers read it live. */
  setScreenSize(width: number, height: number): void {
    this.resolution.screenWidth = width;
    this.resolution.screenHeight = height;
  }

  setDesignSize(width: number, height: number): void {
    this.resolution.designWidth = width;
    this.resolution.designHeight = height;
  }

  destroy(): void {
    this.layout.clear();
    this.root.destroy();
  }
}

function shouldRun(component: Component): boolean {
  return component.enabled && component.node.activeInHierarchy;
}
