import type { RectTransformData } from '@pxe/schema';
import type { Container, Texture } from 'pixi.js';

/**
 * Where a renderer instance is running.
 *
 * `mode` is deliberately the *only* thing a renderer may branch on: renderers
 * must never learn about React, the DOM, the editor store or the Play iframe.
 */
export type RenderMode = 'editor' | 'runtime';

/** Logical rectangle of the owning node, in the parent's local space. */
export interface NodeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Design vs. screen size of the surface being rendered into.
 *
 * The editor supplies the simulated device screen in Device Preview; the
 * runtime supplies the real canvas size.
 */
export interface ResolutionInfo {
  designWidth: number;
  designHeight: number;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Everything a renderer is allowed to ask of the host project.
 *
 * The editor and the runtime ship different adapters (`LocalProjectAssetResolver`
 * vs. `RuntimeAssetResolver`); renderers never know which one they got, so a
 * texture that loads in the editor loads identically in the game.
 */
export interface AssetResolver {
  /** Source URL / path of an asset, or `null` when the id is unknown. */
  getUrl(assetId: string): string | null;
  loadTexture(assetId: string): Promise<Texture>;
  /** Loads and registers a font face. Resolves once it is usable for measurement. */
  loadFont(assetId: string): Promise<void>;
}

export interface RenderContext {
  readonly mode: RenderMode;
  readonly assets: AssetResolver;
  readonly resolution: ResolutionInfo;
  /**
   * RectTransform of the owning node.
   *
   * Renderers draw *inside* the node rect (local `0,0` is its top-left corner);
   * they never move the node itself. Position, scale, rotation and pivot belong
   * to `applyRectTransform` on the node container.
   */
  readonly transform: RectTransformData;
  /** Asks the host to schedule a frame (used after async asset loads). */
  readonly requestRender?: () => void;
  /**
   * Surfaces a non-fatal problem (missing texture, bad font, …) to the host.
   * The editor routes this to its status bar; the runtime ignores it.
   */
  readonly reportWarning?: (message: string) => void;
}

/**
 * The single seam shared by the editor preview and the runtime: component props
 * in, Pixi display object out.
 */
export interface RendererView<TProps> {
  readonly displayObject: Container;

  create(): void;

  update(props: TProps, context: RenderContext): void | Promise<void>;

  destroy(): void;
}

/** An `AssetResolver` for renderers that are constructed before assets exist. */
export const nullAssetResolver: AssetResolver = {
  getUrl: () => null,
  loadTexture: async () => {
    throw new Error('No AssetResolver is attached');
  },
  loadFont: async () => {
    throw new Error('No AssetResolver is attached');
  },
};
