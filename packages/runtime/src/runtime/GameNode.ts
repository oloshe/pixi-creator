import { Container } from 'pixi.js';
import { applyRectTransform, rectOfTransform, renderSortKey, type ResolutionInfo } from '@pxe/rendering';
import type { RectTransformData } from '@pxe/schema';
import type { Component, ComponentConstructor } from './Component';
import type { LayoutSystem } from './LayoutSystem';

/**
 * Shared, mutable resolution info.
 *
 * All nodes in a scene point at the *same* object (the `layout` pattern), so a
 * screen resize is visible to every renderer without walking the tree.
 */
export function createResolutionInfo(designWidth: number, designHeight: number): ResolutionInfo {
  return { designWidth, designHeight, screenWidth: 0, screenHeight: 0 };
}

export class GameNode {
  readonly id: string;
  name: string;
  parent: GameNode | null = null;
  readonly children: GameNode[] = [];
  readonly components: Component[] = [];
  readonly view: Container = new Container();

  /** Layer bucket used for render sorting; unset means "hierarchy order only". */
  layer: string | null = null;
  /** Set once the node is attached to a scene. */
  layout: LayoutSystem | null = null;
  /** Shared with the whole scene; never reassigned per node. */
  resolution: ResolutionInfo = createResolutionInfo(0, 0);

  private _active = true;
  private _activeInHierarchy = true;
  private _visible = true;
  private _width = 0;
  private _height = 0;
  private _pivotX = 0;
  private _pivotY = 0;
  private _zIndex = 0;
  private _layerOrder = 0;
  private _layoutDirty = false;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.view.label = name;
    this.view.sortableChildren = true;
  }

  get active(): boolean {
    return this._active;
  }

  set active(value: boolean) {
    if (this._active === value) {
      return;
    }

    this._active = value;
    this.refreshActiveInHierarchy();
  }

  get activeInHierarchy(): boolean {
    return this._activeInHierarchy;
  }

  get x(): number {
    return this.view.x;
  }

  set x(value: number) {
    this.view.x = value;
  }

  get y(): number {
    return this.view.y;
  }

  set y(value: number) {
    this.view.y = value;
  }

  /** Logical width in design units — never Pixi's scaled `DisplayObject.width`. */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this.setSize(value, this._height);
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    this.setSize(this._width, value);
  }

  /** Normalized pivot, `0 → 1` (top-left → bottom-right). */
  get pivotX(): number {
    return this._pivotX;
  }

  set pivotX(value: number) {
    this._pivotX = value;
    this.refreshPivot();
  }

  get pivotY(): number {
    return this._pivotY;
  }

  set pivotY(value: number) {
    this._pivotY = value;
    this.refreshPivot();
  }

  get scaleX(): number {
    return this.view.scale.x;
  }

  set scaleX(value: number) {
    this.view.scale.x = value;
  }

  get scaleY(): number {
    return this.view.scale.y;
  }

  set scaleY(value: number) {
    this.view.scale.y = value;
  }

  get rotation(): number {
    return (this.view.rotation * 180) / Math.PI;
  }

  set rotation(value: number) {
    this.view.rotation = (value * Math.PI) / 180;
  }

  get zIndex(): number {
    return this._zIndex;
  }

  set zIndex(value: number) {
    this._zIndex = value;
    this.refreshSortOrder();
  }

  /** Layer stack position; higher buckets render on top regardless of zIndex. */
  get layerOrder(): number {
    return this._layerOrder;
  }

  set layerOrder(value: number) {
    this._layerOrder = value;
    this.refreshSortOrder();
  }

  get layoutDirty(): boolean {
    return this._layoutDirty;
  }

  setSize(width: number, height: number): void {
    if (this._width === width && this._height === height) {
      return;
    }

    this._width = width;
    this._height = height;
    this.refreshPivot();

    // Children anchored to this node must be re-resolved.
    for (const child of this.children) {
      child.markLayoutDirty();
    }
  }

  markLayoutDirty(): void {
    this._layoutDirty = true;
    this.layout?.markDirty(this);
  }

  clearLayoutDirty(): void {
    this._layoutDirty = false;
  }

  /** Effective unrotated rectangle in the parent's local space. */
  getRect(): { x: number; y: number; width: number; height: number } {
    return rectOfTransform(this.rectTransform);
  }

  /**
   * The node's current state as a RectTransform.
   *
   * Renderers read this to draw inside the node rect, so it is the same shape
   * the editor passes to its preview renderers.
   */
  get rectTransform(): RectTransformData {
    return {
      x: this.view.x,
      y: this.view.y,
      width: this._width,
      height: this._height,
      pivotX: this._pivotX,
      pivotY: this._pivotY,
      scaleX: this.view.scale.x,
      scaleY: this.view.scale.y,
      rotationDeg: (this.view.rotation * 180) / Math.PI,
      alpha: this.view.alpha,
      visible: this._visible,
    };
  }

  addChild(node: GameNode): void {
    node.setParent(this);
  }

  removeChild(node: GameNode): void {
    if (node.parent !== this) {
      return;
    }

    node.setParent(null);
  }

  setParent(parent: GameNode | null): void {
    if (this.parent === parent) {
      return;
    }

    if (parent && (parent === this || parent.isDescendantOf(this))) {
      throw new Error(`Cannot parent ${this.id} to its descendant ${parent.id}`);
    }

    const oldParent = this.parent;

    if (oldParent) {
      oldParent.children.splice(oldParent.children.indexOf(this), 1);
      oldParent.view.removeChild(this.view);
      oldParent.markLayoutDirty();
    }

    this.parent = parent;

    if (parent) {
      parent.children.push(this);
      parent.view.addChild(this.view);
      parent.markLayoutDirty();
    }

    this.layout = parent?.layout ?? this.layout;
    this.resolution = parent?.resolution ?? this.resolution;
    this.propagateSharedSystems();
    this.refreshActiveInHierarchy();
    this.markLayoutDirty();
  }

  addComponent<T extends Component>(component: T): T {
    if (component.node && component.node !== this) {
      throw new Error('Component already belongs to another node');
    }

    component.node = this;
    this.components.push(component);
    return component;
  }

  getComponent<T extends Component>(type: ComponentConstructor<T>): T | null {
    return this.components.find((component): component is T => component instanceof type) ?? null;
  }

  getComponents<T extends Component>(type: ComponentConstructor<T>): T[] {
    return this.components.filter((component): component is T => component instanceof type);
  }

  removeComponent(component: Component): void {
    const index = this.components.indexOf(component);

    if (index === -1) {
      return;
    }

    this.components.splice(index, 1);
    component.onDestroy?.();
  }

  destroy(): void {
    for (const child of [...this.children]) {
      child.destroy();
    }

    for (const component of [...this.components].reverse()) {
      component.onDestroy?.();
    }

    this.components.length = 0;
    this.setParent(null);
    this.view.destroy({ children: true });
  }

  applyTransform(transform: RectTransformData): void {
    // Shared with the editor preview via `@pxe/rendering`.
    applyRectTransform(this.view, transform);
    this._width = transform.width;
    this._height = transform.height;
    this._pivotX = transform.pivotX;
    this._pivotY = transform.pivotY;
    this._visible = transform.visible;
    this.view.visible = this._visible && this.activeInHierarchy;
    this.refreshPivot();
  }

  /** Applies normalized pivot to the Pixi pivot in local (unscaled) units. */
  refreshPivot(): void {
    this.view.pivot.set(this._pivotX * this._width, this._pivotY * this._height);
  }

  refreshActiveInHierarchy(): void {
    const next = this._active && (this.parent?.activeInHierarchy ?? true);
    const changed = next !== this._activeInHierarchy;

    this._activeInHierarchy = next;
    this.view.visible = next && this._visible;

    if (changed) {
      for (const component of this.components) {
        if (!component.enabled) {
          continue;
        }

        if (next) {
          component.onEnable?.();
        } else {
          component.onDisable?.();
        }
      }
    }

    for (const child of this.children) {
      child.refreshActiveInHierarchy();
    }
  }

  private refreshSortOrder(): void {
    this.view.zIndex = renderSortKey(this._layerOrder, this._zIndex);
  }

  /** Shares the scene-level layout system and resolution info with the subtree. */
  private propagateSharedSystems(): void {
    for (const child of this.children) {
      if (this.layout) {
        child.layout = this.layout;
      }

      child.resolution = this.resolution;
      child.propagateSharedSystems();
    }
  }

  private isDescendantOf(node: GameNode): boolean {
    let current = this.parent;

    while (current) {
      if (current === node) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }
}
