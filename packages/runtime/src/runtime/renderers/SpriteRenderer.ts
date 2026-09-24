import type { AssetRef } from '@pxe/schema';
import {
  nullAssetResolver,
  PixiSpriteRendererView,
  resolveSpriteSize,
  SpriteSizeModes,
  spriteRendererFactory,
  type BlendMode,
  type RenderContext,
  type SpriteRendererProps,
  type SpriteSizeMode,
} from '@pxe/rendering';
import { Component } from '../Component';
import type { AssetManager } from '../AssetManager';
import { RuntimeAssetResolver } from '../RuntimeAssetResolver';

export { SpriteSizeModes, resolveSpriteSize, spriteRendererFactory };
export type { SpriteSizeMode, SpriteRendererProps };

/**
 * Runtime sprite component.
 *
 * A thin adapter: it holds component data and hands it to the shared
 * `PixiSpriteRendererView`, which is the same view the editor preview uses. All
 * sizing/appearance logic lives in `@pxe/rendering`, so the editor cannot drift.
 */
export class SpriteRenderer extends Component {
  private view: PixiSpriteRendererView | null = new PixiSpriteRendererView();
  private resolver: RuntimeAssetResolver | null = null;

  texture: AssetRef | null = null;
  sizeMode: SpriteSizeMode = 'stretch';
  tint = '#ffffff';
  alpha = 1;
  blendMode: BlendMode = 'normal';
  /** `sizeMode: 'custom'` only. */
  width: number | null = null;
  height: number | null = null;
  anchorX = 0;
  anchorY = 0;

  setAssetManager(assets: AssetManager): void {
    this.resolver = new RuntimeAssetResolver(assets);
  }

  onLoad(): void {
    const view = this.ensureView();
    view.create();
    this.node.view.addChild(view.displayObject);
    this.applyProperties();
  }

  applyProperties(): void {
    if (!this.view) {
      return;
    }

    this.view.update(this.toProps(), this.renderContext());
  }

  onDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  private ensureView(): PixiSpriteRendererView {
    this.view ??= new PixiSpriteRendererView();
    return this.view;
  }

  /**
   * Props go through the shared factory resolver, so every default
   * (`sizeMode`, `tint`, `blendMode`, …) is defined exactly once.
   */
  private toProps(): SpriteRendererProps {
    return spriteRendererFactory.resolveProps({
      texture: this.texture,
      sizeMode: this.sizeMode,
      tint: this.tint,
      alpha: this.alpha,
      blendMode: this.blendMode,
      width: this.width,
      height: this.height,
      anchorX: this.anchorX,
      anchorY: this.anchorY,
      visible: this.enabled,
    });
  }

  private renderContext(): RenderContext {
    return {
      mode: 'runtime',
      assets: this.resolver ?? nullAssetResolver,
      resolution: this.node.resolution,
      transform: this.node.rectTransform,
    };
  }
}
