import { BlendModes, GraphicsShapes, TextAligns, TextVerticalAligns } from '@pxe/rendering';
import { defineComponent, prop, type ComponentDefinition } from '../ComponentRegistry';
import { SpriteRenderer, SpriteSizeModes } from './SpriteRenderer';
import { TextRenderer } from './TextRenderer';
import { GraphicsRenderer } from './GraphicsRenderer';
import { Button } from '../ui/Button';
import { UIAnchor } from '../ui/UIAnchor';
import { defaultUIAnchor } from '../ui/layout';

/**
 * Component metadata.
 *
 * The editor reads this to build its Inspector and the runtime reads it to
 * instantiate components, so a renderer property is declared exactly once.
 */
const renderingCategory = 'Rendering';

export const SpriteRendererDefinition = defineComponent({
  type: 'engine.SpriteRenderer',
  displayName: 'Sprite Renderer',
  category: renderingCategory,
  ctor: SpriteRenderer,
  properties: {
    texture: prop.asset({ assetType: 'texture', default: null }),
    sizeMode: prop.enum({ values: [...SpriteSizeModes], default: 'stretch' }),
    tint: prop.color({ default: '#ffffff' }),
    blendMode: prop.enum({ values: [...BlendModes], default: 'normal' }),
    alpha: prop.number({ default: 1, min: 0, max: 1 }),
    // Only used by `sizeMode: custom`; every other mode derives from the node RectTransform.
    width: prop.number({ min: 0 }),
    height: prop.number({ min: 0 }),
  },
});

export const TextRendererDefinition = defineComponent({
  type: 'engine.TextRenderer',
  displayName: 'Text Renderer',
  category: renderingCategory,
  ctor: TextRenderer,
  properties: {
    text: prop.string({ default: '' }),
    fontFamily: prop.string({ default: 'Arial' }),
    // Optional project font; the family name is derived from its URL once loaded.
    fontAsset: prop.asset({ assetType: 'font', default: null }),
    fontSize: prop.number({ default: 32, min: 1 }),
    fontWeight: prop.string({ default: 'normal' }),
    color: prop.color({ default: '#ffffff' }),
    align: prop.enum({ values: [...TextAligns], default: 'left' }),
    verticalAlign: prop.enum({ values: [...TextVerticalAligns], default: 'top' }),
    wordWrap: prop.boolean({ default: false }),
    // 0 = wrap at the node rect width.
    wordWrapWidth: prop.number({ default: 0, min: 0 }),
    letterSpacing: prop.number({ default: 0 }),
    // No default: "Auto" lets the font decide.
    lineHeight: prop.number({ min: 0 }),
    strokeEnabled: prop.boolean({ default: false }),
    strokeColor: prop.color({ default: '#000000' }),
    strokeWidth: prop.number({ default: 0, min: 0 }),
    shadowEnabled: prop.boolean({ default: false }),
    shadowColor: prop.color({ default: '#000000' }),
    shadowBlur: prop.number({ default: 0, min: 0 }),
    shadowAngle: prop.number({ default: 45 }),
    shadowDistance: prop.number({ default: 0, min: 0 }),
  },
});

export const GraphicsRendererDefinition = defineComponent({
  type: 'engine.GraphicsRenderer',
  displayName: 'Graphics Renderer',
  category: renderingCategory,
  ctor: GraphicsRenderer,
  properties: {
    shape: prop.enum({ values: [...GraphicsShapes], default: 'roundedRect' }),
    radius: prop.number({ default: 12, min: 0 }),
    // `polygon` only: "x,y x,y …"
    points: prop.string({ default: '' }),
    fill: prop.color({ default: '#38bdf8' }),
    stroke: prop.color({ default: '#ffffff' }),
    strokeWidth: prop.number({ default: 0, min: 0 }),
  },
});

export const builtInRendererDefinitions: ComponentDefinition[] = [
  SpriteRendererDefinition,
  TextRendererDefinition,
  GraphicsRendererDefinition,
];

export const UIAnchorDefinition = defineComponent({
  type: UIAnchor.componentType, displayName: 'UI Anchor', category: 'UI', ctor: UIAnchor,
  properties: Object.fromEntries(Object.entries(defaultUIAnchor).map(([name, value]) => [name,
    typeof value === 'boolean' ? prop.boolean({ default: value }) : prop.number({ default: value }),
  ])),
});

export const builtInComponentDefinitions: ComponentDefinition[] = [
  ...builtInRendererDefinitions,
  UIAnchorDefinition,
  defineComponent({
    type: 'engine.Button', displayName: 'Button', category: 'UI', ctor: Button,
    properties: { interactable: prop.boolean({ default: true }) },
  }),
];
