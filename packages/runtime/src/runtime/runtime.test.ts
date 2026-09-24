import { describe, expect, it } from 'vitest';
import { createDefaultSceneSettings, createDefaultTransform, type SceneData } from '@pxe/schema';
import { AssetManager } from './AssetManager';
import { Component } from './Component';
import { ComponentRegistry, defineComponent, prop } from './ComponentRegistry';
import { GameNode } from './GameNode';
import { LayoutSystem } from './LayoutSystem';
import { MissingComponent } from './MissingComponent';
import { SceneLoader } from './SceneLoader';
import { UIAnchor } from './ui/UIAnchor';

class MoveComponent extends Component {
  speed = 100;
  startedCount = 0;

  start(): void {
    this.startedCount += 1;
  }

  update(dt: number): void {
    this.node.x += this.speed * dt;
  }
}

const MoveDefinition = defineComponent({
  type: 'game.move',
  displayName: 'Move',
  category: 'Game',
  ctor: MoveComponent,
  properties: {
    speed: prop.number({ default: 100 }),
  },
});

describe('GameNode', () => {
  it('manages parent-child relationships and prevents cycles', () => {
    const root = new GameNode('root', 'Root');
    const child = new GameNode('child', 'Child');
    const grandchild = new GameNode('grandchild', 'Grandchild');

    root.addChild(child);
    child.addChild(grandchild);

    expect(child.parent).toBe(root);
    expect(root.children).toEqual([child]);
    expect(() => root.setParent(grandchild)).toThrow('Cannot parent root');
  });

  it('keeps logical size separate from the scaled Pixi display object', () => {
    const node = new GameNode('node', 'Node');
    node.setSize(100, 50);
    node.scaleX = 2;

    expect(node.width).toBe(100);
    expect(node.height).toBe(50);
    // Pixi's own width would be scaled; the engine rect stays in design units.
    expect(node.view.scale.x).toBe(2);
  });

  it('applies the pixel pivot straight onto the Pixi pivot', () => {
    const node = new GameNode('node', 'Node');
    node.setSize(200, 100);
    node.pivotX = 100;
    node.pivotY = 50;

    expect(node.view.pivot.x).toBe(100);
    expect(node.view.pivot.y).toBe(50);
  });

  it('resolves the unrotated rect from position, size, pivot and scale', () => {
    const node = new GameNode('node', 'Node');
    node.applyTransform(createDefaultTransform({ x: 100, y: 80, width: 200, height: 100, pivotX: 100, pivotY: 50, scaleX: 2 }));

    expect(node.getRect()).toEqual({ x: -100, y: 30, width: 400, height: 100 });
  });

  it('sorts children by layer bucket then zIndex', () => {
    const node = new GameNode('node', 'Node');
    node.layerOrder = 3;
    node.zIndex = 5;

    expect(node.view.zIndex).toBe(3_000_005);
    expect(node.view.sortableChildren).toBe(true);
  });
});

describe('ComponentRegistry', () => {
  it('creates registered components and returns MissingComponent for unknown types', () => {
    const registry = new ComponentRegistry();
    registry.register(MoveDefinition);

    expect(registry.create('game.move')).toBeInstanceOf(MoveComponent);
    expect(registry.create('game.unknown')).toBeInstanceOf(MissingComponent);
  });
});

describe('LayoutSystem', () => {
  it('only resolves dirty nodes and cascades stretch from the parent rect', () => {
    const layout = new LayoutSystem();
    const parent = new GameNode('parent', 'Parent');
    parent.layout = layout;
    parent.setSize(600, 400);

    const child = new GameNode('child', 'Child');
    parent.addChild(child);

    const anchor = child.addComponent(new UIAnchor());
    anchor.anchorLeft = true;
    anchor.anchorRight = true;
    anchor.left = 20;
    anchor.right = 40;

    layout.flush();

    expect(child.width).toBe(540);
    expect(child.x).toBe(20);
    expect(layout.pending).toBe(0);

    // Nothing is dirty until something actually changes.
    layout.flush();
    expect(child.width).toBe(540);

    parent.setSize(800, 400);
    layout.flush();
    expect(child.width).toBe(740);
  });
});

describe('SceneLoader', () => {
  it('loads a v2 scene and applies anchor layout before the first update', async () => {
    const registry = new ComponentRegistry();
    registry.register(MoveDefinition);
    const assets = new AssetManager();
    await assets.init({ schemaVersion: 2, assets: [], scenePreloads: {} });

    const scene = await new SceneLoader(registry, assets).load(createScene());
    const player = scene.findNode('player');
    const mover = player?.getComponent(MoveComponent);

    expect(player?.parent?.id).toBe('root');
    expect(mover?.speed).toBe(50);

    await scene.update(0.5);
    await scene.update(0.5);

    expect(player?.x).toBe(50);
    expect(mover?.startedCount).toBe(1);
  });

  it('sizes the scene root to the design resolution', async () => {
    const assets = new AssetManager();
    await assets.init({ schemaVersion: 2, assets: [], scenePreloads: {} });
    const scene = await new SceneLoader(new ComponentRegistry(), assets).load(createScene());

    expect(scene.root.width).toBe(750);
    expect(scene.root.height).toBe(1334);
  });

  it('orders layer buckets by the default layer stack', async () => {
    const assets = new AssetManager();
    await assets.init({ schemaVersion: 2, assets: [], scenePreloads: {} });
    const data = createScene();
    data.root.children[0]!.layer = 'UI';
    const scene = await new SceneLoader(new ComponentRegistry(), assets).load(data);

    expect(scene.findNode('player')?.layer).toBe('UI');
    expect(scene.findNode('player')?.layerOrder).toBeGreaterThan(0);
  });

  it('preserves missing component data instead of failing scene load', async () => {
    const assets = new AssetManager();
    await assets.init({ schemaVersion: 2, assets: [], scenePreloads: {} });

    const data = createScene();
    data.root.children[0]?.components.push({
      id: 'old',
      type: 'game.old',
      enabled: true,
      props: { value: 42 },
    });

    const registry = new ComponentRegistry();
    registry.register(MoveDefinition);

    const scene = await new SceneLoader(registry, assets).load(data);
    const missing = scene.findNode('player')?.components[1];

    expect(missing).toBeInstanceOf(MissingComponent);
    expect((missing as MissingComponent).originalType).toBe('game.old');
    expect((missing as MissingComponent).rawProps).toEqual({ value: 42 });
  });
});

function createScene(): SceneData {
  return {
    schemaVersion: 4,
    id: 'scene-game',
    name: 'Game',
    settings: createDefaultSceneSettings(),
    root: {
      id: 'root',
      name: 'Canvas',
      active: true,
      zIndex: 0,
      transform: createDefaultTransform({ width: 100, height: 100 }),
      components: [],
      children: [
        {
          id: 'player',
          name: 'Player',
          active: true,
          zIndex: 0,
          transform: createDefaultTransform(),
          components: [
            {
              id: 'move',
              type: 'game.move',
              enabled: true,
              props: { speed: 50 },
            },
          ],
          children: [],
        },
      ],
    },
  };
}
