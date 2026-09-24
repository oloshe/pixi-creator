import type { NodeData } from '@pxe/schema';
import type { Command, NodePropertyPath } from '../types';
import { findNode } from '../utils';

export class SetNodePropertyCommand implements Command {
  readonly label = 'Set Node Property';
  private before: unknown;

  constructor(
    private readonly root: NodeData,
    private readonly nodeId: string,
    private readonly path: NodePropertyPath,
    private after: unknown,
  ) {
    this.before = this.read();
  }

  execute(): void {
    this.write(this.after);
  }

  undo(): void {
    this.write(this.before);
  }

  merge(next: Command): boolean {
    if (
      next instanceof SetNodePropertyCommand &&
      next.root === this.root &&
      next.nodeId === this.nodeId &&
      next.path === this.path
    ) {
      this.after = next.after;
      return true;
    }

    return false;
  }

  private read(): unknown {
    const node = this.requireNode();
    return this.path.startsWith('transform.')
      ? node.transform[this.path.slice('transform.'.length) as keyof NodeData['transform']]
      : node[this.path as 'name' | 'active' | 'layer' | 'zIndex'];
  }

  private write(value: unknown): void {
    const node = this.requireNode();

    if (this.path.startsWith('transform.')) {
      const key = this.path.slice('transform.'.length) as keyof NodeData['transform'];
      (node.transform[key] as unknown) = value;
      return;
    }

    if (this.path === 'name' && typeof value === 'string') {
      node.name = value;
      return;
    }

    if (this.path === 'active' && typeof value === 'boolean') {
      node.active = value;
      return;
    }

    if (this.path === 'layer') {
      if (typeof value === 'string' && value.length > 0) {
        node.layer = value;
      } else {
        delete node.layer;
      }
      return;
    }

    if (this.path === 'zIndex' && typeof value === 'number') {
      node.zIndex = value;
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
