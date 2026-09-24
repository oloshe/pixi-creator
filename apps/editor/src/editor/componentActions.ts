import { AddComponentCommand, AddNodeCommand, BatchCommand, createEmptyNode, SetNodePropertyCommand, type SceneDocument } from '@pxe/editor-core';
import { createDefaultSceneSettings, type SceneSettings, defaultLayer, defaultRectHeight, defaultRectWidth } from '@pxe/schema';
import type { NodeData } from '@pxe/schema';
import { createComponentManifest, createManifestComponent, getComponentDefinition } from './componentManifest';
import { findNode } from './find';

/** Components that render a box need a node size to draw into. */
const boxComponents = new Set(['engine.GraphicsRenderer', 'engine.SpriteRenderer', 'engine.Button']);

export function addComponent(document: SceneDocument, nodeId: string, type: string, manifest = createComponentManifest()): boolean {
  const node = findNode(document.data.root, nodeId);
  if (!node || !getComponentDefinition(type, manifest)) return false;
  if (type.startsWith('engine.') && node.components.some((component) => component.type === type)) return false;

  const commands = [];
  const size = ensureNodeSize(node, type);

  if (size) {
    const root = document.data.root;
    commands.push(
      new SetNodePropertyCommand(root, nodeId, 'transform.width', size.width),
      new SetNodePropertyCommand(root, nodeId, 'transform.height', size.height),
    );
  }

  commands.push(new AddComponentCommand(document.data.root, nodeId, createManifestComponent(type, {}, manifest)));
  document.execute(commands.length === 1 ? commands[0]! : new BatchCommand('Add Component', commands));
  document.selectNode(nodeId);
  return true;
}

/** A box node created without a size gets the component's default box. */
function ensureNodeSize(node: NodeData, type: string): { width: number; height: number } | null {
  if (!boxComponents.has(type) || node.transform.width > 0 || node.transform.height > 0) {
    return null;
  }

  return type === 'engine.Button'
    ? { width: 200, height: 64 }
    : { width: defaultRectWidth, height: defaultRectHeight };
}

export const nodePresets = ['Node', 'Screen', 'UI Panel', 'UI Button', 'UI Label', 'Sprite'] as const;
export type NodePreset = (typeof nodePresets)[number];

export function createPresetNode(preset: NodePreset, settings: SceneSettings = createDefaultSceneSettings()): NodeData {
  const node = createEmptyNode(preset, { layer: preset === 'Node' || preset === 'Sprite' ? defaultLayer : 'UI' });
  node.transform.x = 200;
  node.transform.y = 180;
  node.transform.pivotX = 0;
  node.transform.pivotY = 0;

  if (preset === 'Screen') {
    Object.assign(node.transform, { width: settings.designWidth, height: settings.designHeight,
      x: settings.designWidth / 2, y: settings.designHeight / 2, pivotX: 0.5, pivotY: 0.5 });
    node.components.push(createManifestComponent('engine.UIAnchor', {
      anchorLeft: true, anchorRight: true, anchorTop: true, anchorBottom: true,
    }));
    return node;
  }

  if (preset === 'Node') {
    node.transform.width = 100;
    node.transform.height = 100;
    return node;
  }

  if (preset === 'Sprite') {
    node.transform.width = 96;
    node.transform.height = 96;
    // No texture by default: textures come from the project's asset database,
    // so the node starts empty and the Inspector assigns one.
    node.components.push(createManifestComponent('engine.SpriteRenderer', { sizeMode: 'stretch' }));
    return node;
  }

  const width = preset === 'UI Panel' ? 480 : 200;
  const height = preset === 'UI Panel' ? 320 : 64;
  node.transform.width = width;
  node.transform.height = height;

  if (preset !== 'UI Label') {
    node.components.push(createManifestComponent('engine.GraphicsRenderer', {
      fill: preset === 'UI Panel' ? '#1e293b' : '#0284c7',
    }));
  }

  if (preset === 'UI Label') {
    node.components.push(createManifestComponent('engine.TextRenderer', { text: 'Label', fontSize: 24 }));
  }

  if (preset === 'UI Button') {
    node.components.push(createManifestComponent('engine.Button'));
    const label = createEmptyNode('Label', { layer: 'UI' });
    label.transform.width = 180;
    label.transform.height = 40;
    label.transform.pivotX = 0.5;
    label.transform.pivotY = 0.5;
    label.components.push(
      createManifestComponent('engine.UIAnchor', { centerX: true, centerY: true }),
      createManifestComponent('engine.TextRenderer', { text: 'Button', fontSize: 24 }),
    );
    node.children.push(label);
  }

  return node;
}

export function addPresetNode(document: SceneDocument, parentId: string, preset: NodePreset): void {
  const node = createPresetNode(preset, document.data.settings);
  document.execute(new AddNodeCommand(document.data.root, preset === 'Screen' ? document.data.root.id : parentId, node));
  document.selectNode(node.id);
}
