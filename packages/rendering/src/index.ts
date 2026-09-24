/**
 * `@pxe/rendering` — the shared renderer layer.
 *
 * ```
 * Component props
 *   ↓ RendererRegistry (one registration per type)
 * RendererView
 *   ↓
 * Pixi display object
 * ```
 *
 * Both the editor preview and the runtime go through this package, which is what
 * makes "same component data → same pixels" a structural property rather than a
 * convention. The package never imports React, the editor store, the DOM or the
 * hierarchy/inspector code.
 */

export * from './core/RendererView';
export * from './core/RendererRegistry';
export * from './core/assetFormat';
export * from './core/rectTransform';
export * from './core/sceneOrder';
export * from './core/signature';
export * from './core/visual';

export * from './sprite/SpriteRendererView';
export * from './text/TextRendererView';
export * from './graphics/GraphicsRendererView';

export * from './preview/PreviewNode';
export * from './preview/ScenePreviewTree';

import { createRendererRegistry, type RendererRegistry } from './core/RendererRegistry';
import { graphicsRendererFactory } from './graphics/GraphicsRendererView';
import { spriteRendererFactory } from './sprite/SpriteRendererView';
import { textRendererFactory } from './text/TextRendererView';

/** Every renderer the engine ships, in registration order. */
export const builtInRendererFactories = [
  spriteRendererFactory,
  textRendererFactory,
  graphicsRendererFactory,
];

/**
 * A fresh registry with the built-in renderers.
 *
 * The runtime builds one at startup; the editor builds one for its preview. They
 * are the same three factories, so the two can only diverge by adding a renderer
 * in one place — which is exactly the thing the plan forbids.
 */
export function createBuiltInRendererRegistry(): RendererRegistry {
  return createRendererRegistry(builtInRendererFactories);
}
