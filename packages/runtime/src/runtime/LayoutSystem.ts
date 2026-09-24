import type { GameNode } from './GameNode';
import { applyAnchorLayout } from './ui/applyLayout';
import { UIAnchor } from './ui/UIAnchor';

/**
 * Dirty-driven layout execution.
 *
 * Layout is never recomputed every frame: only resolution changes, parent
 * resize, layout property changes and reparenting mark nodes dirty. `flush()`
 * runs before component `update()` (see `Scene.update`).
 */
export class LayoutSystem {
  private readonly dirty = new Set<GameNode>();
  private flushing = false;

  get pending(): number {
    return this.dirty.size;
  }

  markDirty(node: GameNode): void {
    this.dirty.add(node);
  }

  markSubtreeDirty(node: GameNode): void {
    this.dirty.add(node);

    for (const child of node.children) {
      this.markSubtreeDirty(child);
    }
  }

  clear(): void {
    this.dirty.clear();
  }

  /** Resolves every pending anchor, parents first, cascading stretch results. */
  flush(): void {
    if (this.flushing) {
      return;
    }

    this.flushing = true;

    try {
      let guard = 0;

      while (this.dirty.size > 0 && guard < 16) {
        guard += 1;
        const pending = [...this.dirty];
        this.dirty.clear();
        pending.sort((a, b) => depth(a) - depth(b));

        for (const node of pending) {
          this.apply(node);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private apply(node: GameNode): void {
    node.clearLayoutDirty();

    if (!node.activeInHierarchy || !node.parent) {
      return;
    }

    const anchor = node.getComponent(UIAnchor);

    if (anchor?.enabled) {
      anchor.applyLayout();
      return;
    }


  }
}

function depth(node: GameNode): number {
  let value = 0;
  let current = node.parent;

  while (current) {
    value += 1;
    current = current.parent;
  }

  return value;
}

export { applyAnchorLayout };
