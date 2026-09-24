import type { ProjectAsset } from './projectSession';

export interface AssetFilterOptions {
  query: string;
  /** Optional `PropertyDefinition.assetType` filter (e.g. `texture`, `font`). */
  assetType?: string;
}

/**
 * Filters project assets for the Inspector asset picker.
 *
 * A query matches display name, project path or the stable asset id, so a user
 * can search by name or paste an id. Empty query returns every asset of the
 * requested type, sorted by display name.
 */
export function filterAssets(assets: ProjectAsset[], options: AssetFilterOptions): ProjectAsset[] {
  const needle = options.query.trim().toLowerCase();
  const type = options.assetType;

  const matching = assets.filter((asset) => {
    if (type && asset.type !== type) return false;
    if (!needle) return true;
    return `${asset.displayName} ${asset.path} ${asset.id}`.toLowerCase().includes(needle);
  });

  return [...matching].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The asset with an exact id match, if any — used to keep stale ids editable. */
export function findAssetById(assets: ProjectAsset[], assetId: string): ProjectAsset | null {
  return assets.find((asset) => asset.id === assetId) ?? null;
}
