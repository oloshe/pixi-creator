import type { NodeData } from '@pxe/schema';
import type { Command } from '../types';
import { findNode, insertNode } from '../utils';

export class AddNodeCommand implements Command {
  readonly label = 'Add Node';
  private index: number;

  constructor(
    private readonly root: NodeData,
    private readonly parentId: string,
    private readonly node: NodeData,
    index?: number,
  ) {
    this.index = index ?? Number.POSITIVE_INFINITY;
  }

  execute(): void {
    const parent = this.requireParent();
    this.index = Number.isFinite(this.index) ? this.index : parent.children.length;
    insertNode(parent, this.node, this.index);
  }

  undo(): void {
    const parent = this.requireParent();
    const index = parent.children.findIndex((child) => child.id === this.node.id);

    if (index >= 0) {
      parent.children.splice(index, 1);
    }
  }

  private requireParent(): NodeData {
    const parent = findNode(this.root, this.parentId)?.node;

    if (!parent) {
      throw new Error(`Unknown parent node: ${this.parentId}`);
    }

    return parent;
  }
}
