import type { SafeAreaInsets } from '@pxe/schema';
import {
  createDefaultEditorSceneMeta,
  defaultEditorNodeMeta,
  EDITOR_META_VERSION,
  type EditorCameraState,
  type EditorNodeMeta,
  type EditorSceneMeta,
  type EditorViewPreferences,
} from './types';

/**
 * Editor-only document state: camera, hierarchy expansion, selection, per-node
 * lock/visibility and view preferences.
 *
 * It is deliberately kept out of the game scene JSON and written to a sibling
 * `<Name>.scene.editor.json` file.
 */
export class EditorMetadata {
  private state: EditorSceneMeta;

  constructor(meta: Partial<EditorSceneMeta> = {}) {
    this.state = normalize(meta);
  }

  get value(): EditorSceneMeta {
    return this.state;
  }

  get camera(): EditorCameraState {
    return this.state.camera;
  }

  setCamera(camera: Partial<EditorCameraState>): void {
    this.state.camera = { ...this.state.camera, ...camera };
    if (this.state.camera.zoom <= 0) {
      this.state.camera.zoom = 1;
    }
  }

  get view(): EditorViewPreferences {
    return this.state.view;
  }

  updateView(patch: Partial<EditorViewPreferences>): void {
    this.state.view = { ...this.state.view, ...patch };
  }

  updateSafeArea(insets: Partial<SafeAreaInsets>): void {
    this.state.view = { ...this.state.view, safeArea: { ...this.state.view.safeArea, ...insets } };
  }

  isExpanded(nodeId: string): boolean {
    return this.state.nodes[nodeId]?.expanded ?? true;
  }

  setExpanded(nodeId: string, expanded: boolean): void {
    this.updateNodeMeta(nodeId, { expanded });
  }

  nodeMeta(nodeId: string): EditorNodeMeta {
    return this.state.nodes[nodeId] ?? { ...defaultEditorNodeMeta };
  }

  updateNodeMeta(nodeId: string, patch: Partial<EditorNodeMeta>): EditorNodeMeta {
    const next = { ...this.nodeMeta(nodeId), ...patch };
    this.state.nodes[nodeId] = next;

    if (next.expanded) {
      if (!this.state.expandedNodes.includes(nodeId)) {
        this.state.expandedNodes.push(nodeId);
      }
    } else {
      this.state.expandedNodes = this.state.expandedNodes.filter((id) => id !== nodeId);
    }

    return next;
  }

  isLocked(nodeId: string): boolean {
    return this.nodeMeta(nodeId).locked;
  }

  isEditorVisible(nodeId: string): boolean {
    return this.nodeMeta(nodeId).editorVisible;
  }

  isComponentCollapsed(componentId: string): boolean {
    return !this.state.expandedComponents.includes(componentId);
  }

  setComponentCollapsed(componentId: string, collapsed: boolean): void {
    const set = new Set(this.state.expandedComponents);
    if (collapsed) set.delete(componentId);
    else set.add(componentId);
    this.state.expandedComponents = [...set];
  }

  setSelection(nodeId: string | null): void {
    this.state.selectedNodeId = nodeId;
  }

  /** Drops metadata of nodes/components that no longer exist. */
  prune(existingNodeIds: Iterable<string>, existingComponentIds: Iterable<string> = []): void {
    const alive = new Set(existingNodeIds);
    this.state.expandedNodes = this.state.expandedNodes.filter((id) => alive.has(id));

    for (const nodeId of Object.keys(this.state.nodes)) {
      if (!alive.has(nodeId)) {
        delete this.state.nodes[nodeId];
      }
    }

    const aliveComponents = new Set(existingComponentIds);
    this.state.expandedComponents = this.state.expandedComponents.filter((id) => aliveComponents.has(id));

    if (this.state.selectedNodeId && !alive.has(this.state.selectedNodeId)) {
      this.state.selectedNodeId = null;
    }
  }

  clone(): EditorMetadata {
    return new EditorMetadata(structuredClone(this.state));
  }

  toJSON(): EditorSceneMeta {
    const nodes: Record<string, EditorNodeMeta> = {};

    for (const [nodeId, meta] of Object.entries(this.state.nodes)) {
      if (
        meta.locked === defaultEditorNodeMeta.locked &&
        meta.editorVisible === defaultEditorNodeMeta.editorVisible &&
        meta.expanded === defaultEditorNodeMeta.expanded
      ) {
        continue;
      }

      nodes[nodeId] = { ...meta };
    }

    return {
      version: EDITOR_META_VERSION,
      camera: { ...this.state.camera },
      expandedNodes: [...this.state.expandedNodes],
      selectedNodeId: this.state.selectedNodeId,
      nodes,
      view: structuredClone(this.state.view),
      expandedComponents: [...this.state.expandedComponents],
    };
  }

  serialize(): string {
    return `${JSON.stringify(this.toJSON(), null, 2)}\n`;
  }

  static parse(data: unknown): EditorMetadata {
    if (!data || typeof data !== 'object') {
      return new EditorMetadata();
    }

    return new EditorMetadata(data as Partial<EditorSceneMeta>);
  }
}

function normalize(meta: Partial<EditorSceneMeta>): EditorSceneMeta {
  const defaults = createDefaultEditorSceneMeta();
  const nodes: Record<string, EditorNodeMeta> = {};

  for (const [nodeId, value] of Object.entries(meta.nodes ?? {})) {
    nodes[nodeId] = { ...defaultEditorNodeMeta, ...value };
  }

  const expandedNodes = Array.isArray(meta.expandedNodes)
    ? [...new Set(meta.expandedNodes.filter((id): id is string => typeof id === 'string'))]
    : [];

  for (const nodeId of expandedNodes) {
    nodes[nodeId] = { ...(nodes[nodeId] ?? defaultEditorNodeMeta), expanded: true };
  }

  const expandedComponents = Array.isArray(meta.expandedComponents)
    ? [...new Set(meta.expandedComponents.filter((id): id is string => typeof id === 'string'))]
    : [];

  return {
    version: typeof meta.version === 'number' ? meta.version : defaults.version,
    camera: { ...defaults.camera, ...(meta.camera ?? {}) },
    expandedNodes,
    selectedNodeId: typeof meta.selectedNodeId === 'string' ? meta.selectedNodeId : null,
    nodes,
    expandedComponents,
    view: {
      ...defaults.view,
      ...(meta.view ?? {}),
      snap: { ...defaults.view.snap, ...(meta.view?.snap ?? {}) },
      safeArea: { ...defaults.view.safeArea, ...(meta.view?.safeArea ?? {}) },
    },
  };
}
