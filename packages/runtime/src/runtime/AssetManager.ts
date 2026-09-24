import type { AssetManifest, AssetMeta } from '@pxe/schema';
import { AssetManifestSchema } from '@pxe/schema';
import { pixiAssetSource } from '@pxe/rendering';
import { Assets } from 'pixi.js';

export class AssetManager {
  private readonly assetsById = new Map<string, AssetMeta>();
  private readonly loaded = new Map<string, unknown>();
  private manifest: AssetManifest | null = null;

  async init(manifest: AssetManifest): Promise<void> {
    const parsed = AssetManifestSchema.parse(manifest);
    this.manifest = parsed;
    this.assetsById.clear();
    this.loaded.clear();

    for (const asset of parsed.assets) {
      this.assetsById.set(asset.id, asset);
    }
  }

  getManifest(): AssetManifest | null {
    return this.manifest;
  }

  getMeta(assetId: string): AssetMeta | undefined {
    return this.assetsById.get(assetId);
  }

  async load<T = unknown>(assetId: string): Promise<T> {
    if (this.loaded.has(assetId)) {
      return this.loaded.get(assetId) as T;
    }

    if (!this.assetsById.has(assetId)) {
      throw new Error(`Unknown asset: ${assetId}`);
    }

    const meta = this.assetsById.get(assetId)!;
    // Cache by URL: two mounted scenes may reuse an id for different images.
    const asset = await Assets.load<T>(pixiAssetSource(meta.path, meta.format));
    this.loaded.set(assetId, asset);
    return asset;
  }

  async loadBundle(bundleId: string): Promise<void> {
    const metas = [...this.assetsById.values()].filter((asset) => asset.bundle === bundleId);

    await Promise.all(metas.map((asset) => this.load(asset.id)));
  }

  async loadScenePreload(sceneId: string): Promise<void> {
    const preload = this.manifest?.scenePreloads[sceneId];

    if (!preload) {
      return;
    }

    if (preload.bundle) {
      await this.loadBundle(preload.bundle);
    }

    await Promise.all(preload.preload.map((assetId) => this.load(assetId)));
  }

  async unload(assetId: string): Promise<void> {
    if (!this.loaded.has(assetId)) {
      return;
    }

    this.loaded.delete(assetId);
    const meta = this.assetsById.get(assetId);
    if (meta) await Assets.unload(meta.path);
  }

  get<T = unknown>(assetId: string): T | undefined {
    return this.loaded.get(assetId) as T | undefined;
  }
}
