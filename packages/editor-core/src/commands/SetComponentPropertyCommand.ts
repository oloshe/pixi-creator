import type { NodeData } from '@pxe/schema';
import type { Command, ComponentPropertyPath } from '../types';
import { findComponent } from '../utils';

export class SetComponentPropertyCommand implements Command {
  readonly label = 'Set Component Property';
  private before: unknown;

  constructor(
    private readonly root: NodeData,
    private readonly componentId: string,
    private readonly path: ComponentPropertyPath,
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
      next instanceof SetComponentPropertyCommand &&
      next.root === this.root &&
      next.componentId === this.componentId &&
      next.path === this.path
    ) {
      this.after = next.after;
      return true;
    }

    return false;
  }

  private read(): unknown {
    const component = this.requireComponent();
    return this.path === 'enabled' ? component.enabled : component.props[this.path.slice('props.'.length)];
  }

  private write(value: unknown): void {
    const component = this.requireComponent();

    if (this.path === 'enabled') {
      if (typeof value === 'boolean') {
        component.enabled = value;
      }
      return;
    }

    component.props[this.path.slice('props.'.length)] = value;
  }

  private requireComponent() {
    const component = findComponent(this.root, this.componentId)?.component;

    if (!component) {
      throw new Error(`Unknown component: ${this.componentId}`);
    }

    return component;
  }
}
