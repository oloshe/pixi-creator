import { pivotWithCompensation, BatchCommand, RemoveComponentCommand, SetComponentPropertyCommand, SetNodePropertyCommand, type NodePropertyPath } from '@pxe/editor-core';
import { defaultLayers } from '@pxe/schema';
import { useEffect, useRef, useState } from 'react';
import type { ComponentData, NodeData } from '@pxe/schema';
import type { PropertyDefinition } from '@pxe/runtime';
import { COMPONENT_DRAG_TYPE, NODE_DRAG_TYPE } from '../editor/componentManifest';
import { addComponent } from '../editor/componentActions';
import { AssetPicker } from './AssetPicker';
import { ComponentPalette } from './ComponentPalette';
import { SceneSettingsInspector } from './SceneSettingsInspector';
import { ChevronIcon } from './icons';
import { ContextMenu } from './ContextMenu';
import { NumberInput } from './NumberInput';
import { findNode } from '../editor/find';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { useI18n } from '../i18n';
import { layoutPreview } from '../editor/previewLayout';
import { transformNode } from '../editor/transformActions';

export function Inspector() {
  const { t } = useI18n();
  const store = useEditorStore;
  const scene = useSceneDocument();
  const componentManifest = store((state) => state.componentManifest);
  const selection = store((state) => state.selection);
  const sceneSelected = store((state) => state.sceneSelected);
  const meta = store((state) => state.meta);
  const refreshFromDocument = store((state) => state.refreshFromDocument);
  const updateNodeMeta = store((state) => state.updateNodeMeta);
  const [showAdd, setShowAdd] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const node = scene && !sceneSelected ? findNode(scene.data.root, selection.primaryNodeId) : null;

  // After the palette renders below the add button, scroll it into view so the
  // user never misses the component list.
  useEffect(() => {
    if (showAdd && panelRef.current) {
      panelRef.current.scrollTo({ top: panelRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [showAdd]);

  if (!scene) {
    return null;
  }

  if (sceneSelected) {
    return <SceneSettingsInspector />;
  }

  if (!node) {
    return (
      <aside className="panel inspector">
        <div className="panelHeader">{t('inspector.title')}</div>
        <div className="emptyState">{t('inspector.empty')}</div>
      </aside>
    );
  }

  const document = scene;

  const isCanvas = node.id === document.data.root.id;
  const nodeMeta = meta.nodeMeta(node.id);

  function setNode(path: NodePropertyPath, value: unknown) {
    if (path.startsWith('transform.') && !isCanvas) {
      const before = findNode(layoutPreview(document.data.root), node!.id)!.transform;
      transformNode(document, node!.id, before, { ...before, [path.slice('transform.'.length)]: value });
    } else document.execute(new SetNodePropertyCommand(document.data.root, node!.id, path, value));
    refreshFromDocument('Edited node');
  }

  function setComponent(component: ComponentData, path: `props.${string}` | 'enabled', value: unknown) {
    document.execute(new SetComponentPropertyCommand(document.data.root, component.id, path, value));
    refreshFromDocument('Edited component');
  }

  function setPivot(pivotX: number, pivotY: number) {
    if (isCanvas) return;
    const before = findNode(layoutPreview(document.data.root), node!.id)!.transform;
    const next = pivotWithCompensation(before, pivotX, pivotY);
    if (hasAnchor(node!)) {
      transformNode(document, node!.id, before, next);
      refreshFromDocument('Pivot changed');
      return;
    }
    document.execute(new BatchCommand('Set Pivot', [
      new SetNodePropertyCommand(document.data.root, node!.id, 'transform.x', next.x),
      new SetNodePropertyCommand(document.data.root, node!.id, 'transform.y', next.y),
      new SetNodePropertyCommand(document.data.root, node!.id, 'transform.pivotX', pivotX),
      new SetNodePropertyCommand(document.data.root, node!.id, 'transform.pivotY', pivotY),
    ]));
    refreshFromDocument('Pivot changed');
  }

  return (
    <aside
      ref={panelRef}
      className="panel inspector"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(COMPONENT_DRAG_TYPE)) event.preventDefault();
      }}
      onDrop={(event) => {
        const type = event.dataTransfer.getData(COMPONENT_DRAG_TYPE);
        if (type && addComponent(document, node.id, type, componentManifest)) {
          event.preventDefault();
          refreshFromDocument('Component added');
        }
      }}
    >
      <div className="panelHeader">{t('inspector.title')}</div>

      <section className="inspectorSection">
        <label>
          {t('inspector.name')}
          <input value={node.name} onChange={(event) => setNode('name', event.target.value)} />
        </label>
        <details>
          <summary>{t('inspector.advanced')}</summary>
        <div className="fieldGrid">
          <label>
            {t('inspector.layer')}
            <select value={node.layer ?? ''} onChange={(event) => setNode('layer', event.target.value)}>
              <option value="">{t('common.none')}</option>
              {layerNames(document.data.root).map((layer) => <option key={layer} value={layer}>{layer}</option>)}
            </select>
          </label>
          <NumberField label={t('inspector.zIndex')} value={node.zIndex} onChange={(value) => setNode('zIndex', value)} />
        </div>
        </details>
        <label className="checkboxRow">
          <input checked={node.active} type="checkbox" onChange={(event) => setNode('active', event.target.checked)} />
          {t('inspector.activeRuntime')}
        </label>
        <div className="fieldGrid">
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={nodeMeta.editorVisible}
              onChange={(event) => updateNodeMeta(node.id, { editorVisible: event.target.checked })}
            />
            {t('inspector.editorVisible')}
          </label>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={nodeMeta.locked}
              onChange={(event) => updateNodeMeta(node.id, { locked: event.target.checked })}
            />
            {t('inspector.locked')}
          </label>
        </div>
      </section>

      <section className="inspectorSection">
        <h2>{t('inspector.rectTransform')}</h2>
        <div className="fieldGrid">
          <NumberField disabled={isCanvas} label={t('inspector.positionX')} value={node.transform.x} onChange={(value) => setNode('transform.x', value)} />
          <NumberField disabled={isCanvas} label={t('inspector.positionY')} value={node.transform.y} onChange={(value) => setNode('transform.y', value)} />
          <NumberField
            label={t('inspector.width')}
            value={node.transform.width}
            disabled={isCanvas}
            onChange={(value) => setNode('transform.width', value)}
          />
          <NumberField
            label={t('inspector.height')}
            value={node.transform.height}
            disabled={isCanvas}
            onChange={(value) => setNode('transform.height', value)}
          />
          <NumberField disabled={isCanvas} label={t('inspector.pivotX')} value={node.transform.pivotX} onChange={(value) => setPivot(value, node.transform.pivotY)} />
          <NumberField disabled={isCanvas} label={t('inspector.pivotY')} value={node.transform.pivotY} onChange={(value) => setPivot(node.transform.pivotX, value)} />
          <NumberField disabled={isCanvas} label={t('inspector.rotation')} value={node.transform.rotationDeg} onChange={(value) => setNode('transform.rotationDeg', value)} />
          <NumberField label={t('inspector.alpha')} value={node.transform.alpha} onChange={(value) => setNode('transform.alpha', value)} />
          <NumberField disabled={isCanvas} label={t('inspector.scaleX')} value={node.transform.scaleX} onChange={(value) => setNode('transform.scaleX', value)} />
          <NumberField disabled={isCanvas} label={t('inspector.scaleY')} value={node.transform.scaleY} onChange={(value) => setNode('transform.scaleY', value)} />
        </div>

        <label className="checkboxRow">
          <input
            checked={node.transform.visible}
            type="checkbox"
            onChange={(event) => setNode('transform.visible', event.target.checked)}
          />
          {t('inspector.visibleRuntime')}
        </label>

        {isCanvas && <p className="hint">{t('inspector.canvasHint')}</p>}
      </section>

      <section className="inspectorSection">
        <h2>{t('inspector.components')}</h2>
        {node.components.map((component) => (
          <ComponentInspector
            key={component.id}
            component={component}
            nodeId={node.id}
            onChange={setComponent}
            onRemove={() => {
              document.execute(new RemoveComponentCommand(document.data.root, component.id));
              refreshFromDocument('Component removed');
            }}
          />
        ))}
        <button type="button" className="addComponentButton" aria-expanded={showAdd} onClick={() => setShowAdd(!showAdd)}>
          {t('inspector.addComponent')}
        </button>
        {showAdd && <ComponentPalette target={node} onAdded={() => setShowAdd(false)} />}
      </section>
    </aside>
  );
}

export function layerNames(root: NodeData): string[] {
  const names = new Set<string>(defaultLayers);

  const visit = (node: NodeData): void => {
    if (node.layer) names.add(node.layer);
    node.children.forEach(visit);
  };

  visit(root);
  return [...names];
}

function hasAnchor(node: NodeData): boolean {
  return node.components.some((component) => component.type === 'engine.UIAnchor' && component.enabled);
}

interface ComponentInspectorProps {
  component: ComponentData;
  nodeId: string;
  onRemove(): void;
  onChange(component: ComponentData, path: `props.${string}` | 'enabled', value: unknown): void;
}

function ComponentInspector({ component, nodeId, onChange, onRemove }: ComponentInspectorProps) {
  const { t } = useI18n();
  const definition = useEditorStore((state) => state.componentManifest.find((item) => item.type === component.type));
  const collapsed = useEditorStore((state) => state.meta.isComponentCollapsed(component.id));
  const setComponentCollapsed = useEditorStore((state) => state.setComponentCollapsed);
  const componentClipboard = useEditorStore((state) => state.componentClipboard);
  const componentValueClipboard = useEditorStore((state) => state.componentValueClipboard);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const name = definition?.displayName ?? component.type;
  const toggleCollapse = () => setComponentCollapsed(component.id, !collapsed);
  const openMenu = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div className="componentBlock">
        <div className="componentHeading">
          <button
            type="button"
            className="twisty componentTwisty"
            aria-label={collapsed ? t('inspector.expandComponent', { name }) : t('inspector.collapseComponent', { name })}
            onClick={toggleCollapse}
          >
            <ChevronIcon size={12} open={!collapsed} />
          </button>
          <input
            checked={component.enabled}
            type="checkbox"
            className="componentEnableCheck"
            aria-label={t('inspector.enableComponent', { name })}
            title={t('inspector.enableComponent', { name })}
            onChange={(event) => onChange(component, 'enabled', event.target.checked)}
          />
          <button
            type="button"
            className="componentTitle"
            title={collapsed ? t('inspector.expandComponent', { name }) : t('inspector.collapseComponent', { name })}
            onClick={toggleCollapse}
          >
            {name}
          </button>
          <button type="button" className="componentMore" aria-label={t('inspector.componentActions', { name })} title={t('inspector.componentActions', { name })} onClick={openMenu}>⋯</button>
        </div>
        {!collapsed && !definition ? <div className="missing">{t('inspector.missing')}: {component.type}</div> : null}
        {!collapsed && definition
          ? Object.entries(definition.properties).map(([key, property]) => (
              <PropertyField
                key={key}
                name={key}
                property={property}
                value={component.props[key]}
                onChange={(value) => onChange(component, `props.${key}`, value)}
              />
            ))
          : null}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { key: 'copy', label: t('inspector.copyComponent'), onSelect: () => useEditorStore.getState().copyComponent(component.id) },
            { key: 'paste', label: t('inspector.pasteComponent'), disabled: !componentClipboard, onSelect: () => useEditorStore.getState().pasteComponent(nodeId) },
            { key: 'copyValue', label: t('inspector.copyComponentValue'), onSelect: () => useEditorStore.getState().copyComponentValue(component.id) },
            { key: 'pasteValue', label: t('inspector.pasteComponentValue'), disabled: !componentValueClipboard || componentValueClipboard.type !== component.type, onSelect: () => useEditorStore.getState().pasteComponentValue(component.id) },
            { key: 'delete', label: t('inspector.deleteComponent'), danger: true, onSelect: onRemove },
          ]}
        />
      )}
    </>
  );
}

interface PropertyFieldProps {
  name: string;
  property: PropertyDefinition;
  value: unknown;
  onChange(value: unknown): void;
}

function PropertyField({ name, property, value, onChange }: PropertyFieldProps) {
  const { t } = useI18n();
  const root = useEditorStore((state) => state.document?.data.root ?? null);
  const assets = useEditorStore((state) => state.assets);
  const manifest = useEditorStore((state) => state.componentManifest);

  if (property.type === 'number') {
    return (
      <NumberField
        label={name}
        value={typeof value === 'number' ? value : property.default}
        min={property.min}
        max={property.max}
        onChange={onChange}
        onClear={property.default === undefined ? () => onChange(undefined) : undefined}
      />
    );
  }

  if (property.type === 'boolean') {
    return (
      <label className="checkboxRow">
        <input checked={Boolean(value ?? property.default)} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
        {name}
      </label>
    );
  }

  if (property.type === 'enum') {
    return (
      <label>
        {name}
        <select value={String(value ?? property.default ?? '')} onChange={(event) => onChange(event.target.value)}>
          {property.values.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    );
  }

  if (property.type === 'color') {
    return (
      <label>
        {name}
        <input value={String(value ?? property.default ?? '#ffffff')} type="color" onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }

  if (property.type === 'asset') {
    const assetId = isObjectWithKey(value, 'assetId') ? String(value.assetId) : '';

    return (
      <AssetPicker
        label={name}
        value={assetId ? { assetId } : null}
        assets={assets}
        assetType={property.assetType}
        onChange={onChange}
      />
    );
  }

  if (property.type === 'vec2') {
    const vector = isObjectWithKey(value, 'x') ? value : property.default ?? { x: 0, y: 0 };
    return (
      <fieldset className="vectorField">
        <legend>{name}</legend>
        <div className="fieldGrid">
          <NumberField label="X" value={Number(vector.x)} onChange={(x) => onChange({ x, y: Number(vector.y) })} />
          <NumberField label="Y" value={Number(vector.y)} onChange={(y) => onChange({ x: Number(vector.x), y })} />
        </div>
      </fieldset>
    );
  }

  if (property.type === 'nodeRef' || property.type === 'componentRef') {
    const nodes: { node: NodeData; path: string }[] = [];
    const visit = (node: NodeData, path: string) => {
      nodes.push({ node, path });
      node.children.forEach((child) => visit(child, `${path}/${child.name}`));
    };
    if (root) {
      visit(root, root.name);
    }

    const options = property.type === 'nodeRef'
      ? nodes.map(({ node, path }) => ({ value: node.id, label: path, ref: { nodeId: node.id } }))
      : nodes.flatMap(({ node, path }) => node.components
        .filter((item) => !property.componentType || item.type === property.componentType)
        .map((item) => ({
          value: item.id,
          label: `${path} · ${manifest.find((definition) => definition.type === item.type)?.displayName ?? item.type}`,
          ref: { nodeId: node.id, componentId: item.id },
        })));
    const selected = isObjectWithKey(value, 'nodeId')
      ? String(property.type === 'nodeRef' ? value.nodeId : value.componentId)
      : '';
    return (
      <label
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(NODE_DRAG_TYPE)) event.preventDefault();
        }}
        onDrop={(event) => {
          const nodeId = event.dataTransfer.getData(NODE_DRAG_TYPE);
          const option = options.find((item) => item.ref.nodeId === nodeId);
          if (option) {
            event.preventDefault();
            event.stopPropagation();
            onChange(option.ref);
          }
        }}
      >
        {name}
        <select value={selected} onChange={(event) => onChange(options.find((item) => item.value === event.target.value)?.ref ?? null)}>
          <option value="">{t('common.none')}</option>
          {selected && !options.some((item) => item.value === selected) && <option value={selected}>{t('common.missing')}: {selected}</option>}
          {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    );
  }

  return (
    <label>
      {name}
      <input
        value={String(value ?? ('default' in property ? property.default ?? '' : ''))}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({ label, value, onChange, onClear, min, max, disabled }: {
  label: string;
  value?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange(value: number): void;
  onClear?(): void;
}) {
  return (
    <label>
      {label}
      <NumberInput
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={onChange}
        onClear={onClear}
      />
    </label>
  );
}

function isObjectWithKey(value: unknown, key: string): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && key in value);
}
