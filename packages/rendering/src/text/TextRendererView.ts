import type { AssetRef } from '@pxe/schema';
import {
  getFontFamilyName,
  Text,
  type TextStyleAlign,
  type TextStyleFontWeight,
  type TextStyleOptions,
} from 'pixi.js';
import type { RenderContext, RendererView } from '../core/RendererView';
import type { RendererFactory } from '../core/RendererRegistry';
import { buildSignature } from '../core/signature';
import { isAssetRef, toColor, toNumber, toStringValue, toUnit } from '../core/visual';

export const TextAligns = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TextAligns)[number];

/**
 * Text props.
 *
 * This is the contract the Inspector edits and both renderers consume. Adding a
 * property here is the *only* way to change how text looks — neither the editor
 * nor the runtime may special-case text styling.
 */
export interface TextRendererProps {
  text: string;

  fontFamily: string;
  fontSize: number;
  fontWeight: string;

  color: string;

  /** Horizontal alignment of wrapped lines (`TextStyle.align`). */
  align: TextAlign;
  /** Normalized `0 → 1` anchor of the text box within the node rect. */
  anchorX: number;
  anchorY: number;

  wordWrap: boolean;
  /** `0` (or negative) means "wrap at the node rect width". */
  wordWrapWidth: number;

  letterSpacing: number;
  /** `undefined` means "let Pixi derive it from the font". */
  lineHeight?: number;

  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;

  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  /** Degrees, clockwise from "to the right". */
  shadowAngle: number;
  shadowDistance: number;

  /** Optional project font asset; the family name is derived from its URL. */
  fontAsset: AssetRef | null;

  visible: boolean;
}

export function isTextAlign(value: unknown): value is TextAlign {
  return typeof value === 'string' && (TextAligns as readonly string[]).includes(value);
}

export function resolveTextRendererProps(raw: Record<string, unknown>): TextRendererProps {
  const lineHeight = raw.lineHeight;

  return {
    text: toStringValue(raw.text, ''),
    fontFamily: toStringValue(raw.fontFamily, 'Arial'),
    fontSize: toNumber(raw.fontSize, 32),
    fontWeight: toStringValue(raw.fontWeight, 'normal'),
    color: toColor(raw.color, '#ffffff'),
    align: isTextAlign(raw.align) ? raw.align : 'left',
    anchorX: toUnit(raw.anchorX, 0),
    anchorY: toUnit(raw.anchorY, 0),
    wordWrap: raw.wordWrap === true,
    wordWrapWidth: toNumber(raw.wordWrapWidth, 0),
    letterSpacing: toNumber(raw.letterSpacing, 0),
    lineHeight: typeof lineHeight === 'number' && Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : undefined,
    strokeEnabled: raw.strokeEnabled === true,
    strokeColor: toColor(raw.strokeColor, '#000000'),
    strokeWidth: toNumber(raw.strokeWidth, 0),
    shadowEnabled: raw.shadowEnabled === true,
    shadowColor: toColor(raw.shadowColor, '#000000'),
    shadowBlur: toNumber(raw.shadowBlur, 0),
    shadowAngle: toNumber(raw.shadowAngle, 45),
    shadowDistance: toNumber(raw.shadowDistance, 0),
    fontAsset: isAssetRef(raw.fontAsset) ? { assetId: raw.fontAsset.assetId } : null,
    visible: raw.visible !== false,
  };
}

/**
 * `TextRendererProps` → Pixi `TextStyle`.
 *
 * Extracted deliberately: this is the one function that decides what text looks
 * like, and both the editor preview and the runtime call it. A `div`/`span`
 * approximation in the editor is therefore impossible by construction.
 */
export function createPixiTextStyle(
  props: TextRendererProps,
  rect: { width: number; height: number },
): TextStyleOptions {
  const style: TextStyleOptions = {
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    fontWeight: props.fontWeight as TextStyleFontWeight,
    fill: props.color,
    align: props.align as TextStyleAlign,
    letterSpacing: props.letterSpacing,
    wordWrap: props.wordWrap,
    wordWrapWidth: resolveWordWrapWidth(props, rect),
  };

  if (props.lineHeight != null) {
    style.lineHeight = props.lineHeight;
  }

  if (props.strokeEnabled && props.strokeWidth > 0) {
    style.stroke = {
      color: props.strokeColor,
      width: props.strokeWidth,
      join: 'round',
    };
  }

  if (props.shadowEnabled) {
    style.dropShadow = {
      color: props.shadowColor,
      blur: props.shadowBlur,
      angle: (props.shadowAngle * Math.PI) / 180,
      distance: props.shadowDistance,
      alpha: 1,
    };
  }

  return style;
}

/** `wordWrapWidth: 0` means "wrap at the node rect width". */
export function resolveWordWrapWidth(
  props: TextRendererProps,
  rect: { width: number; height: number },
): number {
  if (props.wordWrapWidth > 0) {
    return props.wordWrapWidth;
  }

  return Math.max(0, rect.width);
}

/**
 * The text renderer's own diff key.
 *
 * Kept next to the props so a new prop cannot be added without showing up here;
 * a stale key would freeze the text on screen.
 */
function textSignature(props: TextRendererProps, fontFamily: string, rect: { width: number; height: number }): string {
  return buildSignature([
    props.text,
    fontFamily,
    props.fontSize,
    props.fontWeight,
    props.color,
    props.align,
    props.anchorX,
    props.anchorY,
    props.wordWrap,
    props.wordWrapWidth,
    props.letterSpacing,
    props.lineHeight,
    props.strokeEnabled,
    props.strokeColor,
    props.strokeWidth,
    props.shadowEnabled,
    props.shadowColor,
    props.shadowBlur,
    props.shadowAngle,
    props.shadowDistance,
    props.visible,
    rect.width,
    rect.height,
  ]);
}

/**
 * Draws text with `PIXI.Text`, aligned inside the node rect.
 *
 * The node pivot only moves the rect; it never shifts the glyphs. The text box
 * anchor (`0 → 1`) places the box inside the rect; `align` only affects how
 * wrapped lines line up within the text box itself.
 */
export class PixiTextRendererView implements RendererView<TextRendererProps> {
  readonly displayObject = new Text({ text: '', style: {} });

  private created = false;
  private destroyed = false;
  private signature = '';
  private props: TextRendererProps | null = null;
  private context: RenderContext | null = null;

  private loadedFontAssetId: string | null = null;
  private loadedFontFamily: string | null = null;
  private loadingFontAssetId: string | null = null;
  private failedFontAssetId: string | null = null;

  create(): void {
    if (this.created || this.destroyed) {
      return;
    }

    this.created = true;
    this.displayObject.label = 'text-renderer';
  }

  update(props: TextRendererProps, context: RenderContext): void {
    if (this.destroyed) {
      return;
    }

    if (!this.created) {
      this.create();
    }

    this.props = props;
    this.context = context;

    this.syncFont();
    this.apply();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.created = false;
    this.signature = '';
    this.props = null;
    this.context = null;
    this.displayObject.destroy({ texture: false, textureSource: false });
  }

  /** Applies the cached props; safe to call again after an async font load. */
  private apply(): void {
    const props = this.props;
    const context = this.context;

    if (this.destroyed || !props || !context) {
      return;
    }

    const fontFamily = this.effectiveFontFamily();
    const rect = { width: context.transform.width, height: context.transform.height };
    const signature = textSignature(props, fontFamily, rect);

    if (signature === this.signature) {
      return;
    }

    this.displayObject.text = props.text;
    this.displayObject.style = createPixiTextStyle({ ...props, fontFamily }, rect);
    this.displayObject.visible = props.visible;

    // The anchor places the text box within the node rect: `0` top-left,
    // `0.5` centred, `1` bottom-right. Pixi's anchor means no text measurement
    // is needed for vertical alignment.
    this.displayObject.anchor.set(props.anchorX, props.anchorY);
    this.displayObject.position.set(rect.width * props.anchorX, rect.height * props.anchorY);

    this.signature = signature;
  }

  private effectiveFontFamily(): string {
    if (this.props?.fontAsset && this.loadedFontAssetId === this.props.fontAsset.assetId && this.loadedFontFamily) {
      return this.loadedFontFamily;
    }

    return this.props?.fontFamily ?? 'Arial';
  }

  /**
   * Resolves the effective font family, loading the project font asset first.
   *
   * Until the face is ready the fallback family is used, so the editor never
   * blocks on a font; once it loads the view re-applies itself and text metrics
   * become identical to the runtime's.
   */
  private syncFont(): void {
    const props = this.props;
    const context = this.context;

    if (!props || !context) {
      return;
    }

    const assetId = props.fontAsset?.assetId ?? null;

    if (assetId === null) {
      this.loadedFontAssetId = null;
      this.loadedFontFamily = null;
      this.failedFontAssetId = null;
      return;
    }

    if (assetId === this.loadedFontAssetId || assetId === this.loadingFontAssetId || assetId === this.failedFontAssetId) {
      return;
    }

    this.loadingFontAssetId = assetId;

    void context.assets
      .loadFont(assetId)
      .then(() => {
        this.loadingFontAssetId = null;

        if (this.destroyed) {
          return;
        }

        const url = context.assets.getUrl(assetId);
        this.loadedFontAssetId = assetId;
        this.loadedFontFamily = url ? getFontFamilyName(url) : props.fontFamily;
        this.signature = '';
        this.apply();
        context.requestRender?.();
      })
      .catch((error: unknown) => {
        this.loadingFontAssetId = null;

        if (this.destroyed) {
          return;
        }

        this.failedFontAssetId = assetId;
        this.loadedFontAssetId = null;
        this.loadedFontFamily = null;
        this.signature = '';
        context.reportWarning?.(`Font error (${assetId}): ${String(error)}`);
        this.apply();
        context.requestRender?.();
      });
  }
}

export const textRendererFactory: RendererFactory<TextRendererProps> = {
  type: 'engine.TextRenderer',
  create: () => new PixiTextRendererView(),
  resolveProps: resolveTextRendererProps,
};
