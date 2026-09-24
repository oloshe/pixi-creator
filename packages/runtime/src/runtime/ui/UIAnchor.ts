import { Component } from '../Component';
import { applyAnchorLayout } from './applyLayout';
import { defaultUIAnchor } from './layout';

/**
 * Parent-relative anchor component.
 *
 * Opposite edges stretch `width` / `height`:
 * - `Left` + `Right` → `width = parent.width - left - right`
 * - `Top` + `Bottom` → `height = parent.height - top - bottom`
 *
 * When enabled, the anchor owns the node position, so moving the node by hand
 * has no effect until the anchor is disabled.
 */
export class UIAnchor extends Component {
  static readonly componentType = 'engine.UIAnchor';

  anchorLeft = defaultUIAnchor.anchorLeft;
  anchorRight = defaultUIAnchor.anchorRight;
  anchorTop = defaultUIAnchor.anchorTop;
  anchorBottom = defaultUIAnchor.anchorBottom;

  left = defaultUIAnchor.left;
  right = defaultUIAnchor.right;
  top = defaultUIAnchor.top;
  bottom = defaultUIAnchor.bottom;

  centerX = defaultUIAnchor.centerX;
  centerY = defaultUIAnchor.centerY;

  offsetX = defaultUIAnchor.offsetX;
  offsetY = defaultUIAnchor.offsetY;

  onEnable(): void {
    this.markDirty();
  }

  onLoad(): void {
    this.markDirty();
  }

  /** Requests a layout pass on the next `LayoutSystem.flush()`. */
  markDirty(): void {
    this.node?.markLayoutDirty();
  }

  applyLayout(): void {
    applyAnchorLayout(this.node, {
      anchorLeft: this.anchorLeft,
      anchorRight: this.anchorRight,
      anchorTop: this.anchorTop,
      anchorBottom: this.anchorBottom,
      left: this.left,
      right: this.right,
      top: this.top,
      bottom: this.bottom,
      centerX: this.centerX,
      centerY: this.centerY,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    });
  }
}
