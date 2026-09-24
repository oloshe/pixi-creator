import type { AssetRef } from '@pxe/schema';
import {
  nullAssetResolver,
  PixiTextRendererView,
  textRendererFactory,
  type RenderContext,
  type TextAlign,
  type TextRendererProps,
  type TextVerticalAlign,
} from '@pxe/rendering';
import { Component } from '../Component';
import type { AssetManager } from '../AssetManager';
import { RuntimeAssetResolver } from '../RuntimeAssetResolver';

export type { TextAlign, TextRendererProps, TextVerticalAlign };

/**
 * Runtime text component.
 *
 * Delegates to the shared `PixiTextRendererView` — the same `PIXI.Text` path the
 * editor preview uses. Text is never approximated with DOM nodes in the editor,
 * so bounds, wrapping, stroke and shadow match by construction.
 */
export class TextRenderer extends Component {
  private view: PixiTextRendererView | null = new PixiTextRendererView();
  private resolver: RuntimeAssetResolver | null = null;

  text = '';
  fontFamily = 'Arial';
  fontSize = 32;
  fontWeight = 'normal';
  color = '#ffffff';
  align: TextAlign = 'left';
  verticalAlign: TextVerticalAlign = 'top';
  wordWrap = false;
  /** `0` means "wrap at the node rect width". */
  wordWrapWidth = 0;
  letterSpacing = 0;
  /** `undefined` means "derive it from the font". */
  lineHeight?: number;
  strokeEnabled = false;
  strokeColor = '#000000';
  strokeWidth = 0;
  shadowEnabled = false;
  shadowColor = '#000000';
  shadowBlur = 0;
  shadowAngle = 45;
  shadowDistance = 0;
  /** Optional project font; loaded through the shared `AssetResolver`. */
  fontAsset: AssetRef | null = null;

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

  private ensureView(): PixiTextRendererView {
    this.view ??= new PixiTextRendererView();
    return this.view;
  }

  private toProps(): TextRendererProps {
    return textRendererFactory.resolveProps({
      text: this.text,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      color: this.color,
      align: this.align,
      verticalAlign: this.verticalAlign,
      wordWrap: this.wordWrap,
      wordWrapWidth: this.wordWrapWidth,
      letterSpacing: this.letterSpacing,
      lineHeight: this.lineHeight,
      strokeEnabled: this.strokeEnabled,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      shadowEnabled: this.shadowEnabled,
      shadowColor: this.shadowColor,
      shadowBlur: this.shadowBlur,
      shadowAngle: this.shadowAngle,
      shadowDistance: this.shadowDistance,
      fontAsset: this.fontAsset,
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
