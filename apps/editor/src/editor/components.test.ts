import { describe, expect, it } from 'vitest';
import { SceneDocument, createEmptyNode, duplicateNodeData, SetComponentPropertyCommand, RemoveComponentCommand } from '@pxe/editor-core';
import { createDefaultSceneSettings } from '@pxe/schema';
import { addComponent, createPresetNode } from './componentActions';
import { layoutPreview, nodeRect, contentBounds } from './previewLayout';
import { createManifestComponent } from './componentManifest';
import { transformNode } from './transformActions';

function document() {
  return new SceneDocument({
    schemaVersion: 4,
    id: 'scene-test',
    name: 'Test',
    settings: createDefaultSceneSettings(),
    root: createEmptyNode('Canvas'),
  });
}

describe('Component authoring workflow', () => {
  it('keeps Screen container moves through layout, undo and design-size changes', () => {
    const doc = document();
    const screen = createPresetNode('Screen', doc.data.settings);
    doc.data.root.children.push(screen);
    const before = layoutPreview(doc.data.root).children[0]!.transform;
    expect(before).toMatchObject({ width: 750, height: 1334, pivotX: 375, pivotY: 667, x: 375, y: 667 });
    expect(screen.components.map((item) => item.type)).toEqual(['engine.UIAnchor']);
    transformNode(doc, screen.id, before, { ...before, x: before.x + 40, y: before.y + 20 });
    expect(layoutPreview(doc.data.root).children[0]!.transform).toMatchObject({ x: 415, y: 687, width: 750 });
    doc.undo();
    expect(layoutPreview(doc.data.root).children[0]!.transform).toEqual(before);
    doc.data.root.transform.width = 900;
    expect(layoutPreview(doc.data.root).children[0]!.transform).toMatchObject({ width: 900, x: 375 });
  });
  it('adds a UI Anchor without a legacy UITransform; avoids duplicate built-ins', () => {
    const doc = document();
    expect(addComponent(doc, doc.data.root.id, 'engine.UIAnchor')).toBe(true);
    expect(doc.data.root.components.map((item) => item.type)).toEqual(['engine.UIAnchor']);
    expect(addComponent(doc, doc.data.root.id, 'engine.UIAnchor')).toBe(false);
    doc.undo();
    expect(doc.data.root.components).toHaveLength(0);
    doc.redo();
    expect(doc.data.root.components).toHaveLength(1);
  });

  it('gives a box node a size when a renderer is added to an unsized node', () => {
    const doc = document();
    doc.data.root.transform.width = 0;
    doc.data.root.transform.height = 0;
    addComponent(doc, doc.data.root.id, 'engine.GraphicsRenderer');
    expect(doc.data.root.transform.width).toBeGreaterThan(0);

    doc.undo();
    expect(doc.data.root.transform.width).toBe(0);
  });

  it('saves/reloads component properties, enabled state and missing component data', () => {
    const doc = document();
    addComponent(doc, doc.data.root.id, 'engine.UIAnchor');
    const anchor = doc.data.root.components[0]!;
    doc.execute(new SetComponentPropertyCommand(doc.data.root, anchor.id, 'props.left', 37));
    doc.execute(new SetComponentPropertyCommand(doc.data.root, anchor.id, 'enabled', false));
    doc.data.root.components.push({ id: 'missing', type: 'game.removed', enabled: false, props: { unknown: { nested: 42 } } });
    const reloaded = new SceneDocument(JSON.parse(JSON.stringify(doc.serialize())));
    expect(reloaded.data.root.components[0]).toMatchObject({ id: anchor.id, enabled: false, props: { left: 37 } });
    expect(reloaded.data.root.components[1]).toEqual(doc.data.root.components[1]);
    doc.execute(new RemoveComponentCommand(doc.data.root, anchor.id));
    doc.undo();
    expect(doc.data.root.components[0]!.props.left).toBe(37);
  });

  it('preview computes anchor stretch without dirtying or changing serialized transforms', () => {
    const root = createEmptyNode('Canvas');
    Object.assign(root.transform, { width: 480, height: 320 });
    const child = createPresetNode('UI Button');
    child.components.push(createManifestComponent('engine.UIAnchor', { anchorLeft: true, anchorRight: true, left: 10, right: 30 }));
    root.children.push(child);
    const doc = new SceneDocument({
      schemaVersion: 4,
      id: 'scene-ui',
      name: 'UI',
      settings: createDefaultSceneSettings({ designWidth: 480, designHeight: 320 }),
      root,
    });
    const before = doc.serialize();
    const preview = layoutPreview(doc.data.root);

    // Panel is 480 wide, so the stretched button is 480 - 10 - 30.
    expect(preview.children[0]!.transform.width).toBe(440);
    expect(preview.children[0]!.transform.x).toBe(10);
    expect(doc.serialize()).toEqual(before);
    expect(doc.dirty).toBe(false);
  });

  it('clones forward and component references after all new ids are allocated', () => {
    const root = createPresetNode('UI Button');
    const child = root.children[0]!;
    root.components.push({ id: 'refs', type: 'game.refs', enabled: true, props: {
      target: { nodeId: child.id }, component: { nodeId: child.id, componentId: child.components[0]!.id }, outside: { nodeId: 'outside' },
    } });
    const clone = duplicateNodeData(root);
    expect(clone.components.at(-1)!.props).toEqual({
      target: { nodeId: clone.children[0]!.id },
      component: { nodeId: clone.children[0]!.id, componentId: clone.children[0]!.components[0]!.id }, outside: { nodeId: 'outside' },
    });
  });

  it('keeps optional sprite dimensions automatic instead of setting them to zero', () => {
    expect(createManifestComponent('engine.SpriteRenderer').props).not.toHaveProperty('width');
  });
});

describe('Rect Transform helpers', () => {
  it('derives the parent-space rect from position, size, pivot and mirroring', () => {
    expect(nodeRect({ ...createEmptyNode('n').transform, x: 100, y: 80, width: 200, height: 100, pivotX: 100, pivotY: 50 }))
      .toEqual({ x: 0, y: 30, width: 200, height: 100 });

    // Mirrored horizontally: the pivot stays at x, so the rect extends left.
    expect(nodeRect({ ...createEmptyNode('n').transform, x: 0, y: 0, width: 100, height: 50, scaleX: -1 }))
      .toEqual({ x: -100, y: 0, width: 100, height: 50 });
  });

  it('computes design-space content bounds for Frame All', () => {
    const root = createPresetNode('UI Panel');
    const bounds = contentBounds(root);
    expect(bounds.width).toBeGreaterThanOrEqual(root.transform.width);
    expect(bounds.height).toBeGreaterThanOrEqual(root.transform.height);
  });
});
