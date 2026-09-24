import type { NodeData } from '@pxe/schema';
import type { Command, NodeLocation } from '../types';
import { insertNode, removeNode } from '../utils';

export class DeleteNodeCommand implements Command {
  readonly label = 'Delete Node';
  private deleted: NodeLocation | null = null;

  constructor(
    private readonly root: NodeData,
    private readonly nodeId: string,
  ) {}

  execute(): void {
    this.deleted = removeNode(this.root, this.nodeId);
  }

  undo(): void {
    if (!this.deleted?.parent) {
      return;
    }

    insertNode(this.deleted.parent, this.deleted.node, this.deleted.index);
  }
}
