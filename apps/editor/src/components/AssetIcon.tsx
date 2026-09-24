import { useState, type ComponentType } from 'react';
import type { AssetType } from '@pxe/schema';
import { AudioIcon, FontIcon, ImageIcon, JsonIcon, PrefabIcon, SceneIcon } from './icons';

const typeIcons: Record<AssetType, ComponentType<{ size?: number }>> = {
  texture: ImageIcon,
  audio: AudioIcon,
  font: FontIcon,
  json: JsonIcon,
  scene: SceneIcon,
  prefab: PrefabIcon,
};

export interface AssetIconProps {
  type: AssetType;
  /** Blob URL for loadable types; textures render a real thumbnail. */
  url?: string | null;
  size?: number;
}

/**
 * Asset type icon, or a real image preview for textures.
 *
 * Textures reuse the `blob:` URL already cached by `ProjectSession` — no separate
 * thumbnail cache. `loading="lazy"` + a small inline size keeps long lists cheap,
 * and any decode failure falls back to the vector type icon.
 */
export function AssetIcon({ type, url, size = 16 }: AssetIconProps) {
  const [failed, setFailed] = useState(false);
  const Icon = typeIcons[type];

  if (type === 'texture' && url && !failed) {
    return (
      <img
        className="assetThumb"
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return <Icon size={size} />;
}
