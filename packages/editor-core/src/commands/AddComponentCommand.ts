import type { ComponentData, NodeData } from '@pxe/schema';
import type { Command } from '../types';
import { findNode } from '../utils';

export class AddComponentCommand implements Command {
  readonly label = 'Add Component';
  private index: number;

  constructor(
    private readonly root: NodeData,
    private readonly nodeId: string,
    private readonly component: ComponentData,
    index?: number,
  ) {
    this.index = index ?? Number.POSITIVE_INFINITY;
  }

  execute(): void {
    const node = this.requireNode();
    this.index = Number.isFinite(this.index) ? this.index : node.components.length;
    node.components.splice(this.index, 0, this.component);
  }

  undo(): void {
    const node = this.requireNode();
    const index = node.components.findIndex((component) => component.id === this.component.id);

    if (index >= 0) {
      node.components.splice(index, 1);
    }
  }

  private requireNode(): NodeData {
    const node = findNode(this.root, this.nodeId)?.node;

    if (!node) {
      throw new Error(`Unknown node: ${this.nodeId}`);
    }

    return node;
  }
}
