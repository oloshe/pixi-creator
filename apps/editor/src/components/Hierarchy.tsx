import { useState } from 'react';
import type { NodeData } from '@pxe/schema';
import { ReparentNodeCommand } from '@pxe/editor-core';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { useI18n } from '../i18n';
import { ComponentPalette } from './ComponentPalette';
import { addComponent, addPresetNode, nodePresets, type NodePreset } from '../editor/componentActions';
import { COMPONENT_DRAG_TYPE, NODE_DRAG_TYPE } from '../editor/componentManifest';
import { ContextMenu } from './ContextMenu';
import { PromptDialog } from './PromptDialog';
import { ChevronIcon, EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from './icons';

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

export function Hierarchy() {
  const { t } = useI18n();
  const store = useEditorStore;
  const scene = useSceneDocument();
  const selection = store((state) => state.selection);
  const sceneSelected = store((state) => state.sceneSelected);
  const meta = store((state) => state.meta);
  const clipboard = store((state) => state.clipboard);
  const selectNode = store((state) => state.selectNode);
  const selectScene = store((state) => state.selectScene);
  const refreshFromDocument = store((state) => state.refreshFromDocument);
  const updateNodeMeta = store((state) => state.updateNodeMeta);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);

  if (!scene) {
    return null;
  }

  const document = scene;
  const selectedId = selection.primaryNodeId;
  const rootId = document.data.root.id;
  const isRootSelected = selectedId === rootId && !sceneSelected;

  function duplicateNode() {
    if (!selectedId || selectedId === rootId) return;
    store.getState().duplicateNode(selectedId);
  }

  function deleteNode() {
    if (!selectedId || selectedId === rootId) return;
    store.getState().deleteNode(selectedId);
  }

  function openContextMenu(event: React.MouseEvent, nodeId: string) {
    event.preventDefault();
    event.stopPropagation();
    store.getState().selectNode(nodeId);
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId });
  }

  return (
    <div className="hierarchy">
      <div className="panelHeader">
        <span>{t('hierarchy.title')}</span>
        <div className="inlineActions">
          <button type="button" onClick={duplicateNode} disabled={!selectedId || selectedId === rootId} title="Ctrl/Cmd+D">{t('hierarchy.duplicate')}</button>
          <button type="button" onClick={deleteNode} disabled={!selectedId || selectedId === rootId} title="Delete">{t('hierarchy.delete')}</button>
        </div>
      </div>

      <button
        type="button"
        className={`sceneRow ${sceneSelected ? 'selected' : ''}`}
        onClick={selectScene}
        title={t('hierarchy.title')}
      >
        <span className="sceneBadge">{t('hierarchy.sceneBadge')}</span>
        {document.data.name}
        <span className="sceneSize">
          {document.data.settings.designWidth} × {document.data.settings.designHeight}
        </span>
      </button>

      <div className="createNodeRow">
        <select
          aria-label="Create node"
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            addPresetNode(document, selectedId && !sceneSelected ? selectedId : rootId, event.target.value as NodePreset);
            refreshFromDocument('Node created');
          }}
        >
          <option value="" disabled>{t('hierarchy.createNode')}</option>
          {nodePresets.map((preset) => <option key={preset}>{preset}</option>)}
        </select>
      </div>

      <div className="tree">
        <TreeNode
          node={document.data.root}
          level={0}
          rootId={rootId}
          selectedId={sceneSelected ? null : selectedId}
          onSelect={selectNode}
          onDropNode={(draggedId, targetId) => {
            try {
              document.execute(new ReparentNodeCommand(document.data.root, draggedId, targetId));
              refreshFromDocument('Node reparented');
            } catch (error) {
              refreshFromDocument(`Reparent failed: ${String(error)}`);
            }
          }}
          metaOf={(nodeId) => meta.nodeMeta(nodeId)}
          onMeta={(nodeId, patch) => updateNodeMeta(nodeId, patch)}
          onContextMenu={openContextMenu}
        />
      </div>

      {isRootSelected && (
        <p className="hint panelHint">{t('hierarchy.canvasHint')}</p>
      )}

      <div className="panelHeader">{t('hierarchy.components')}</div>
      <ComponentPalette />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { key: 'rename', label: t('context.rename'), disabled: contextMenu.nodeId === rootId, onSelect: () => setRenameTarget(contextMenu.nodeId) },
            { key: 'copy', label: t('context.copy'), disabled: contextMenu.nodeId === rootId, onSelect: () => store.getState().copyNode(contextMenu.nodeId) },
            { key: 'paste', label: t('context.pasteAsChild'), disabled: !clipboard, onSelect: () => store.getState().pasteNode(contextMenu.nodeId) },
            { key: 'delete', label: t('context.delete'), danger: true, disabled: contextMenu.nodeId === rootId, onSelect: () => store.getState().deleteNode(contextMenu.nodeId) },
          ]}
        />
      )}

      {renameTarget && (
        <PromptDialog
          title={t('context.rename')}
          label={t('inspector.name')}
          placeholder={t('hierarchy.renamePlaceholder')}
          confirmLabel={t('common.ok')}
          cancelLabel={t('common.cancel')}
          defaultValue={nodeName(document.data.root, renameTarget)}
          onSubmit={(name) => { setRenameTarget(null); store.getState().renameNode(renameTarget, name); }}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: NodeData;
  level: number;
  rootId: string;
  selectedId: string | null;
  onSelect(nodeId: string): void;
  onDropNode(draggedId: string, targetId: string): void;
  metaOf(nodeId: string): { locked: boolean; editorVisible: boolean; expanded: boolean };
  onMeta(nodeId: string, patch: { locked?: boolean; editorVisible?: boolean; expanded?: boolean }): void;
  onContextMenu(event: React.MouseEvent, nodeId: string): void;
}

function TreeNode({ node, level, rootId, selectedId, onSelect, onDropNode, metaOf, onMeta, onContextMenu }: TreeNodeProps) {
  const { t } = useI18n();
  const store = useEditorStore;
  const scene = useSceneDocument();
  const refreshFromDocument = store((state) => state.refreshFromDocument);
  const meta = metaOf(node.id);
  const isCanvas = node.id === rootId;
  const hasChildren = node.children.length > 0;

  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <div>
      <div
        className={`treeItem ${selectedId === node.id ? 'selected' : ''} ${meta.locked ? 'locked' : ''}`}
        style={{ paddingLeft: 6 + level * 14 }}
        draggable={!isCanvas}
        onDragStart={(event) => event.dataTransfer.setData(NODE_DRAG_TYPE, node.id)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE) || event.dataTransfer.types.includes(NODE_DRAG_TYPE)) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          const componentType = event.dataTransfer.getData(COMPONENT_DRAG_TYPE);

          if (componentType) {
            event.preventDefault();
            event.stopPropagation();
            if (scene && addComponent(scene, node.id, componentType, useEditorStore.getState().componentManifest)) refreshFromDocument('Component added');
            return;
          }

          const draggedId = event.dataTransfer.getData(NODE_DRAG_TYPE);

          if (draggedId && draggedId !== node.id) {
            event.preventDefault();
            event.stopPropagation();
            onDropNode(draggedId, node.id);
          }
        }}
        onContextMenu={(event) => onContextMenu(event, node.id)}
      >
        <button
          type="button"
          className="twisty"
          aria-label={meta.expanded ? t('hierarchy.collapse') : t('hierarchy.expand')}
          disabled={!hasChildren}
          onClick={(event) => { stop(event); onMeta(node.id, { expanded: !meta.expanded }); }}
        >
          {hasChildren && <ChevronIcon size={12} open={meta.expanded} />}
        </button>
        <button
          type="button"
          className="iconToggle"
          title={meta.editorVisible ? t('hierarchy.hideInEditor') : t('hierarchy.showInEditor')}
          aria-pressed={meta.editorVisible}
          onClick={(event) => { stop(event); onMeta(node.id, { editorVisible: !meta.editorVisible }); }}
        >
          {meta.editorVisible ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
        </button>
        <button
          type="button"
          className="iconToggle"
          title={meta.locked ? t('hierarchy.unlock') : t('hierarchy.lock')}
          aria-pressed={meta.locked}
          onClick={(event) => { stop(event); onMeta(node.id, { locked: !meta.locked }); }}
        >
          {meta.locked ? <LockIcon size={14} /> : <UnlockIcon size={14} />}
        </button>
        <button type="button" className="treeLabel" onClick={() => onSelect(node.id)} title={node.layer ? `Layer: ${node.layer}` : undefined}>
          <span className={node.active ? 'statusDot on' : 'statusDot'} />
          {isCanvas ? 'Canvas' : node.name}
        </button>
      </div>
      {meta.expanded && node.children.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          level={level + 1}
          rootId={rootId}
          selectedId={selectedId}
          onSelect={onSelect}
          onDropNode={onDropNode}
          metaOf={metaOf}
          onMeta={onMeta}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

function nodeName(root: NodeData, nodeId: string): string {
  if (root.id === nodeId) return root.name;
  for (const child of root.children) {
    const found = nodeName(child, nodeId);
    if (found) return found;
  }
  return '';
}
