import type { NodeData, SceneData, SceneSettings } from '@pxe/schema';
import type { Command } from '../types';

/** Undoable edit of `scene.settings` (canvas size, background, resize, clip). */
export class SetSceneSettingsCommand implements Command {
  readonly label = 'Set Scene Settings';
  private readonly before: SceneSettings;

  constructor(
    private readonly data: SceneData,
    private readonly patch: Partial<SceneSettings>,
  ) {
    this.before = { ...data.settings };
  }

  execute(): void {
    this.data.settings = { ...this.before, ...this.patch };
    syncCanvasSize(this.data.root, this.data.settings);
  }

  undo(): void {
    this.data.settings = { ...this.before };
    syncCanvasSize(this.data.root, this.data.settings);
  }

  merge(next: Command): boolean {
    if (next instanceof SetSceneSettingsCommand && next.data === this.data) {
      Object.assign(this.patch, next.patch);
      return true;
    }

    return false;
  }
}

/** The design-space root node always mirrors the design resolution. */
export function syncCanvasSize(root: NodeData, settings: SceneSettings): void {
  root.transform.width = settings.designWidth;
  root.transform.height = settings.designHeight;
}

export class SetSceneNameCommand implements Command {
  readonly label = 'Rename Scene';
  private readonly before: string;

  constructor(private readonly data: SceneData, private after: string) {
    this.before = data.name;
  }

  execute(): void {
    this.data.name = this.after;
  }

  undo(): void {
    this.data.name = this.before;
  }

  merge(next: Command): boolean {
    if (next instanceof SetSceneNameCommand && next.data === this.data) {
      this.after = next.after;
      return true;
    }

    return false;
  }
}
