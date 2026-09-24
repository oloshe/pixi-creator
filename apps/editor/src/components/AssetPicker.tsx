import { useEffect, useMemo, useRef, useState } from 'react';
import { ASSET_DRAG_TYPE } from '../editor/componentManifest';
import { filterAssets, findAssetById } from '../editor/assetPicker';
import type { ProjectAsset } from '../editor/projectSession';
import { useI18n } from '../i18n';
import { AssetIcon } from './AssetIcon';

export interface AssetPickerProps {
  /** Current `{ assetId }` value, or `null`. */
  value: { assetId: string } | null;
  assets: ProjectAsset[];
  /** Optional `PropertyDefinition.assetType` filter. */
  assetType?: string;
  label?: string;
  onChange(value: { assetId: string } | null): void;
}

/**
 * Generic searchable asset picker used by every `asset`-typed property
 * (SpriteRenderer texture, TextRenderer fontAsset, project components…).
 *
 * Supports free-text search over display name / path / asset id, plus the
 * original drag-and-drop from the Assets Browser. Stale ids are kept editable as
 * a "Missing" row instead of being silently dropped.
 */
export function AssetPicker({ value, assets, assetType, label, onChange }: AssetPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLLabelElement | null>(null);

  const assetId = value?.assetId ?? '';
  const selected = assetId ? findAssetById(assets, assetId) : null;
  const missing = Boolean(assetId) && !selected;

  const options = useMemo(
    () => filterAssets(assets, { query, assetType }),
    [assets, query, assetType],
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function choose(next: { assetId: string } | null) {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  return (
    <label
      ref={rootRef}
      className="assetPicker"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(ASSET_DRAG_TYPE)) event.preventDefault();
      }}
      onDrop={(event) => {
        const path = event.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!path) return;
        const asset = assets.find((item) => item.path === path);
        if (asset) {
          event.preventDefault();
          event.stopPropagation();
          onChange({ assetId: asset.id });
          setOpen(false);
        }
      }}
    >
      <span className="assetPickerLabel">{label}</span>
      <input
        className="assetPickerInput"
        value={query}
        placeholder={selected ? selected.displayName : missing ? `${t('common.missing')}: ${assetId}` : t('common.none')}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="assetPickerList" role="listbox">
          <button type="button" className="assetPickerOption" onClick={() => choose(null)}>
            {t('common.none')}
          </button>
          {missing && (
            <button type="button" className="assetPickerOption missing" onClick={() => choose({ assetId })}>
              {t('common.missing')}: {assetId}
            </button>
          )}
          {options.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`assetPickerOption ${asset.id === assetId ? 'selected' : ''}`}
              onClick={() => choose({ assetId: asset.id })}
            >
              <AssetIcon type={asset.type} url={asset.url} size={14} />
              <span className="assetPickerName">{asset.displayName}</span>
              <span className="assetPickerPath">{asset.path}</span>
            </button>
          ))}
          {options.length === 0 && !missing && (
            <div className="assetPickerEmpty">{t('palette.noMatch')}</div>
          )}
        </div>
      )}
    </label>
  );
}
