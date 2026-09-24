import { createDefaultSceneSettings, createDefaultTransform, type SceneData } from '@pxe/schema';
import { describe, expect, it } from 'vitest';
import { EditorMetadata } from './EditorMetadata';
import { SceneDocument } from './SceneDocument';
import {
  AddComponentCommand,
  AddNodeCommand,
  DeleteNodeCommand,
  DuplicateNodeCommand,
  ReparentNodeCommand,
  SetNodeTransformCommand,
  SetComponentPropertyCommand,
  SetNodePropertyCommand,
  SetSceneNameCommand,
  SetSceneSettingsCommand,
} from './commands';
import { createCanvasNode, createComponentData, createEmptyNode, findNode, isSceneRoot } from './utils';

function createScene(): SceneData {
  return {
    schemaVersion: 3,
    id: 'scene-editor',
    name: 'Editor',
    settings: createDefaultSceneSettings(),
    root: {
      id: 'root',
      name: 'Canvas',
      active: true,
      zIndex: 0,
      transform: createDefaultTransform({ width: 750, height: 1334 }),
      components: [],
      children: [
        {
          id: 'player',
          name: 'Player',
          active: true,
          zIndex: 0,
          transform: createDefaultTransform({ x: 10 }),
          components: [
            { id: 'move', type: 'game.move', enabled: true, props: { speed: 100 } },
          ],
          children: [],
        },
        {
          id: 'ui',
          name: 'UI',
          active: true,
          zIndex: 0,
          transform: createDefaultTransform(),
          components: [],
          children: [],
        },
      ],
    },
  };
}

describe('SceneDocument', () => {
  it('updates node properties through undoable commands', () => {
    const document = new SceneDocument(createScene());

    document.execute(new SetNodePropertyCommand(document.data.root, 'player', 'transform.x', 42));
    expect(findNode(document.data.root, 'player')?.node.transform.x).toBe(42);
    expect(document.dirty).toBe(true);

    document.undo();
    expect(findNode(document.data.root, 'player')?.node.transform.x).toBe(10);

    document.redo();
    expect(findNode(document.data.root, 'player')?.node.transform.x).toBe(42);
  });

  it('stores layer and zIndex as node properties', () => {
    const document = new SceneDocument(createScene());

    document.execute(new SetNodePropertyCommand(document.data.root, 'player', 'layer', 'UI'));
    document.execute(new SetNodePropertyCommand(document.data.root, 'player', 'zIndex', 5));

    expect(findNode(document.data.root, 'player')?.node.layer).toBe('UI');
    expect(findNode(document.data.root, 'player')?.node.zIndex).toBe(5);

    document.undo();
    expect(findNode(document.data.root, 'player')?.node.zIndex).toBe(0);
  });

  it('adds, deletes, reparents, and duplicates nodes', () => {
    const document = new SceneDocument(createScene());
    const child = createEmptyNode('Child', { id: 'child' });

    document.execute(new AddNodeCommand(document.data.root, 'player', child));
    expect(findNode(document.data.root, 'child')?.parent?.id).toBe('player');

    document.execute(new ReparentNodeCommand(document.data.root, 'child', 'ui'));
    expect(findNode(document.data.root, 'child')?.parent?.id).toBe('ui');

    document.execute(new DuplicateNodeCommand(document.data.root, 'child'));
    expect(findNode(document.data.root, 'ui')?.node.children).toHaveLength(2);

    document.execute(new DeleteNodeCommand(document.data.root, 'child'));
    expect(findNode(document.data.root, 'child')).toBeNull();

    document.undo();
    expect(findNode(document.data.root, 'child')?.parent?.id).toBe('ui');
  });

  it('protects the Canvas design-space root', () => {
    const document = new SceneDocument(createScene());

    expect(isSceneRoot(document.data.root, 'root')).toBe(true);
    expect(document.data.root.name).toBe('Canvas');

    // Delete is a no-op, duplicate and reparent throw.
    document.execute(new DeleteNodeCommand(document.data.root, 'root'));
    expect(findNode(document.data.root, 'root')).not.toBeNull();
    expect(() => document.execute(new DuplicateNodeCommand(document.data.root, 'root'))).toThrow('Cannot duplicate the root node');
    expect(() => new ReparentNodeCommand(document.data.root, 'root', 'ui').execute()).toThrow('Cannot reparent the root node');
  });

  it('updates component properties through undoable commands', () => {
    const document = new SceneDocument(createScene());

    document.execute(new SetComponentPropertyCommand(document.data.root, 'move', 'props.speed', 250));
    expect(findNode(document.data.root, 'player')?.node.components[0]?.props.speed).toBe(250);

    document.undo();
    expect(findNode(document.data.root, 'player')?.node.components[0]?.props.speed).toBe(100);
  });

  it('updates a full transform as one undoable command', () => {
    const document = new SceneDocument(createScene());
    const node = findNode(document.data.root, 'player')!.node;
    const next = { ...node.transform, x: 200, y: 300 };

    document.execute(new SetNodeTransformCommand(document.data.root, 'player', next));
    expect(node.transform.x).toBe(200);
    expect(node.transform.y).toBe(300);

    document.undo();
    expect(node.transform.x).toBe(10);
    expect(node.transform.y).toBe(0);
  });

  it('adds components and serializes valid scene data', () => {
    const document = new SceneDocument(createScene());

    document.execute(new AddComponentCommand(document.data.root, 'ui', createComponentData('engine.TextRenderer')));

    const serialized = document.serialize();
    expect(serialized.root.children[1]?.components[0]?.type).toBe('engine.TextRenderer');
  });

  it('keeps the Canvas node size in sync with the design resolution', () => {
    const document = new SceneDocument(createScene());

    document.execute(new SetSceneSettingsCommand(document.data, { designWidth: 1080, designHeight: 1920 }));

    expect(document.data.settings.designWidth).toBe(1080);
    expect(document.data.root.transform.width).toBe(1080);
    expect(document.data.root.transform.height).toBe(1920);

    document.undo();
    expect(document.data.settings.designWidth).toBe(750);
    expect(document.data.root.transform.width).toBe(750);
  });

  it('renames the scene undoably', () => {
    const document = new SceneDocument(createScene());
    document.execute(new SetSceneNameCommand(document.data, 'Level 1'));
    expect(document.serialize().name).toBe('Level 1');
    document.undo();
    expect(document.serialize().name).toBe('Editor');
  });
});

describe('EditorMetadata', () => {
  it('keeps camera, expansion, lock and view preferences out of the game scene', () => {
    const document = new SceneDocument(createScene());
    const meta = new EditorMetadata();

    meta.setCamera({ x: 320, y: 500, zoom: 0.8 });
    meta.setExpanded('ui', false);
    meta.updateNodeMeta('player', { locked: true, editorVisible: false });
    meta.updateView({ showGrid: false, devicePreviewId: 'iphone-14' });

    expect(meta.camera).toEqual({ x: 320, y: 500, zoom: 0.8 });
    expect(meta.isExpanded('ui')).toBe(false);
    expect(meta.isLocked('player')).toBe(true);
    expect(meta.isEditorVisible('player')).toBe(false);

    const gameJson = document.serialize();
    expect(JSON.stringify(gameJson)).not.toContain('camera');
    expect(JSON.stringify(gameJson)).not.toContain('locked');

    const restored = EditorMetadata.parse(JSON.parse(meta.serialize()));
    expect(restored.camera).toEqual({ x: 320, y: 500, zoom: 0.8 });
    expect(restored.isExpanded('ui')).toBe(false);
    expect(restored.isLocked('player')).toBe(true);
    expect(restored.view.devicePreviewId).toBe('iphone-14');
  });

  it('prunes metadata of deleted nodes and clamps the zoom', () => {
    const meta = new EditorMetadata();
    meta.updateNodeMeta('gone', { locked: true });
    meta.prune(['root']);
    expect(meta.isLocked('gone')).toBe(false);

    meta.setCamera({ zoom: -1 });
    expect(meta.camera.zoom).toBe(1);
  });

  it('tracks collapsed components through serialize/parse and prune', () => {
    const meta = new EditorMetadata();
    expect(meta.isComponentCollapsed('move')).toBe(true);

    meta.setComponentCollapsed('move', false);
    expect(meta.isComponentCollapsed('move')).toBe(false);

    const restored = EditorMetadata.parse(JSON.parse(meta.serialize()));
    expect(restored.isComponentCollapsed('move')).toBe(false);

    meta.prune(['root'], ['other']);
    expect(meta.isComponentCollapsed('move')).toBe(true);
  });
});

describe('utils', () => {
  it('creates a canvas node matching the scene settings', () => {
    const settings = createDefaultSceneSettings({ designWidth: 1280, designHeight: 720 });
    const canvas = createCanvasNode(settings);

    expect(canvas.name).toBe('Canvas');
    expect(canvas.transform.width).toBe(1280);
    expect(canvas.transform.height).toBe(720);
  });
});
