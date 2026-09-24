import type { NodeData } from '@pxe/schema';
import type { Command } from '../types';
import { duplicateNodeData, findNode, insertNode } from '../utils';

export class DuplicateNodeCommand implements Command {
  readonly label = 'Duplicate Node';
  readonly duplicatedNode: NodeData;
  private parent: NodeData | null = null;
  private index = -1;

  constructor(
    private readonly root: NodeData,
    private readonly nodeId: string,
  ) {
    const node = findNode(root, nodeId)?.node;

    if (!node) {
      throw new Error(`Unknown node: ${nodeId}`);
    }

    this.duplicatedNode = duplicateNodeData(node);
    this.duplicatedNode.name = `${node.name} Copy`;
  }

  execute(): void {
    const location = findNode(this.root, this.nodeId);

    if (!location?.parent) {
      throw new Error('Cannot duplicate the root node');
    }

    this.parent = location.parent;
    this.index = location.index + 1;
    insertNode(location.parent, this.duplicatedNode, this.index);
  }

  undo(): void {
    if (!this.parent) {
      return;
    }

    const index = this.parent.children.findIndex((child) => child.id === this.duplicatedNode.id);
    if (index >= 0) {
      this.parent.children.splice(index, 1);
    }
  }
}
