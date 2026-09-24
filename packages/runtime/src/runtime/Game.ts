import { Application, Container, Graphics } from 'pixi.js';
import type { AssetManifest, SceneData } from '@pxe/schema';
import { AssetManager } from './AssetManager';
import { ComponentRegistry } from './ComponentRegistry';
import { SceneLoader } from './SceneLoader';
import { SceneManager, type SceneHost, type SceneProvider } from './SceneManager';
import { Scene } from './Scene';
import { ScreenManager, rendererResolution, type SafeAreaInsets } from './ScreenManager';

export type GameOptions = {
  canvas?: HTMLCanvasElement;
  /** Screen (CSS pixel) size; the design resolution comes from the scene. */
  width: number;
  height: number;
  /** Color shown outside the design area (letterbox). */
  letterboxColor?: number | string;
  startScene?: string;
  assets?: AssetManifest;
  scenes?: Record<string, SceneData>;
  sceneProvider?: SceneProvider;
  /** Track `window` resizes automatically. Defaults to true. */
  resizeToWindow?: boolean;
  /** Read `env(safe-area-inset-*)` on init and on resize. Defaults to true. */
  readCssSafeArea?: boolean;
};

/**
 * Runtime root.
 *
 * Container tree (never `app.stage → Scene` directly):
 *
 * ```
 * app.stage
 * └── screenRoot
 *     └── designRoot   (scale + offset from ResolutionManager)
 *         └── Scene
 * ```
 */
export class Game implements SceneHost {
  app = new Application();
  readonly assets = new AssetManager();
  readonly components = new ComponentRegistry();
  readonly screenRoot = new Container();
  readonly designRoot = new Container();
  screen: ScreenManager;
  scene!: SceneManager;

  private paused = false;
  private screenWidth: number;
  private screenHeight: number;
  private letterboxColor: number | string;
  private readonly options: GameOptions;
  private sceneBackground: Graphics | null = null;
  private sceneMask: Graphics | null = null;
  private readonly onWindowResize = () => {
    if (typeof window === 'undefined') {
      return;
    }

    this.resize(window.innerWidth, window.innerHeight);
    if (this.options.readCssSafeArea !== false) {
      this.screen.readCssSafeArea();
    }
  };

  constructor(options: Partial<GameOptions> = {}) {
    this.options = { width: 0, height: 0, ...options };
    this.screenWidth = this.options.width;
    this.screenHeight = this.options.height;
    this.letterboxColor = this.options.letterboxColor ?? 0x000000;
    this.screen = new ScreenManager(this.options.width || 1, this.options.height || 1, 'contain');
  }

  async init(options: GameOptions = this.options as GameOptions): Promise<void> {
    this.screenWidth = options.width;
    this.screenHeight = options.height;
    Object.assign(this.options, options);

    if (options.letterboxColor != null) {
      this.letterboxColor = options.letterboxColor;
    }

    await this.app.init({
      canvas: options.canvas,
      width: options.width,
      height: options.height,
      background: this.letterboxColor,
      // Renderer backing store = CSS size × DPR (capped), never the design size.
      resolution: rendererResolution(),
      autoDensity: true,
    });

    this.screenRoot.addChild(this.designRoot);
    this.app.stage.addChild(this.screenRoot);
    this.app.stage.sortableChildren = true;

    if (options.assets) {
      await this.assets.init(options.assets);
    }

    const provider =
      options.sceneProvider ??
      ((sceneId: string) => {
        const scene = options.scenes?.[sceneId];

        if (!scene) {
          throw new Error(`Unknown scene: ${sceneId}`);
        }

        return scene;
      });

    this.scene = new SceneManager(
      new SceneLoader(this.components, this.assets),
      provider,
      this,
    );

    this.app.ticker.add((ticker) => {
      if (this.paused) {
        return;
      }

      const dt = Math.min(ticker.deltaMS, 50) / 1000;
      void this.scene.currentScene?.update(dt);
    });

    if (options.resizeToWindow !== false && typeof window !== 'undefined') {
      window.addEventListener('resize', this.onWindowResize);
    }

    if (options.readCssSafeArea !== false && typeof document !== 'undefined') {
      this.screen.readCssSafeArea();
    }

    if (options.startScene) {
      await this.scene.loadScene(options.startScene);
    }
  }

  mountScene(scene: Scene): void {
    const settings = scene.settings;
    this.screen.configure(settings.designWidth, settings.designHeight, settings.resizeMode);
    this.screen.resize(this.screenWidth, this.screenHeight);
    this.screen.applyTo(this.designRoot);
    scene.setDesignSize(settings.designWidth, settings.designHeight);
    scene.setScreenSize(this.screenWidth, this.screenHeight);

    this.designRoot.mask = null;
    this.sceneBackground?.destroy();
    this.sceneMask?.destroy();
    this.sceneBackground = null;
    this.sceneMask = null;

    for (const child of [...this.designRoot.children]) {
      this.designRoot.removeChild(child);
    }

    this.sceneBackground = new Graphics()
      .rect(0, 0, settings.designWidth, settings.designHeight)
      .fill(settings.backgroundColor);
    this.designRoot.addChild(this.sceneBackground);
    this.designRoot.addChild(scene.root.view);

    if (settings.clipContent) {
      this.sceneMask = new Graphics()
        .rect(0, 0, settings.designWidth, settings.designHeight)
        .fill(0xffffff);
      this.designRoot.addChild(this.sceneMask);
      this.designRoot.mask = this.sceneMask;
    }

    this.app.renderer.background.color = this.letterboxColor;
  }

  unmountScene(scene: Scene): void {
    if (scene.root.view.parent === this.designRoot) {
      this.designRoot.removeChild(scene.root.view);
    }

    this.designRoot.mask = null;
    this.sceneBackground?.destroy();
    this.sceneMask?.destroy();
    this.sceneBackground = null;
    this.sceneMask = null;
  }

  /** Screen resize: CSS size in, design mapping + layout invalidation out. */
  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.app.renderer.resize(screenWidth, screenHeight);
    this.screen.resize(screenWidth, screenHeight);
    this.screen.applyTo(this.designRoot);
    // Renderers read the shared resolution object, so update it before layout.
    this.scene?.currentScene?.setScreenSize(screenWidth, screenHeight);
    this.scene?.currentScene?.markLayoutDirty();
  }

  setSafeArea(insets: Partial<SafeAreaInsets>): void {
    this.screen.setSafeArea(insets);
    this.scene?.currentScene?.markLayoutDirty();
  }

  get safeArea(): SafeAreaInsets {
    return this.screen.safeArea;
  }

  async start(sceneId?: string): Promise<void> {
    this.paused = false;

    if (sceneId) {
      await this.scene.loadScene(sceneId);
    }

    this.app.start();
  }

  pause(): void {
    this.paused = true;
    this.app.stop();
  }

  resume(): void {
    this.paused = false;
    this.app.start();
  }

  destroy(): void {
    if (typeof window !== 'undefined' && this.options.resizeToWindow !== false) {
      window.removeEventListener('resize', this.onWindowResize);
    }

    void this.scene?.unloadCurrent();
    this.app.destroy(true);
  }
}
