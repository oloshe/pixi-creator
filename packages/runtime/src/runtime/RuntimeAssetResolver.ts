import type { AssetResolver } from '@pxe/rendering';
import type { Texture } from 'pixi.js';
import type { AssetManager } from './AssetManager';

/**
 * Runtime asset adapter.
 *
 * Uses the scene's asset manifest and Pixi's `Assets` cache. The editor ships a
 * different adapter (`LocalProjectAssetResolver`) over the same `AssetResolver`
 * interface, which is why a renderer never needs to know where a texture came
 * from.
 */
export class RuntimeAssetResolver implements AssetResolver {
  constructor(private readonly assets: AssetManager) {}

  getUrl(assetId: string): string | null {
    return this.assets.getMeta(assetId)?.path ?? null;
  }

  async loadTexture(assetId: string): Promise<Texture> {
    return this.assets.load<Texture>(assetId);
  }

  async loadFont(assetId: string): Promise<void> {
    await this.assets.load(assetId);
  }
}
