import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultSceneSettings,
  createDefaultTransform,
  type NodeData,
  type RectTransformData,
  type SceneData,
} from '@pxe/schema';
import {
  applyRectTransform,
  buildLayerOrder,
  createBuiltInRendererRegistry,
  createPixiTextStyle,
  createRendererRegistry,
  effectivePivot,
  nullAssetResolver,
  parsePolygonPoints,
  pixelPivot,
  PixiGraphicsRendererView,
  PixiSpriteRendererView,
  PixiTextRendererView,
  rectOfTransform,
  renderSortKey,
  RendererRegistry,
  resolveGraphicsRendererProps,
  resolveSpriteRendererProps,
  resolveSpriteSize,
  resolveTextRendererProps,
  resolveWordWrapWidth,
  ScenePreviewTree,
  spriteRendererFactory,
  textRendererFactory,
  toBlendMode,
  toColor,
  type AssetResolver,
  type RenderContext,
  type RendererFactory,
  type RendererView,
  type ScenePreviewSyncOptions,
} from './index';

const resolution = { designWidth: 750, designHeight: 1334, screenWidth: 750, screenHeight: 1334 };

function context(transform: RectTransformData, overrides: Partial<RenderContext> = {}): RenderContext {
  return { mode: 'runtime', assets: nullAssetResolver, resolution, transform, ...overrides };
}

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

describe('createPixiTextStyle', () => {
  const full = resolveTextRendererProps({
    text: 'Hello Pixi',
    fontFamily: 'Arial',
    fontSize: 60,
    fontWeight: '700',
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'top',
    wordWrap: true,
    wordWrapWidth: 0,
    letterSpacing: 2,
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 8,
    shadowEnabled: true,
    shadowColor: '#111111',
    shadowBlur: 6,
    shadowAngle: 90,
    shadowDistance: 4,
  });

  it('maps the full text contract onto a Pixi TextStyle', () => {
    const style = createPixiTextStyle(full, { width: 320, height: 100 });

    expect(style.fill).toBe('#ffffff');
    expect(style.fontFamily).toBe('Arial');
    expect(style.fontSize).toBe(60);
    expect(style.fontWeight).toBe('700');
    expect(style.align).toBe('center');
    expect(style.letterSpacing).toBe(2);
    expect(style.wordWrap).toBe(true);
    expect(style.stroke).toMatchObject({ color: '#000000', width: 8 });
    expect(style.dropShadow).toMatchObject({ color: '#111111', blur: 6, distance: 4 });
  });

  it('converts the shadow angle from degrees to radians', () => {
    const style = createPixiTextStyle(full, { width: 320, height: 100 });

    expect((style.dropShadow as unknown as { angle: number }).angle).toBeCloseTo(Math.PI / 2);
  });

  it('wraps at the node rect width when wordWrapWidth is auto', () => {
    expect(resolveWordWrapWidth(full, { width: 320, height: 100 })).toBe(320);
    expect(createPixiTextStyle(full, { width: 320, height: 100 }).wordWrapWidth).toBe(320);

    const explicit = resolveTextRendererProps({ ...full, wordWrapWidth: 120 });
    expect(createPixiTextStyle(explicit, { width: 320, height: 100 }).wordWrapWidth).toBe(120);
  });

  it('omits stroke and shadow unless they are enabled, and lineHeight unless set', () => {
    const plain = resolveTextRendererProps({ text: 'x' });
    const style = createPixiTextStyle(plain, { width: 100, height: 40 });

    expect(style.stroke).toBeUndefined();
    expect(style.dropShadow).toBeUndefined();
    expect(style.lineHeight).toBeUndefined();
    // An enabled stroke with zero width still draws nothing.
    expect(createPixiTextStyle(resolveTextRendererProps({ strokeEnabled: true }), { width: 10, height: 10 }).stroke).toBeUndefined();
  });

  it('applies lineHeight when it is provided', () => {
    const style = createPixiTextStyle(resolveTextRendererProps({ lineHeight: 72 }), { width: 100, height: 40 });
    expect(style.lineHeight).toBe(72);
  });

  it('normalises unknown values onto the documented defaults', () => {
    const props = resolveTextRendererProps({ fontSize: 'huge', align: 'middle', verticalAlign: 'center', color: '' });

    expect(props.fontSize).toBe(32);
    expect(props.align).toBe('left');
    expect(props.verticalAlign).toBe('top');
    expect(props.color).toBe('#ffffff');
  });
});

describe('PixiTextRendererView', () => {
  it('draws with PIXI.Text and aligns inside the node rect', () => {
    const view = new PixiTextRendererView();
    view.create();

    expect(view.displayObject).toBeInstanceOf(Text);

    view.update(
      resolveTextRendererProps({ text: 'Hello', fontSize: 60, align: 'center' }),
      context(createDefaultTransform({ width: 200, height: 80 })),
    );

    expect(view.displayObject.text).toBe('Hello');
    expect(view.displayObject.anchor.x).toBe(0.5);
    expect(view.displayObject.x).toBe(100);
    // Top alignment is the default and needs no measurement.
    expect(view.displayObject.y).toBe(0);

    view.update(
      resolveTextRendererProps({ text: 'Hello', fontSize: 60, align: 'right' }),
      context(createDefaultTransform({ width: 200, height: 80 })),
    );

    expect(view.displayObject.anchor.x).toBe(1);
    expect(view.displayObject.x).toBe(200);
  });

  it('re-applies the style when a text property changes', () => {
    const view = new PixiTextRendererView();
    view.create();

    view.update(resolveTextRendererProps({ text: 'A', fontSize: 20 }), context(createDefaultTransform()));
    view.update(
      resolveTextRendererProps({ text: 'A', fontSize: 20, strokeEnabled: true, strokeColor: '#ff0000', strokeWidth: 6 }),
      context(createDefaultTransform()),
    );

    expect(view.displayObject.style.stroke).toMatchObject({ color: '#ff0000', width: 6 });
  });

  it('honours component visibility and destroys cleanly', () => {
    const view = new PixiTextRendererView();
    view.create();
    view.update(resolveTextRendererProps({ text: 'A', visible: false }), context(createDefaultTransform()));

    expect(view.displayObject.visible).toBe(false);

    view.destroy();
    expect(view.displayObject.destroyed).toBe(true);
  });

  it('resolves a font asset through the AssetResolver and re-renders once it is ready', async () => {
    const loaded: string[] = [];
    const assets: AssetResolver = {
      getUrl: (assetId) => `/fonts/${assetId}.woff2`,
      loadTexture: async () => Texture.WHITE,
      loadFont: async (assetId) => {
        loaded.push(assetId);
      },
    };
    const requestRender = vi.fn();
    const view = new PixiTextRendererView();
    view.create();
    const props = resolveTextRendererProps({ text: 'A', fontAsset: { assetId: 'main' } });

    // First pass: the fallback family is used so nothing blocks.
    view.update(props, context(createDefaultTransform(), { assets, requestRender }));
    expect(view.displayObject.style.fontFamily).toBe('Arial');

    // The view re-applies itself when the face lands — no host round-trip needed.
    // Pixi capitalises the family name it derives from the file.
    await vi.waitFor(() => expect(view.displayObject.style.fontFamily).toBe('Main'));
    expect(loaded).toEqual(['main']);
    expect(requestRender).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* RectTransform                                                               */
/* -------------------------------------------------------------------------- */

describe('shared RectTransform maths', () => {
  it('derives the pixel pivot from the normalized pivot', () => {
    expect(pixelPivot({ width: 200, height: 100, pivotX: 0.5, pivotY: 1 })).toEqual({ x: 100, y: 100 });
  });

  it('mirrors the effective pivot for negative scale', () => {
    expect(effectivePivot(1, 0.25)).toBe(0.25);
    expect(effectivePivot(-1, 0.25)).toBe(0.75);
  });

  it('derives the parent-space rect, including mirroring', () => {
    expect(rectOfTransform(createDefaultTransform({ x: 100, y: 80, width: 200, height: 100, pivotX: 0.5, pivotY: 0.5 })))
      .toEqual({ x: 0, y: 30, width: 200, height: 100 });

    expect(rectOfTransform(createDefaultTransform({ width: 100, height: 50, scaleX: -1 })))
      .toEqual({ x: -100, y: 0, width: 100, height: 50 });
  });

  it('writes position, scale, rotation, pivot and alpha onto a container', () => {
    const container = new Container();
    applyRectTransform(container, createDefaultTransform({
      x: 10, y: 20, width: 200, height: 100, pivotX: 0.5, pivotY: 0.5, scaleX: 2, rotationDeg: 90, alpha: 0.5,
    }));

    expect(container.position.x).toBe(10);
    expect(container.position.y).toBe(20);
    expect(container.pivot.x).toBe(100);
    expect(container.pivot.y).toBe(50);
    expect(container.scale.x).toBe(2);
    expect(container.rotation).toBeCloseTo(Math.PI / 2);
    expect(container.alpha).toBe(0.5);
  });
});

describe('visual helpers', () => {
  it('maps engine blend modes onto Pixi, defaulting to normal', () => {
    expect(toBlendMode('add')).toBe('add');
    expect(toBlendMode('screen')).toBe('screen');
    expect(toBlendMode('multiply')).toBe('multiply');
    expect(toBlendMode('nonsense')).toBe('normal');
    expect(toBlendMode(undefined)).toBe('normal');
  });

  it('falls back when a colour is missing', () => {
    expect(toColor('#abcdef', '#000000')).toBe('#abcdef');
    expect(toColor('', '#000000')).toBe('#000000');
    expect(toColor(42, '#000000')).toBe('#000000');
  });
});

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

describe('RendererRegistry', () => {
  it('builds the three built-in renderers', () => {
    const registry = createBuiltInRendererRegistry();

    expect(registry.types()).toEqual([
      'engine.SpriteRenderer',
      'engine.TextRenderer',
      'engine.GraphicsRenderer',
    ]);
    expect(registry.create('engine.TextRenderer')).toBeInstanceOf(PixiTextRendererView);
  });

  it('returns null for components that are not renderers', () => {
    const registry = createBuiltInRendererRegistry();

    expect(registry.has('engine.UIAnchor')).toBe(false);
    expect(registry.create('engine.UIAnchor')).toBeNull();
    expect(registry.create('game.move')).toBeNull();
    expect(registry.factory('game.move')).toBeUndefined();
  });

  it('rejects duplicate and mismatched registrations', () => {
    const registry = new RendererRegistry();
    registry.register('test.thing', {
      type: 'test.thing',
      create: () => new PixiGraphicsRendererView(),
      resolveProps: resolveGraphicsRendererProps,
    });

    expect(() => registry.register('test.thing', {
      type: 'test.thing',
      create: () => new PixiGraphicsRendererView(),
      resolveProps: resolveGraphicsRendererProps,
    })).toThrow('already registered');

    expect(() => registry.register('test.other', {
      type: 'test.thing',
      create: () => new PixiGraphicsRendererView(),
      resolveProps: resolveGraphicsRendererProps,
    })).toThrow('mismatch');
  });

  it('registers many factories at once', () => {
    const registry = createRendererRegistry([spriteRendererFactory, textRendererFactory]);

    expect(registry.types()).toEqual(['engine.SpriteRenderer', 'engine.TextRenderer']);
    expect(createRendererRegistry().types()).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Sprite & Graphics                                                           */
/* -------------------------------------------------------------------------- */

describe('PixiSpriteRendererView', () => {
  it('stretches the texture across the node rect and applies tint/blend/alpha', () => {
    const view = new PixiSpriteRendererView();
    view.create();

    view.update(
      resolveSpriteRendererProps({ sizeMode: 'stretch', tint: '#ff0000', alpha: 0.5, blendMode: 'add' }),
      context(createDefaultTransform({ width: 120, height: 40 }), { mode: 'editor' }),
    );

    const placeholder = view.displayObject.children[0] as Graphics;
    const sprite = view.displayObject.children[1] as Sprite;

    expect(sprite.width).toBe(120);
    expect(sprite.height).toBe(40);
    // Pixi normalises the CSS colour onto a packed number.
    expect(sprite.tint).toBe(0xff0000);
    expect(sprite.alpha).toBe(0.5);
    expect(sprite.blendMode).toBe('add');
    // No texture is loaded, so the editor shows a placeholder rect.
    expect(placeholder.visible).toBe(true);
  });

  it('hides the placeholder outside the editor', () => {
    const view = new PixiSpriteRendererView();
    view.create();
    view.update(resolveSpriteRendererProps({}), context(createDefaultTransform({ width: 60, height: 60 }), { mode: 'runtime' }));

    const placeholder = view.displayObject.children[0] as Graphics;
    const sprite = view.displayObject.children[1] as Sprite;

    expect(placeholder.visible).toBe(false);
    expect(sprite.visible).toBe(false);
  });

  it('loads its texture through the AssetResolver', async () => {
    const requestRender = vi.fn();
    const assets: AssetResolver = {
      getUrl: () => '/assets/hero.png',
      loadTexture: async () => Texture.WHITE,
      loadFont: async () => undefined,
    };
    const view = new PixiSpriteRendererView();
    view.create();

    view.update(
      resolveSpriteRendererProps({ texture: { assetId: 'hero' }, sizeMode: 'stretch' }),
      context(createDefaultTransform({ width: 80, height: 80 }), { assets, requestRender }),
    );

    // The view re-applies itself when the texture lands — no host round-trip needed.
    const sprite = view.displayObject.children[1] as Sprite;
    const placeholder = view.displayObject.children[0] as Graphics;
    await vi.waitFor(() => expect(sprite.texture).toBe(Texture.WHITE));

    expect(sprite.width).toBe(80);
    expect(placeholder.visible).toBe(false);
    expect(requestRender).toHaveBeenCalled();
  });

  it('reports a texture failure instead of throwing', async () => {
    const reportWarning = vi.fn();
    const assets: AssetResolver = {
      getUrl: () => null,
      loadTexture: async () => {
        throw new Error('missing');
      },
      loadFont: async () => undefined,
    };
    const view = new PixiSpriteRendererView();
    view.create();

    view.update(
      resolveSpriteRendererProps({ texture: { assetId: 'gone' } }),
      context(createDefaultTransform(), { assets, reportWarning }),
    );

    await vi.waitFor(() => expect(reportWarning).toHaveBeenCalled());
    expect(reportWarning.mock.calls[0]?.[0]).toContain('gone');
  });
});

describe('PixiGraphicsRendererView', () => {
  function instructionsOf(view: PixiGraphicsRendererView) {
    return (view.displayObject as unknown as { context: { instructions: { action?: string }[] } }).context.instructions;
  }

  it('fills and strokes with PIXI.Graphics inside the node rect', () => {
    const view = new PixiGraphicsRendererView();
    view.create();

    expect(view.displayObject).toBeInstanceOf(Graphics);

    view.update(
      resolveGraphicsRendererProps({ shape: 'roundedRect', radius: 8, fill: '#123456', stroke: '#ffffff', strokeWidth: 4 }),
      context(createDefaultTransform({ width: 100, height: 50 })),
    );

    const actions = instructionsOf(view).map((instruction) => instruction.action);
    expect(actions).toContain('fill');
    expect(actions).toContain('stroke');
  });

  it('draws no stroke at zero width and honours visibility', () => {
    const view = new PixiGraphicsRendererView();
    view.create();
    view.update(
      resolveGraphicsRendererProps({ shape: 'rect', strokeWidth: 0, visible: false }),
      context(createDefaultTransform()),
    );

    expect(instructionsOf(view).map((instruction) => instruction.action)).not.toContain('stroke');
    expect(view.displayObject.visible).toBe(false);
  });

  it('accepts the spec cornerRadius alias and parses polygon points', () => {
    expect(resolveGraphicsRendererProps({ cornerRadius: 4 }).radius).toBe(4);
    expect(resolveGraphicsRendererProps({ radius: 9 }).radius).toBe(9);
    expect(parsePolygonPoints('0,0 100,0 50,80')).toEqual([0, 0, 100, 0, 50, 80]);
    expect(parsePolygonPoints('')).toEqual([]);
  });
});

describe('shared sprite sizing', () => {
  it('keeps the documented size modes', () => {
    const rect = { width: 200, height: 200 };
    const texture = { width: 100, height: 50 };

    expect(resolveSpriteSize('native', rect, texture)).toEqual({ width: 100, height: 50 });
    expect(resolveSpriteSize('stretch', rect, texture)).toEqual({ width: 200, height: 200 });
    expect(resolveSpriteSize('contain', rect, texture)).toEqual({ width: 200, height: 100 });
    expect(resolveSpriteSize('cover', rect, texture)).toEqual({ width: 400, height: 200 });
    expect(resolveSpriteSize('custom', rect, texture, { width: 40 })).toEqual({ width: 40, height: 200 });
  });
});

/* -------------------------------------------------------------------------- */
/* Preview tree — the incremental contract                                     */
/* -------------------------------------------------------------------------- */

interface CounterProps {
  value: number;
}

class CountingView implements RendererView<CounterProps> {
  readonly displayObject = new Container();
  created = 0;
  updates = 0;
  destroyed = 0;
  lastValue = Number.NaN;

  create(): void {
    this.created += 1;
  }

  update(props: CounterProps): void {
    this.updates += 1;
    this.lastValue = props.value;
  }

  destroy(): void {
    this.destroyed += 1;
    this.displayObject.destroy({ children: true });
  }
}

describe('ScenePreviewTree incremental sync', () => {
  function harness() {
    const views: CountingView[] = [];
    const factory: RendererFactory<CounterProps> = {
      type: 'test.counter',
      create: () => {
        const view = new CountingView();
        views.push(view);
        return view;
      },
      resolveProps: (raw) => ({ value: typeof raw.value === 'number' ? raw.value : 0 }),
    };
    const registry = createRendererRegistry([factory]);
    const tree = new ScenePreviewTree(registry);
    const options = (overrides: Partial<ScenePreviewSyncOptions> = {}): ScenePreviewSyncOptions => ({
      mode: 'editor',
      assets: nullAssetResolver,
      resolution,
      ...overrides,
    });

    return { views, registry, tree, options };
  }

  function counterNode(id: string, value: number, overrides: Partial<NodeData> = {}): NodeData {
    return {
      id,
      name: id,
      active: true,
      zIndex: 0,
      transform: createDefaultTransform(),
      components: [{ id: `${id}-c`, type: 'test.counter', enabled: true, props: { value } }],
      children: [],
      ...overrides,
    };
  }

  function sceneOf(root: NodeData): SceneData {
    return { schemaVersion: 3, id: 'scene-preview', name: 'Preview', settings: createDefaultSceneSettings(), root };
  }

  it('creates Pixi containers and renderer views on the first sync', () => {
    const { tree, options, views } = harness();
    const stats = tree.sync(sceneOf(counterNode('root', 1)), options());

    expect(stats.nodesCreated).toBe(1);
    expect(stats.renderersCreated).toBe(1);
    expect(tree.nodes.get('root')?.container).toBeInstanceOf(Container);
    expect(views[0]?.created).toBe(1);
    expect(tree.root?.nodeId).toBe('root');
  });

  it('does not rebuild anything when the scene is unchanged', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1);
    tree.sync(sceneOf(root), options());

    const container = tree.nodes.get('root')!.container;
    const view = tree.nodes.get('root')!.renderers.get('root-c');

    const stats = tree.sync(sceneOf(root), options());

    expect(stats.nodesCreated).toBe(0);
    expect(stats.renderersCreated).toBe(0);
    expect(stats.renderersDestroyed).toBe(0);
    expect(stats.transformUpdates).toBe(0);
    // Same Pixi objects: an Inspector keystroke must never churn display objects.
    expect(tree.nodes.get('root')!.container).toBe(container);
    expect(tree.nodes.get('root')!.renderers.get('root-c')).toBe(view);
  });

  it('touches only the moved node when a transform changes', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1, {
      children: [counterNode('a', 1), counterNode('b', 2)],
    });
    tree.sync(sceneOf(root), options());

    const a = tree.nodes.get('a')!.container;
    const b = tree.nodes.get('b')!.container;
    const before = { x: a.x, y: a.y };

    root.children[1]!.transform.x = 40;
    root.children[1]!.transform.y = 15;
    const stats = tree.sync(sceneOf(root), options());

    expect(stats.transformUpdates).toBe(1);
    expect(stats.renderersCreated).toBe(0);
    expect({ x: a.x, y: a.y }).toEqual(before);
    expect(b.x).toBe(40);
    expect(b.y).toBe(15);
  });

  it('updates just the edited component props', () => {
    const { tree, options, views } = harness();
    const root = counterNode('root', 1, { children: [counterNode('a', 1), counterNode('b', 2)] });
    tree.sync(sceneOf(root), options());

    const aView = tree.nodes.get('a')!.renderers.get('a-c') as unknown as CountingView;
    const bView = tree.nodes.get('b')!.renderers.get('b-c') as unknown as CountingView;

    root.children[1]!.components[0]!.props.value = 99;
    const stats = tree.sync(sceneOf(root), options());

    expect(stats.renderersCreated).toBe(0);
    expect(bView.lastValue).toBe(99);
    expect(aView.lastValue).toBe(1);
    expect(views).toHaveLength(3);
  });

  it('adds and removes renderers as components appear and disappear', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1);
    tree.sync(sceneOf(root), options());
    expect(tree.nodes.get('root')!.renderers.size).toBe(1);

    root.components.push({ id: 'extra', type: 'test.counter', enabled: true, props: { value: 7 } });
    let stats = tree.sync(sceneOf(root), options());
    expect(stats.renderersCreated).toBe(1);
    expect(tree.nodes.get('root')!.renderers.size).toBe(2);

    root.components = root.components.filter((component) => component.id === 'extra');
    stats = tree.sync(sceneOf(root), options());
    expect(stats.renderersDestroyed).toBe(1);
    expect(tree.nodes.get('root')!.renderers.size).toBe(1);
  });

  it('ignores disabled components and non-renderer types', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1);
    root.components = [
      { id: 'off', type: 'test.counter', enabled: false, props: { value: 5 } },
      { id: 'anchor', type: 'engine.UIAnchor', enabled: true, props: {} },
    ];

    const stats = tree.sync(sceneOf(root), options());

    expect(stats.renderersCreated).toBe(0);
    expect(tree.nodes.get('root')!.renderers.size).toBe(0);
  });

  it('prunes removed nodes and destroys their Pixi containers', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1, { children: [counterNode('a', 1)] });
    tree.sync(sceneOf(root), options());

    const removed = tree.nodes.get('a')!.container;
    root.children = [];
    const stats = tree.sync(sceneOf(root), options());

    expect(stats.nodesRemoved).toBe(1);
    expect(tree.nodes.has('a')).toBe(false);
    expect(removed.destroyed).toBe(true);
  });

  it('reparents a node when the hierarchy changes', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1, { children: [counterNode('a', 1), counterNode('b', 2)] });
    tree.sync(sceneOf(root), options());

    const a = tree.nodes.get('a')!.container;
    expect(tree.parentOf('a')).toBe('root');

    // Move `a` under `b`.
    const aData = root.children[0]!;
    const bData = root.children[1]!;
    root.children = [bData];
    bData.children = [aData];
    tree.sync(sceneOf(root), options());

    expect(a.parent).toBe(tree.nodes.get('b')!.container);
    expect(tree.parentOf('a')).toBe('b');
  });

  it('applies layer buckets and zIndex like the runtime', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1, { layer: 'UI', zIndex: 5 });
    tree.sync(sceneOf(root), options());

    const order = buildLayerOrder(root);
    expect(tree.nodes.get('root')!.container.zIndex).toBe(renderSortKey(order.get('UI')!, 5));
    expect(tree.nodes.get('root')!.container.sortableChildren).toBe(true);
  });

  it('reads editor visibility from node state without touching the scene data', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1);
    const snapshot = structuredClone(root);

    tree.sync(sceneOf(root), options({ nodeState: () => ({ locked: false, editorVisible: false }) }));
    expect(tree.nodes.get('root')!.container.visible).toBe(false);

    tree.sync(sceneOf(root), options());
    expect(tree.nodes.get('root')!.container.visible).toBe(true);
    // Editor-only state never leaks back into SceneData.
    expect(root).toEqual(snapshot);
  });

  it('removes a node subtree through removeNode', () => {
    const { tree, options } = harness();
    const root = counterNode('root', 1, { children: [counterNode('a', 1, { children: [counterNode('c', 1)] })] });
    tree.sync(sceneOf(root), options());

    tree.removeNode('a');

    expect(tree.nodes.has('a')).toBe(false);
    expect(tree.nodes.has('c')).toBe(false);
  });
});
