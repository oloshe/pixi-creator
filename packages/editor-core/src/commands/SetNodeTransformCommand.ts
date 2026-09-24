import type { NodeData, TransformData } from '@pxe/schema';
import type { Command } from '../types';
import { findNode } from '../utils';

export class SetNodeTransformCommand implements Command {
  readonly label = 'Set Node Transform';
  private readonly before: TransformData;

  constructor(
    private readonly root: NodeData,
    private readonly nodeId: string,
    private readonly after: TransformData,
  ) {
    this.before = structuredClone(this.requireNode().transform);
  }

  execute(): void {
    this.write(this.after);
  }

  undo(): void {
    this.write(this.before);
  }

  private write(transform: TransformData): void {
    const node = this.requireNode();
    node.transform = structuredClone(transform);
  }

  private requireNode(): NodeData {
    const node = findNode(this.root, this.nodeId)?.node;

    if (!node) {
      throw new Error(`Unknown node: ${this.nodeId}`);
    }

    return node;
  }
}
