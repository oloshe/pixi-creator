import type { AssetRef } from '@pxe/schema';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { RenderContext, RendererView } from '../core/RendererView';
import type { RendererFactory } from '../core/RendererRegistry';
import { buildSignature } from '../core/signature';
import { isAssetRef, toBlendMode, toColor, toNullableNumber, toNumber, type BlendMode } from '../core/visual';

export const SpriteSizeModes = ['native', 'custom', 'stretch', 'contain', 'cover'] as const;

export type SpriteSizeMode = (typeof SpriteSizeModes)[number];

export function isSpriteSizeMode(value: unknown): value is SpriteSizeMode {
  return typeof value === 'string' && (SpriteSizeModes as readonly string[]).includes(value);
}

/**
 * Size modes are shared by the runtime component and the editor preview so both
 * always agree on what a sprite looks like.
 */
export function resolveSpriteSize(
  mode: SpriteSizeMode,
  rect: { width: number; height: number },
  texture: { width: number; height: number },
  custom: { width?: number | null; height?: number | null } = {},
): { width: number | null; height: number | null } {
  switch (mode) {
    case 'native':
      return { width: texture.width || null, height: texture.height || null };
    case 'custom':
      return {
        width: custom.width ?? (rect.width || null),
        height: custom.height ?? (rect.height || null),
      };
    case 'contain':
    case 'cover': {
      if (!rect.width || !rect.height || !texture.width || !texture.height) {
        return { width: rect.width || null, height: rect.height || null };
      }

      const ratio = mode === 'contain'
        ? Math.min(rect.width / texture.width, rect.height / texture.height)
        : Math.max(rect.width / texture.width, rect.height / texture.height);

      return { width: texture.width * ratio, height: texture.height * ratio };
    }
    case 'stretch':
    default:
      return { width: rect.width || null, height: rect.height || null };
  }
}

/**
 * Sprite-specific props.
 *
 * Note what is *absent*: position, rotation, scale and pivot. Those belong to the
 * node container (`applyRectTransform`); a sprite renderer only draws itself
 * inside the node rect, whose local `0,0` is the rect's top-left corner.
 * Anchoring is expressed through the node's normalized pivot rather than a
 * second, competing anchor system.
 */
export interface SpriteRendererProps {
  texture: AssetRef | null;
  sizeMode: SpriteSizeMode;
  tint: string;
  /** Extra multiplier on top of the node's own alpha. */
  alpha: number;
  blendMode: BlendMode;
  /** `sizeMode: 'custom'` only. */
  width: number | null;
  height: number | null;
  visible: boolean;
}

export function resolveSpriteRendererProps(raw: Record<string, unknown>): SpriteRendererProps {
  return {
    texture: isAssetRef(raw.texture) ? { assetId: raw.texture.assetId } : null,
    sizeMode: isSpriteSizeMode(raw.sizeMode) ? raw.sizeMode : 'stretch',
    tint: toColor(raw.tint, '#ffffff'),
    alpha: toNumber(raw.alpha, 1),
    blendMode: (typeof raw.blendMode === 'string' ? raw.blendMode : 'normal') as BlendMode,
    width: toNullableNumber(raw.width),
    height: toNullableNumber(raw.height),
    visible: raw.visible !== false,
  };
}

/**
 * Draws a texture inside the node rect.
 *
 * The display object is a container so the editor can show a "no texture yet"
 * placeholder behind the sprite without leaking editor concerns into the runtime
 * path: the placeholder is only drawn when `context.mode === 'editor'`.
 *
 * The view caches its last props/context and re-applies itself when an async
 * texture load lands, so a host that only renders on demand still sees the
 * texture the moment it is available.
 */
export class PixiSpriteRendererView implements RendererView<SpriteRendererProps> {
  readonly displayObject = new Container();

  private readonly sprite = new Sprite(Texture.EMPTY);
  private readonly placeholder = new Graphics();

  private created = false;
  private destroyed = false;
  private signature = '';
  private props: SpriteRendererProps | null = null;
  private context: RenderContext | null = null;

  private loadedAssetId: string | null = null;
  private loadingAssetId: string | null = null;
  private failedAssetId: string | null = null;

  create(): void {
    if (this.created || this.destroyed) {
      return;
    }

    this.created = true;
    this.displayObject.label = 'sprite-renderer';
    this.sprite.anchor.set(0, 0);
    this.displayObject.addChild(this.placeholder, this.sprite);
  }

  update(props: SpriteRendererProps, context: RenderContext): void {
    if (this.destroyed) {
      return;
    }

    if (!this.created) {
      this.create();
    }

    this.props = props;
    this.context = context;

    this.syncTexture();
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
    // Textures belong to the asset cache, never to the view.
    this.displayObject.destroy({ children: true, texture: false, textureSource: false });
  }

  /** Applies the cached props; safe to call again after an async asset lands. */
  private apply(): void {
    const props = this.props;
    const context = this.context;

    if (this.destroyed || !props || !context) {
      return;
    }

    // Both the editor preview and the runtime size sprites from the node's
    // *logical* rect, never from the scaled display object.
    const rect = { width: context.transform.width, height: context.transform.height };
    const texture = this.sprite.texture;
    const hasTexture = texture !== Texture.EMPTY && texture.width > 0 && texture.height > 0;
    const textureSize = {
      width: hasTexture ? texture.width : 0,
      height: hasTexture ? texture.height : 0,
    };
    const size = resolveSpriteSize(props.sizeMode, rect, textureSize, {
      width: props.width,
      height: props.height,
    });
    const showPlaceholder = !hasTexture && context.mode === 'editor';

    const signature = buildSignature([
      props.sizeMode,
      props.tint,
      props.alpha,
      props.blendMode,
      props.visible,
      props.width,
      props.height,
      rect.width,
      rect.height,
      textureSize.width,
      textureSize.height,
      showPlaceholder,
    ]);

    if (signature === this.signature) {
      return;
    }

    this.signature = signature;

    this.displayObject.visible = props.visible;
    this.sprite.visible = hasTexture;
    this.sprite.tint = props.tint;
    this.sprite.alpha = props.alpha;
    this.sprite.blendMode = toBlendMode(props.blendMode);

    if (size.width != null) {
      this.sprite.width = size.width;
    }

    if (size.height != null) {
      this.sprite.height = size.height;
    }

    // Aspect-preserving modes stay centred inside the rect.
    if (props.sizeMode === 'contain' || props.sizeMode === 'cover') {
      this.sprite.position.set(
        (rect.width - (size.width ?? 0)) / 2,
        (rect.height - (size.height ?? 0)) / 2,
      );
    } else {
      this.sprite.position.set(0, 0);
    }

    this.placeholder.clear();
    this.placeholder.visible = showPlaceholder;

    if (showPlaceholder) {
      this.placeholder
        .rect(0, 0, Math.max(4, rect.width), Math.max(4, rect.height))
        .stroke({ color: 0x64748b, width: 1 });
    }
  }

  private syncTexture(): void {
    const props = this.props;
    const context = this.context;

    if (!props || !context) {
      return;
    }

    const assetId = props.texture?.assetId ?? null;

    if (assetId === null) {
      if (this.loadedAssetId !== null || this.failedAssetId !== null) {
        this.loadedAssetId = null;
        this.failedAssetId = null;
        this.sprite.texture = Texture.EMPTY;
        this.signature = '';
      }

      return;
    }

    if (assetId === this.loadedAssetId || assetId === this.loadingAssetId || assetId === this.failedAssetId) {
      return;
    }

    this.loadingAssetId = assetId;

    void context.assets
      .loadTexture(assetId)
      .then((texture) => {
        this.loadingAssetId = null;

        if (this.destroyed) {
          return;
        }

        this.loadedAssetId = assetId;
        this.sprite.texture = texture;
        this.signature = '';
        this.apply();
        context.requestRender?.();
      })
      .catch((error: unknown) => {
        this.loadingAssetId = null;

        if (this.destroyed) {
          return;
        }

        this.failedAssetId = assetId;
        this.loadedAssetId = null;
        this.sprite.texture = Texture.EMPTY;
        this.signature = '';
        context.reportWarning?.(`Texture error (${assetId}): ${String(error)}`);
        this.apply();
        context.requestRender?.();
      });
  }
}

export const spriteRendererFactory: RendererFactory<SpriteRendererProps> = {
  type: 'engine.SpriteRenderer',
  create: () => new PixiSpriteRendererView(),
  resolveProps: resolveSpriteRendererProps,
};
