import type { NodeData } from '@pxe/schema';
import type { Command, NodeLocation } from '../types';
import { findNode, insertNode, isDescendant, removeNode } from '../utils';

export class ReparentNodeCommand implements Command {
  readonly label = 'Reparent Node';
  private before: NodeLocation | null = null;

  constructor(
    private readonly root: NodeData,
    private readonly nodeId: string,
    private readonly newParentId: string,
    private readonly newIndex?: number,
  ) {}

  execute(): void {
    if (this.nodeId === this.root.id) {
      throw new Error('Cannot reparent the root node');
    }

    if (this.nodeId === this.newParentId || isDescendant(this.root, this.nodeId, this.newParentId)) {
      throw new Error('Cannot reparent a node below itself');
    }

    const parent = findNode(this.root, this.newParentId)?.node;
    if (!parent) {
      throw new Error(`Unknown parent node: ${this.newParentId}`);
    }

    this.before = removeNode(this.root, this.nodeId);
    if (!this.before) {
      throw new Error(`Unknown node: ${this.nodeId}`);
    }

    insertNode(parent, this.before.node, this.newIndex ?? parent.children.length);
  }

  undo(): void {
    if (!this.before?.parent) {
      return;
    }

    removeNode(this.root, this.nodeId);
    insertNode(this.before.parent, this.before.node, this.before.index);
  }
}
