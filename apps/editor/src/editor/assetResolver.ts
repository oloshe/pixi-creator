import type { AssetManifest } from '@pxe/schema';
import { pixiAssetSource, type AssetResolver } from '@pxe/rendering';
import { Assets, Texture } from 'pixi.js';

/**
 * Editor asset adapter.
 *
 * Resolves asset ids through the project's asset database and loads them with
 * Pixi's `Assets` cache — the same code path Play uses, so a texture that loads
 * in the preview loads identically in the game.
 *
 * Project files are handed over as `blob:` object URLs (the picked folder is not
 * served over HTTP), which is why every entry carries its original `format`: Pixi
 * picks a loader from the URL extension and a blob URL has none.
 *
 * The renderers only ever see the `AssetResolver` interface, so nothing in the
 * shared rendering layer knows whether a texture came from the project folder or
 * from a CDN manifest.
 */
export class LocalProjectAssetResolver implements AssetResolver {
  private readonly byId = new Map<string, { url: string; format?: string }>();
  private readonly pendingTextures = new Map<string, Promise<Texture>>();
  private readonly pendingFonts = new Map<string, Promise<void>>();

  constructor(manifest: AssetManifest) {
    for (const asset of manifest.assets) {
      this.byId.set(asset.id, { url: asset.path, format: asset.format });
    }
  }

  getUrl(assetId: string): string | null {
    return this.byId.get(assetId)?.url ?? null;
  }

  async loadTexture(assetId: string): Promise<Texture> {
    const source = this.sourceFor(assetId);
    const pending = this.pendingTextures.get(source.src) ?? Assets.load<Texture>(source);

    this.pendingTextures.set(source.src, pending);

    try {
      return await pending;
    } catch (error) {
      this.pendingTextures.delete(source.src);
      throw error;
    }
  }

  async loadFont(assetId: string): Promise<void> {
    const source = this.sourceFor(assetId);
    const pending = this.pendingFonts.get(source.src) ?? Assets.load(source);
    this.pendingFonts.set(source.src, pending);

    try {
      await pending;
    } catch (error) {
      this.pendingFonts.delete(source.src);
      throw error;
    }

    // Pixi's web-font loader registers the face with the document; awaiting
    // `document.fonts.ready` makes it measurable before text metrics are read.
    if (typeof document !== 'undefined' && document.fonts) {
      await document.fonts.ready;
    }
  }

  private sourceFor(assetId: string): { src: string; parser?: string } {
    const entry = this.byId.get(assetId);

    if (!entry) {
      throw new Error(`Unknown asset: ${assetId}`);
    }

    return pixiAssetSource(entry.url, entry.format);
  }
}
