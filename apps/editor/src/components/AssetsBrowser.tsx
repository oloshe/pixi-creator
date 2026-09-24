import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { assetDatabasePath, type AssetType } from '@pxe/schema';
import { ASSET_DRAG_TYPE } from '../editor/componentManifest';
import { useEditorStore } from '../editor/store';
import { useI18n } from '../i18n';
import type { ProjectAsset } from '../editor/projectSession';
import { AssetIcon } from './AssetIcon';

const typeOrder: AssetType[] = ['scene', 'prefab', 'texture', 'font', 'audio', 'json'];

/**
 * Assets Browser.
 *
 * A flat, folder-grouped list over the project's asset database. Selecting an
 * asset shows a floating detail card that follows the row while scrolling and
 * snaps to the panel edge when the row leaves view.
 */
export function AssetsBrowser() {
  const { t } = useI18n();
  const project = useEditorStore((state) => state.project);
  const assets = useEditorStore((state) => state.assets);
  const scenePath = useEditorStore((state) => state.scenePath);
  const busy = useEditorStore((state) => state.busy);
  const openScene = useEditorStore((state) => state.openScene);
  const refreshAssets = useEditorStore((state) => state.refreshAssets);
  const setStatus = useEditorStore((state) => state.setStatus);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cardPos, setCardPos] = useState<{ top: number; right: number; width: number } | null>(null);

  const browserRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(() => groupByFolder(assets, query), [assets, query]);
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  useLayoutEffect(() => {
    const browser = browserRef.current;
    const row = rowRef.current;

    if (!browser || !row || !selected) {
      setCardPos(null);
      return;
    }

    const measure = () => {
      const bounds = browser.getBoundingClientRect();
      const rowBounds = row.getBoundingClientRect();
      const width = Math.min(240, bounds.width - 16);
      const height = cardRef.current?.offsetHeight ?? 200;
      const top = Math.max(bounds.top + 4, Math.min(rowBounds.top - 4, bounds.bottom - height - 4));
      setCardPos({ top, right: window.innerWidth - bounds.right + 8, width });
    };

    measure();
    browser.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      browser.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [selected?.id, assets]);

  if (!project) {
    return <div className="hint panelHint">{t('assets.noProject')}</div>;
  }

  return (
    <div ref={browserRef} className="assetsBrowser">
      <div className="panelHeader">
        <span title={project.rootName}>{t('assets.title')} · {project.name}</span>
        <div className="inlineActions">
          <button type="button" disabled={busy} onClick={() => void refreshAssets()} title={t('assets.rescanTitle')}>
            {t('assets.rescan')}
          </button>
        </div>
      </div>

      <div className="assetsToolbar">
        <input
          aria-label={t('assets.searchPlaceholder')}
          placeholder={t('assets.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="hint">
          {t('assets.count', { count: assets.length, path: assetDatabasePath })}
          {project.hasWriteAccess ? '' : t('assets.readonly')}
        </span>
      </div>

      <div className="assetList">
        {groups.map((group) => (
          <div key={group.path || '.'} className="assetGroup">
            <div className="assetGroupHeader">{group.path || `${project.assetsDir}/`}</div>
            {group.assets.map((asset) => (
              <button
                key={asset.id}
                ref={asset.id === selectedId ? rowRef : undefined}
                type="button"
                className={`assetRow ${asset.id === selectedId ? 'selected' : ''} ${asset.path === scenePath ? 'open' : ''}`}
                draggable
                title={`${asset.path}\nid: ${asset.id}`}
                onDragStart={(event) => {
                  event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.path);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => setSelectedId(asset.id)}
                onDoubleClick={() => {
                  if (asset.type === 'scene') {
                    void openScene(asset.path);
                  } else if (asset.url) {
                    window.open(asset.url, '_blank', 'noopener');
                  }
                }}
              >
                <AssetIcon type={asset.type} url={asset.url} size={18} />
                <span className="assetName">{asset.displayName}</span>
                <span className="assetExtension">{asset.path.split('.').slice(1).join('.')}</span>
              </button>
            ))}
          </div>
        ))}
        {assets.length === 0 && (
          <p className="hint panelHint">
            {t('assets.noAssets', { dir: `${project.assetsDir}/` })}
          </p>
        )}
      </div>

      {selected && (
        <div
          ref={cardRef}
          className="assetDetails floating"
          style={cardPos ? { top: cardPos.top, right: cardPos.right, width: cardPos.width, opacity: 1 } : { opacity: 0 }}
        >
          <div className="assetDetailsTitle">
            <AssetIcon type={selected.type} url={selected.url} size={16} />
            {selected.displayName}
          </div>
          <dl>
            <dt>{t('assets.type')}</dt>
            <dd>{selected.type}</dd>
            <dt>{t('assets.path')}</dt>
            <dd title={selected.path}>{selected.path}</dd>
            <dt>{t('assets.assetId')}</dt>
            <dd>
              <code>{selected.id}</code>
              <button
                type="button"
                className="miniButton"
                onClick={() => {
                  void navigator.clipboard?.writeText(selected.id);
                  setStatus(t('assets.copied', { id: selected.id }));
                }}
              >
                {t('common.copy')}
              </button>
            </dd>
          </dl>
          {selected.type === 'scene' && (
            <button type="button" className="primaryButton" onClick={() => void openScene(selected.path)}>
              {t('assets.openScene')}
            </button>
          )}
          <p className="hint">{t('assets.dragHint', { code: '{ "assetId": "…" }' })}</p>
        </div>
      )}
    </div>
  );
}

function groupByFolder(assets: ProjectAsset[], query: string): { path: string; assets: ProjectAsset[] }[] {
  const needle = query.trim().toLowerCase();
  const folders = new Map<string, ProjectAsset[]>();

  for (const asset of assets) {
    if (needle && !`${asset.displayName} ${asset.path} ${asset.id}`.toLowerCase().includes(needle)) {
      continue;
    }

    const bucket = folders.get(asset.folder) ?? [];
    bucket.push(asset);
    folders.set(asset.folder, bucket);
  }

  return [...folders.entries()]
    .map(([path, list]) => ({
      path,
      assets: [...list].sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
        || a.displayName.localeCompare(b.displayName)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
