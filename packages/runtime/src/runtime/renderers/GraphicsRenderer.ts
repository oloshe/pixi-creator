import {
  drawGraphicsShape,
  GraphicsShapes,
  graphicsRendererFactory,
  nullAssetResolver,
  PixiGraphicsRendererView,
  resolveGraphicsRendererProps,
  type GraphicsRendererProps,
  type GraphicsShape,
  type RenderContext,
} from '@pxe/rendering';
import { Graphics } from 'pixi.js';
import { Component } from '../Component';

export { drawGraphicsShape, GraphicsShapes, graphicsRendererFactory, resolveGraphicsRendererProps };
export type { GraphicsRendererProps, GraphicsShape };

/**
 * Backwards-compatible free function.
 *
 * The implementation is the shared `drawGraphicsShape` in `@pxe/rendering`; this
 * wrapper only preserves the historical argument order used by older callers.
 */
export function drawGraphics(
  graphics: Graphics,
  props: {
    shape: string;
    width: number;
    height: number;
    radius: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
  },
  offsetX = 0,
  offsetY = 0,
): void {
  drawGraphicsShape(
    graphics,
    resolveGraphicsRendererProps({
      shape: props.shape,
      radius: props.radius,
      fill: props.fill,
      stroke: props.stroke,
      strokeWidth: props.strokeWidth,
    }),
    props.width,
    props.height,
    offsetX,
    offsetY,
  );
}

/**
 * Runtime graphics component.
 *
 * Draws into the node rect through the shared `PixiGraphicsRendererView`. The
 * editor preview uses the same `PIXI.Graphics` path instead of CSS `background`
 * and `border-radius`.
 */
export class GraphicsRenderer extends Component {
  private view: PixiGraphicsRendererView | null = new PixiGraphicsRendererView();

  shape: GraphicsShape = 'roundedRect';
  radius = 12;
  fill = '#38bdf8';
  stroke = '#ffffff';
  strokeWidth = 0;
  /** `polygon` only, as `"x,y x,y …"`. */
  points = '';

  onLoad(): void {
    const view = this.ensureView();
    view.create();
    // Direct child of the node view: renderers never wrap themselves in an extra
    // container, so node → renderer display object is a single hop.
    this.node.view.addChild(view.displayObject);
    this.applyProperties();
  }

  /** Size always comes from the node RectTransform. */
  applyProperties(): void {
    if (!this.view) {
      return;
    }

    this.view.update(this.toProps(), this.renderContext());
  }

  onDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  private ensureView(): PixiGraphicsRendererView {
    this.view ??= new PixiGraphicsRendererView();
    return this.view;
  }

  private toProps(): GraphicsRendererProps {
    return graphicsRendererFactory.resolveProps({
      shape: this.shape,
      radius: this.radius,
      points: this.points,
      fill: this.fill,
      stroke: this.stroke,
      strokeWidth: this.strokeWidth,
      visible: this.enabled,
    });
  }

  private renderContext(): RenderContext {
    return {
      mode: 'runtime',
      // Graphics draws from the node rect and never loads assets.
      assets: nullAssetResolver,
      resolution: this.node.resolution,
      transform: this.node.rectTransform,
    };
  }
}
