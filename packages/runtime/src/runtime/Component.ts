import type { GameNode } from './GameNode';

export type ComponentConstructor<T extends Component = Component> = new () => T;

export abstract class Component {
  readonly id: string = '';
  node!: GameNode;
  enabled = true;
  private _started = false;

  onLoad?(): void | Promise<void>;
  start?(): void | Promise<void>;
  update?(dt: number): void;
  lateUpdate?(dt: number): void;
  onEnable?(): void;
  onDisable?(): void;
  onDestroy?(): void;

  get started(): boolean {
    return this._started;
  }

  async callStartOnce(): Promise<void> {
    if (this._started || !this.start) {
      return;
    }

    this._started = true;
    await this.start();
  }

  setRuntimeId(id: string): void {
    Object.defineProperty(this, 'id', {
      value: id,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
}
