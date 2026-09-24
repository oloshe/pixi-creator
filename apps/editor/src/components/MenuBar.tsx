import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { useI18n } from '../i18n';
import { editorLabels, type EditorId } from '../editor/editorSettings';
import { PromptDialog } from './PromptDialog';

interface MenuItem {
  key: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  /** Nested items render as a right-hand flyout (e.g. "Open Project With…"). */
  submenu?: MenuItem[];
  onSelect(): void;
}

/**
 * macOS-style menu bar: menus open on hover/click, items close the menu on
 * selection, and the bar closes on outside click or Escape.
 */
export function MenuBar() {
  const { t, locale, setLocale } = useI18n();
  const store = useEditorStore;
  const document = useSceneDocument();
  const [open, setOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'rename' | 'script' | 'customCommand' | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  const project = store((state) => state.project);
  const selection = store((state) => state.selection);
  const sceneSelected = store((state) => state.sceneSelected);
  const clipboard = store((state) => state.clipboard);
  const defaultEditor = store((state) => state.defaultEditor);
  const customEditorCommand = store((state) => state.customEditorCommand);

  const refreshFromDocument = store((state) => state.refreshFromDocument);
  const undo = () => { document?.undo(); refreshFromDocument('Undo'); };
  const redo = () => { document?.redo(); refreshFromDocument('Redo'); };

  const selectedId = selection.primaryNodeId;
  const nodeSelected = Boolean(selectedId && !sceneSelected && selectedId !== document?.data.root.id);

  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { key: 'openProject', label: t('menu.file.openProject'), onSelect: () => void store.getState().openProject() },
        {
          key: 'openProjectWith',
          label: t('menu.file.openProjectWith'),
          disabled: !project,
          onSelect() {},
          submenu: [
            ...(['vscode', 'zed', 'sublime', 'notepad'] as EditorId[]).map((editor) => ({
              key: `with-${editor}`,
              label: editorLabels[editor],
              onSelect: () => void store.getState().openProjectWith(editor),
            })),
            { key: 'with-custom', label: editorLabels.custom, onSelect: () => void store.getState().openProjectWith('custom') },
            { key: 'with-sep', label: '', disabled: true, onSelect() {} },
            { key: 'with-file-manager', label: t('menu.file.openInFileManager'), onSelect: () => void store.getState().openProjectInFileManager() },
          ],
        },
        { key: 'newScene', label: t('menu.file.newScene'), onSelect: () => store.getState().newScene() },
        { key: 'openSceneJSON', label: t('menu.file.openSceneJSON'), onSelect: () => void store.getState().openSceneJSON() },
        { key: 'save', label: t('menu.file.save'), shortcut: 'Ctrl/Cmd+S', disabled: !document, onSelect: () => void store.getState().saveScene() },
        { key: 'export', label: t('menu.file.exportScene'), disabled: !document, onSelect: () => store.getState().exportScene() },
        { key: 'embed', label: t('menu.file.copyEmbed'), disabled: !document, onSelect: () => void store.getState().copyEmbedSnippet() },
        { key: 'closeProject', label: t('menu.file.closeProject'), disabled: !project, onSelect: () => store.getState().closeProject() },
      ],
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        { key: 'undo', label: t('menu.edit.undo'), shortcut: 'Ctrl/Cmd+Z', disabled: !document, onSelect: undo },
        { key: 'redo', label: t('menu.edit.redo'), shortcut: 'Shift+Ctrl/Cmd+Z', disabled: !document, onSelect: redo },
        { key: 'sep1', label: '', disabled: true, onSelect() {} },
        { key: 'rename', label: t('menu.edit.rename'), disabled: !nodeSelected, onSelect: () => setDialog('rename') },
        { key: 'duplicate', label: t('menu.edit.duplicate'), shortcut: 'Ctrl/Cmd+D', disabled: !nodeSelected, onSelect: () => store.getState().duplicateNode() },
        { key: 'delete', label: t('menu.edit.delete'), shortcut: 'Del', disabled: !nodeSelected, danger: true, onSelect: () => store.getState().deleteNode() },
        { key: 'pasteAsChild', label: t('menu.edit.pasteAsChild'), disabled: !document || !clipboard || !selectedId, onSelect: () => store.getState().pasteNode(selectedId) },
      ],
    },
    {
      id: 'assets',
      label: t('menu.assets'),
      items: [
        { key: 'rescan', label: t('menu.assets.rescan'), disabled: !project, onSelect: () => void store.getState().refreshAssets().catch((error) => store.getState().setStatus(String(error))) },
        { key: 'newScript', label: t('menu.assets.newScript'), disabled: !project, onSelect: () => setDialog('script') },
        { key: 'generateTypes', label: t('menu.assets.generateTypes'), disabled: !project, onSelect: () => void store.getState().generateTypeDefinitions() },
      ],
    },
    {
      id: 'language',
      label: t('menu.language'),
      items: [
        { key: 'zh', label: '简体中文', onSelect: () => setLocale('zh-CN') },
        { key: 'en', label: 'English', onSelect: () => setLocale('en') },
      ],
    },
    {
      id: 'settings',
      label: t('menu.settings'),
      items: [
        ...(['vscode', 'zed', 'sublime', 'notepad'] as EditorId[]).map((editor) => ({
          key: `editor-${editor}`,
          label: `${defaultEditor === editor ? '✓ ' : ''}${editorLabels[editor]}`,
          onSelect: () => store.getState().setDefaultEditor(editor),
        })),
        {
          key: 'editor-custom',
          label: `${defaultEditor === 'custom' ? '✓ ' : ''}${editorLabels.custom}`,
          onSelect: () => {
            store.getState().setDefaultEditor('custom');
            setDialog('customCommand');
          },
        },
      ],
    },
  ];

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null);
        setDialog(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <nav ref={barRef} className="menuBar">
      {menus.map((menu) => (
        <div key={menu.id} className="menu">
          <button
            type="button"
            className={`menuTitle ${open === menu.id ? 'open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === menu.id}
            onPointerEnter={() => setOpen(menu.id)}
            onClick={() => setOpen(open === menu.id ? null : menu.id)}
          >
            {menu.label}
            {menu.id === 'language' && <span className="menuLocaleHint">{locale === 'zh-CN' ? '中' : 'EN'}</span>}
          </button>
          {open === menu.id && (
            <div className="menuDropdown" role="menu">
              {menu.items.map((item) =>
                item.label === '' ? (
                  <div key={item.key} className="menuSeparator" />
                ) : item.submenu ? (
                  <div key={item.key} className="menuSubmenu" role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={`menuItem ${item.danger ? 'danger' : ''}`}
                      disabled={item.disabled}
                      onClick={() => setOpen(null)}
                    >
                      <span>{item.label}</span>
                      <span className="menuSubmenuArrow">▸</span>
                    </button>
                    <div className="menuDropdown submenuDropdown" role="menu">
                      {item.submenu.map((sub) =>
                        sub.label === '' ? (
                          <div key={sub.key} className="menuSeparator" />
                        ) : (
                          <button
                            key={sub.key}
                            type="button"
                            role="menuitem"
                            className={`menuItem ${sub.danger ? 'danger' : ''}`}
                            disabled={sub.disabled}
                            onClick={() => {
                              setOpen(null);
                              sub.onSelect();
                            }}
                          >
                            <span>{sub.label}</span>
                            {sub.shortcut && <span className="menuShortcut">{sub.shortcut}</span>}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    className={`menuItem ${item.danger ? 'danger' : ''}`}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.onSelect();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="menuShortcut">{item.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}

      {dialog === 'rename' && selectedId && document && (
        <PromptDialog
          title={t('context.rename')}
          label={t('inspector.name')}
          placeholder={t('hierarchy.renamePlaceholder')}
          confirmLabel={t('common.ok')}
          cancelLabel={t('common.cancel')}
          defaultValue={findNodeName(document.data.root, selectedId)}
          onSubmit={(name) => { setDialog(null); store.getState().renameNode(selectedId, name); }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'script' && (
        <PromptDialog
          title={t('script.title')}
          label={t('script.nameLabel')}
          placeholder={t('script.placeholder')}
          confirmLabel={t('script.create')}
          cancelLabel={t('common.cancel')}
          onSubmit={(name) => { setDialog(null); void store.getState().createScript(name); }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'customCommand' && (
        <PromptDialog
          title={t('settings.customCommand')}
          label={t('settings.editorHint')}
          placeholder={t('settings.customCommandPlaceholder')}
          confirmLabel={t('common.ok')}
          cancelLabel={t('common.cancel')}
          defaultValue={customEditorCommand}
          onSubmit={(command) => { setDialog(null); store.getState().setCustomEditorCommand(command); }}
          onClose={() => setDialog(null)}
        />
      )}
    </nav>
  );
}

function findNodeName(node: import('@pxe/schema').NodeData, nodeId: string): string {
  if (node.id === nodeId) return node.name;
  for (const child of node.children) {
    const found = findNodeName(child, nodeId);
    if (found) return found;
  }
  return '';
}
