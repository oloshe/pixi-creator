import type { ComponentData, NodeData } from '@pxe/schema';
import type { Command } from '../types';
import { findComponent } from '../utils';

export class RemoveComponentCommand implements Command {
  readonly label = 'Remove Component';
  private node: NodeData | null = null;
  private component: ComponentData | null = null;
  private index = -1;

  constructor(
    private readonly root: NodeData,
    private readonly componentId: string,
  ) {}

  execute(): void {
    const location = findComponent(this.root, this.componentId);

    if (!location) {
      return;
    }

    this.node = location.node;
    this.component = location.component;
    this.index = location.index;
    location.node.components.splice(location.index, 1);
  }

  undo(): void {
    if (!this.node || !this.component) {
      return;
    }

    this.node.components.splice(this.index, 0, this.component);
  }
}
