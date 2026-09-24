import type { SceneData } from '@pxe/schema';
import { Scene } from './Scene';
import { SceneLoader } from './SceneLoader';

export type SceneProvider = (sceneId: string) => Promise<SceneData> | SceneData;

/** Host that owns the screen/design container tree (see `Game`). */
export interface SceneHost {
  mountScene(scene: Scene): void;
  unmountScene(scene: Scene): void;
}

export class SceneManager {
  currentScene: Scene | null = null;
  private lastSceneId: string | null = null;

  constructor(
    private readonly loader: SceneLoader,
    private readonly sceneProvider: SceneProvider,
    private readonly host: SceneHost,
  ) {}

  async loadScene(sceneId: string): Promise<Scene> {
    await this.unloadCurrent();
    const sceneData = await this.sceneProvider(sceneId);

    const scene = await this.loader.load(sceneData);
    this.host.mountScene(scene);
    this.currentScene = scene;
    this.lastSceneId = sceneId;

    return scene;
  }

  async unloadCurrent(): Promise<void> {
    if (!this.currentScene) {
      return;
    }

    this.host.unmountScene(this.currentScene);
    this.currentScene.destroy();
    this.currentScene = null;
  }

  async reload(): Promise<void> {
    if (!this.lastSceneId) {
      throw new Error('No scene has been loaded');
    }

    await this.loadScene(this.lastSceneId);
  }

  get lastLoadedSceneId(): string | null {
    return this.lastSceneId;
  }
}
