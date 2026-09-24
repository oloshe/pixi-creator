import { normalizeRootTransform, parseSceneData, type SceneData } from '@pxe/schema';
import { History } from './History';
import { Selection } from './Selection';
import { cloneSceneData } from './utils';
import type { Command, SelectionState } from './types';

export class SceneDocument {
  rootNormalized = false;
  readonly history = new History();
  readonly selection = new Selection();
  private revision = 0;
  private dirtyValue = false;
  private dataValue: SceneData;
  private readonly listeners = new Set<() => void>();

  constructor(data: SceneData) {
    this.dataValue = cloneSceneData(parseSceneData(data));
    this.rootNormalized = normalizeRootTransform(this.dataValue.root, this.dataValue.settings);
    this.dirtyValue = this.rootNormalized;
  }

  get data(): SceneData {
    return this.dataValue;
  }

  get dirty(): boolean {
    return this.dirtyValue;
  }

  get version(): number {
    return this.revision;
  }

  execute(command: Command): void {
    this.history.execute(command);
    this.markDirty();
  }

  undo(): void {
    this.history.undo();
    this.markDirty();
  }

  redo(): void {
    this.history.redo();
    this.markDirty();
  }

  selectNode(nodeId: string | null): void {
    this.selection.select(nodeId);
    this.bumpRevision();
  }

  restoreSelection(selection: SelectionState): void {
    this.selection.restore(selection);
    this.bumpRevision();
  }

  serialize(): SceneData {
    return parseSceneData(cloneSceneData(this.dataValue));
  }

  markSaved(): void {
    this.dirtyValue = false;
    this.bumpRevision();
  }

  replaceData(data: SceneData): void {
    this.dataValue = cloneSceneData(parseSceneData(data));
    this.selection.select(null);
    this.history.clear();
    this.rootNormalized = normalizeRootTransform(this.dataValue.root, this.dataValue.settings);
    this.dirtyValue = this.rootNormalized;
    this.bumpRevision();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private markDirty(): void {
    this.dirtyValue = true;
    this.bumpRevision();
  }

  private bumpRevision(): void {
    this.revision += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
