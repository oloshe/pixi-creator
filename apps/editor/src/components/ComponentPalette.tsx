import { useState } from 'react';
import type { NodeData } from '@pxe/schema';
import { COMPONENT_DRAG_TYPE } from '../editor/componentManifest';
import { addComponent } from '../editor/componentActions';
import { findNode } from '../editor/find';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { useI18n } from '../i18n';
import { ContextMenu } from './ContextMenu';
import { PromptDialog } from './PromptDialog';

interface ComponentContextMenu {
  x: number;
  y: number;
  type: string;
}

export function ComponentPalette({ target, onAdded }: { target?: NodeData; onAdded?: () => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<ComponentContextMenu | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const document = useSceneDocument();
  const {
    selection,
    refreshFromDocument,
    componentManifest,
    project,
    renameComponentScript,
    deleteComponentScript,
    openComponentInEditor,
    revealInFileManager,
  } = useEditorStore();
  const node = target ?? (document ? findNode(document.data.root, selection.primaryNodeId) : null);
  const definitions = componentManifest.filter((item) =>
    `${item.displayName} ${item.type} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  const categories = [...new Set(definitions.map((item) => item.category))];
  const writable = project?.hasWriteAccess ?? false;
  const renameItem = componentManifest.find((item) => item.type === renameTarget);
  const renameName = renameItem?.sourcePath
    ? (renameItem.sourcePath.split('/').pop() ?? '').replace(/\.ts$/i, '')
    : '';

  return <section className="componentPalette" aria-label="Component palette">
    <input aria-label={t('palette.search')} placeholder={t('palette.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
    <p className="hint">{node ? t('palette.addTo', { name: node.name }) : t('palette.selectNode')}</p>
    {categories.map((category) => <div key={category}>
      <h3>{category}</h3>
      {definitions.filter((item) => item.category === category).map((item) => {
        const exists = item.type.startsWith('engine.') && node?.components.some((component) => component.type === item.type);
        const isProject = Boolean(item.sourcePath);
        return <button key={item.type} type="button" className="paletteItem" draggable
          title={item.type} aria-disabled={!node || exists}
          onDragStart={(event) => { event.dataTransfer.setData(COMPONENT_DRAG_TYPE, item.type); event.dataTransfer.effectAllowed = 'copy'; }}
          onContextMenu={isProject ? (event) => {
            event.preventDefault();
            event.stopPropagation();
            setContextMenu({ x: event.clientX, y: event.clientY, type: item.type });
          } : undefined}
          onDoubleClick={isProject ? () => { void openComponentInEditor(item.type); } : undefined}
          onClick={() => {
            if (document && node && addComponent(document, node.id, item.type, componentManifest)) { refreshFromDocument(`Added ${item.displayName}`); onAdded?.(); }
          }}><span>{item.displayName}</span><span className="hint">{exists ? t('palette.added') : isProject ? '⟐' : '+'}</span></button>;
      })}
    </div>)}
    {!definitions.length && <p className="hint">{t('palette.noMatch')}</p>}

    {contextMenu && (
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(null)}
        items={[
          { key: 'edit', label: t('context.editExternal'), onSelect: () => { void openComponentInEditor(contextMenu.type); } },
          { key: 'reveal', label: t('context.revealInFileManager'), onSelect: () => {
            const sourcePath = componentManifest.find((item) => item.type === contextMenu.type)?.sourcePath;
            if (sourcePath) void revealInFileManager(sourcePath);
          } },
          { key: 'rename', label: t('context.rename'), disabled: !writable, onSelect: () => setRenameTarget(contextMenu.type) },
          { key: 'delete', label: t('context.delete'), danger: true, disabled: !writable, onSelect: () => { void deleteComponentScript(contextMenu.type); } },
        ]}
      />
    )}

    {renameTarget && (
      <PromptDialog
        title={t('context.rename')}
        label={t('script.nameLabel')}
        placeholder={t('script.placeholder')}
        confirmLabel={t('common.ok')}
        cancelLabel={t('common.cancel')}
        defaultValue={renameName}
        onSubmit={(name) => { setRenameTarget(null); void renameComponentScript(renameTarget, name); }}
        onClose={() => setRenameTarget(null)}
      />
    )}
  </section>;
}
