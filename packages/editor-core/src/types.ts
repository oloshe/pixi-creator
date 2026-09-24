import type { ComponentData, NodeData, SafeAreaInsets, SceneData } from '@pxe/schema';

export interface SelectionState {
  nodeIds: string[];
  primaryNodeId: string | null;
}

export interface Command {
  readonly label: string;
  execute(): void;
  undo(): void;
  merge?(next: Command): boolean;
}

export interface SerializedSceneDocument {
  data: SceneData;
  selection: SelectionState;
  dirty: boolean;
  meta: EditorSceneMeta;
}

export type NodeTransformKey = keyof NodeData['transform'];
export type NodePropertyPath =
  | 'name'
  | 'active'
  | 'layer'
  | 'zIndex'
  | `transform.${NodeTransformKey}`;
export type ComponentPropertyPath = 'enabled' | `props.${string}`;

export interface NodeLocation {
  parent: NodeData | null;
  node: NodeData;
  index: number;
}

export interface ComponentLocation {
  node: NodeData;
  component: ComponentData;
  index: number;
}

/* -------------------------------------------------------------------------- */
/* Editor only metadata — never stored in the game scene JSON                  */
/* -------------------------------------------------------------------------- */

export interface EditorCameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface EditorNodeMeta {
  locked: boolean;
  /** Editor-only visibility, independent from the runtime `visible` flag. */
  editorVisible: boolean;
  expanded: boolean;
}

export const defaultEditorNodeMeta: EditorNodeMeta = {
  locked: false,
  editorVisible: true,
  expanded: true,
};

export type EditorBackgroundMode = 'scene' | 'transparent' | 'black' | 'white' | 'custom';

export interface SnapSettings {
  enabled: boolean;
  position: number;
  rotation: number;
  scale: number;
}

export interface EditorViewPreferences {
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  majorGrid: number;
  showRulers: boolean;
  showSafeArea: boolean;
  /** Show content outside the artboard, dimmed, while `clipContent` is on. */
  showOverflow: boolean;
  background: EditorBackgroundMode;
  customBackground: string;
  snap: SnapSettings;
  safeArea: SafeAreaInsets;
  devicePreviewId: string;
}

export const defaultEditorViewPreferences: EditorViewPreferences = {
  showGrid: true,
  snapToGrid: false,
  gridSize: 10,
  majorGrid: 100,
  showRulers: true,
  showSafeArea: false,
  showOverflow: true,
  background: 'scene',
  customBackground: '#808080',
  snap: { enabled: false, position: 10, rotation: 15, scale: 0.1 },
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  devicePreviewId: 'design',
};

export const defaultEditorCamera: EditorCameraState = { x: 0, y: 0, zoom: 1 };

export interface EditorSceneMeta {
  version: number;
  camera: EditorCameraState;
  expandedNodes: string[];
  selectedNodeId: string | null;
  nodes: Record<string, EditorNodeMeta>;
  view: EditorViewPreferences;
  /** Component ids the user expanded in the Inspector; default is collapsed. */
  expandedComponents: string[];
}

export const EDITOR_META_VERSION = 1;

export function createDefaultEditorSceneMeta(overrides: Partial<EditorSceneMeta> = {}): EditorSceneMeta {
  return {
    version: EDITOR_META_VERSION,
    camera: { ...defaultEditorCamera },
    expandedNodes: [],
    selectedNodeId: null,
    nodes: {},
    view: structuredClone(defaultEditorViewPreferences),
    expandedComponents: [],
    ...overrides,
  };
}

/** `Game.scene.json` keeps game data only. */
export function sceneFileName(sceneName: string): string {
  return `${sanitizeSceneName(sceneName)}.scene.json`;
}

/** `Game.scene.editor.json` keeps camera / expansion / selection / view prefs. */
export function sceneEditorFileName(sceneName: string): string {
  return `${sanitizeSceneName(sceneName)}.scene.editor.json`;
}

export function sanitizeSceneName(sceneName: string): string {
  const trimmed = sceneName.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return trimmed.length > 0 ? trimmed : 'Scene';
}
