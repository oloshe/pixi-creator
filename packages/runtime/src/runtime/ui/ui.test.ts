import { EventBoundary, FederatedPointerEvent } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultSceneSettings, createDefaultTransform, type NodeData, type SceneData } from '@pxe/schema';
import { AssetManager } from '../AssetManager';
import { Component } from '../Component';
import { ComponentRegistry, defineComponent, prop } from '../ComponentRegistry';
import { SceneLoader } from '../SceneLoader';
import { GameNode } from '../GameNode';
import { builtInComponentDefinitions } from '../renderers/definitions';
import { GraphicsRenderer } from '../renderers/GraphicsRenderer';
import { resolveSpriteSize } from '../renderers/SpriteRenderer';
import { Button } from './Button';
import { UIAnchor } from './UIAnchor';
import { defaultUIAnchor, calculateAnchorLayout } from './layout';

const parent = { width: 600, height: 400 };

describe('UI Anchor layout', () => {
  it('does nothing when no edge or centre is enabled', () => {
    const result = calculateAnchorLayout(parent, { width: 160, height: 100 }, defaultUIAnchor, createDefaultTransform({ x: 12, y: 34 }));
    expect(result).toEqual({ x: 12, y: 34, width: 160, height: 100 });
  });

  it('centres inside the parent box (origin is the top-left corner)', () => {
    const result = calculateAnchorLayout(
      parent,
      { width: 160, height: 100 },
      { ...defaultUIAnchor, centerX: true, centerY: true },
      createDefaultTransform({ pivotX: 80, pivotY: 50 }),
    );

    expect(result.x).toBe(300);
    expect(result.y).toBe(200);
  });

  it('stretches between opposite edges with margins and scale', () => {
    const result = calculateAnchorLayout(
      parent,
      { width: 160, height: 100 },
      { ...defaultUIAnchor, anchorLeft: true, anchorRight: true, anchorTop: true, anchorBottom: true, left: 20, right: 40, top: 10, bottom: 30 },
      createDefaultTransform({ scaleX: 2 }),
    );

    // width = (600 - 20 - 40) / scale, height = 400 - 10 - 30
    expect(result).toEqual({ x: 20, y: 10, width: 270, height: 360 });
  });

  it('anchors to the right and bottom edges with margins', () => {
    const result = calculateAnchorLayout(
      parent,
      { width: 200, height: 64 },
      { ...defaultUIAnchor, anchorRight: true, anchorBottom: true, right: 20, bottom: 30 },
      createDefaultTransform({ x: 0, y: 0 }),
    );

    expect(result.x).toBe(600 - 20 - 200);
    expect(result.y).toBe(400 - 30 - 64);
  });

  it('keeps the parent size when both edges are enabled but scale is zero', () => {
    const result = calculateAnchorLayout(
      parent,
      { width: 100, height: 50 },
      { ...defaultUIAnchor, anchorLeft: true, anchorRight: true, left: 1000 },
      createDefaultTransform({ scaleX: 0, y: 40 }),
    );

    expect(result.width).toBe(100);
    expect(result.y).toBe(40);
  });

  it('mirrors the effective pivot for negative scale', () => {
    const result = calculateAnchorLayout(
      parent,
      { width: 100, height: 50 },
      { ...defaultUIAnchor, anchorRight: true, right: 0 },
      createDefaultTransform({ scaleX: -1 }),
    );

    // Rendered width is 100, so the right edge sits at 500.
    expect(result.x).toBe(600);
  });
});

describe('Sprite size modes', () => {
  it('native uses the texture size, stretch fills the node rect', () => {
    expect(resolveSpriteSize('native', { width: 300, height: 300 }, { width: 64, height: 32 })).toEqual({ width: 64, height: 32 });
    expect(resolveSpriteSize('stretch', { width: 300, height: 300 }, { width: 64, height: 32 })).toEqual({ width: 300, height: 300 });
  });

  it('custom prefers the component width/height over the node rect', () => {
    expect(resolveSpriteSize('custom', { width: 300, height: 300 }, { width: 64, height: 32 }, { width: 120 })).toEqual({ width: 120, height: 300 });
  });

  it('contain and cover preserve the texture aspect ratio', () => {
    expect(resolveSpriteSize('contain', { width: 200, height: 200 }, { width: 100, height: 50 })).toEqual({ width: 200, height: 100 });
    expect(resolveSpriteSize('cover', { width: 200, height: 200 }, { width: 100, height: 50 })).toEqual({ width: 400, height: 200 });
  });
});

function node(id: string): NodeData {
  return { id, name: id, active: true, zIndex: 0, transform: createDefaultTransform(), components: [], children: [] };
}

async function load(root: NodeData, registry = new ComponentRegistry(), size = { width: 600, height: 400 }) {
  const assets = new AssetManager();
  await assets.init({ schemaVersion: 2, assets: [], scenePreloads: {} });
  // The scene root always matches the design resolution.
  const data: SceneData = {
    schemaVersion: 4,
    id: 'scene-ui',
    name: 'UI',
    settings: createDefaultSceneSettings({ designWidth: size.width, designHeight: size.height }),
    root,
  };
  return new SceneLoader(registry, assets).load(data);
}

describe('UI runtime', () => {
  it('lays out nested anchors before display and responds to parent resizing', async () => {
    const root = node('root');
    const child = node('child');
    child.transform.width = 100;
    child.transform.height = 50;
    child.components.push(
      { id: 'anchor', type: 'engine.UIAnchor', enabled: true, props: { anchorLeft: true, anchorRight: true, left: 20, right: 40 } },
      { id: 'graphics', type: 'engine.GraphicsRenderer', enabled: true, props: {} },
    );
    root.children.push(child);

    const registry = new ComponentRegistry();
    registry.registerMany(builtInComponentDefinitions);
    const scene = await load(root, registry);
    const runtimeChild = scene.findNode('child')!;

    expect(scene.root.width).toBe(600);
    expect(runtimeChild.x).toBe(20);
    expect(runtimeChild.width).toBe(540);

    scene.root.width = 800;
    scene.root.markLayoutDirty();
    await scene.update(0);

    expect(runtimeChild.width).toBe(740);
    // Source data is never modified by layout.
    expect(root.children[0]!.components[0]!.props.width).toBeUndefined();
    expect(root.children[0]!.transform.width).toBe(100);

    runtimeChild.getComponent(GraphicsRenderer)!.enabled = false;
    await scene.update(0);
    expect(runtimeChild.view.children[0]!.visible).toBe(false);
    scene.destroy();
  });

  it('resolves right edge anchors', async () => {
    const root = node('root');
    const child = node('child');
    const registry = new ComponentRegistry();
    registry.registerMany(builtInComponentDefinitions);
    child.components.push({ id: 'anchor', type: 'engine.UIAnchor', enabled: true, props: { anchorRight: true, right: 25 } });
    root.children.push(child);
    const scene = await load(root, registry);

    expect(scene.findNode('child')!.x).toBe(600 - 25 - 100);
    scene.destroy();
  });

  it('marks anchored nodes dirty only when the resolution changes', async () => {
    const root = node('root');
    const child = node('child');
    child.components.push({ id: 'anchor', type: 'engine.UIAnchor', enabled: true, props: { anchorRight: true, right: 10 } });
    root.children.push(child);
    const registry = new ComponentRegistry();
    registry.registerMany(builtInComponentDefinitions);
    const scene = await load(root, registry, { width: 300, height: 200 });

    expect(scene.findNode('child')!.x).toBe(300 - 10 - 100);
    expect(scene.layout.pending).toBe(0);

    scene.root.setSize(500, 200);
    expect(scene.layout.pending).toBeGreaterThan(0);

    await scene.update(0);
    expect(scene.findNode('child')!.x).toBe(500 - 10 - 100);
    expect(scene.layout.pending).toBe(0);
    scene.destroy();
  });

  it('Button emits events only when interactable, active and enabled, and detaches on removal', () => {
    const root = new GameNode('button', 'Button');
    root.setSize(120, 40);
    const button = root.addComponent(new Button());
    button.onLoad();
    const click = vi.fn();
    const down = vi.fn();
    button.on('click', click);
    button.on('pointerDown', down);
    root.view.emit('pointertap', new FederatedPointerEvent(new EventBoundary()));
    root.view.emit('pointerdown', new FederatedPointerEvent(new EventBoundary()));
    expect(click).toHaveBeenCalledTimes(1);
    expect(down).toHaveBeenCalledTimes(1);
    button.interactable = false;
    root.view.emit('pointertap', new FederatedPointerEvent(new EventBoundary()));
    button.interactable = true;
    button.enabled = false;
    root.view.emit('pointertap', new FederatedPointerEvent(new EventBoundary()));
    button.enabled = true;
    root.active = false;
    root.view.emit('pointertap', new FederatedPointerEvent(new EventBoundary()));
    root.active = true;
    root.removeComponent(button);
    root.view.emit('pointertap', new FederatedPointerEvent(new EventBoundary()));
    expect(click).toHaveBeenCalledTimes(1);
    expect(root.view.hitArea).toBeNull();
    root.destroy();
  });

  it('uses the node RectTransform as the button hit area', () => {
    const root = new GameNode('button', 'Button');
    root.setSize(200, 64);
    root.pivotX = 0.5;
    root.pivotY = 0.5;
    const button = root.addComponent(new Button());
    button.onLoad();

    expect(root.view.hitArea).toMatchObject({ x: 0, y: 0, width: 200, height: 64 });
    root.destroy();
  });

  it('resolves forward node/component references before onLoad, filters wrong component types', async () => {
    class References extends Component {
      target: GameNode | null = null;
      anchor: UIAnchor | null = null;
      wrong: UIAnchor | null = null;
      loadedTarget = '';
      onLoad() { this.loadedTarget = this.target?.id ?? ''; }
    }
    const root = node('root');
    const child = node('child');
    root.components.push({ id: 'refs', type: 'test.references', enabled: true, props: {
      target: { nodeId: 'child' }, anchor: { nodeId: 'child', componentId: 'anchor' }, wrong: { nodeId: 'root', componentId: 'anchor' },
    } });
    child.components.push({ id: 'anchor', type: 'engine.UIAnchor', enabled: true, props: {} });
    root.children.push(child);
    const registry = new ComponentRegistry();
    registry.registerMany(builtInComponentDefinitions);
    registry.register(defineComponent({ type: 'test.references', displayName: 'References', category: 'Test', ctor: References,
      properties: { target: prop.nodeRef(), anchor: prop.componentRef({ componentType: 'engine.UIAnchor' }), wrong: prop.componentRef() },
    }));
    const scene = await load(root, registry);
    const refs = scene.root.getComponent(References)!;
    expect(refs.loadedTarget).toBe('child');
    expect(refs.anchor).toBe(scene.findNode('child')!.getComponent(UIAnchor));
    expect(refs.wrong).toBeNull();
    scene.destroy();
  });
});
