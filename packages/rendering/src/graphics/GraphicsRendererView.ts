import { Graphics } from 'pixi.js';
import type { RenderContext, RendererView } from '../core/RendererView';
import type { RendererFactory } from '../core/RendererRegistry';
import { buildSignature } from '../core/signature';
import { toColor, toNumber, toStringValue } from '../core/visual';

export const GraphicsShapes = ['rect', 'roundedRect', 'ellipse', 'circle', 'polygon'] as const;

export type GraphicsShape = (typeof GraphicsShapes)[number];

export function isGraphicsShape(value: unknown): value is GraphicsShape {
  return typeof value === 'string' && (GraphicsShapes as readonly string[]).includes(value);
}

export interface GraphicsRendererProps {
  shape: GraphicsShape;
  /**
   * Corner radius for `roundedRect`.
   *
   * The scene-level property is called `radius` (kept for scene-data
   * compatibility); the spec's `cornerRadius` is accepted as an alias.
   */
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** `polygon` only, as `"x,y x,y …"`. */
  points: string;
  visible: boolean;
}

export function resolveGraphicsRendererProps(raw: Record<string, unknown>): GraphicsRendererProps {
  return {
    shape: isGraphicsShape(raw.shape) ? raw.shape : 'roundedRect',
    radius: toNumber(raw.radius ?? raw.cornerRadius, 12),
    fill: toColor(raw.fill, '#38bdf8'),
    stroke: toColor(raw.stroke, '#ffffff'),
    strokeWidth: toNumber(raw.strokeWidth, 0),
    points: toStringValue(raw.points, ''),
    visible: raw.visible !== false,
  };
}

/** Parses `"x,y x,y …"` into Pixi's flat `[x, y, x, y, …]` polygon form. */
export function parsePolygonPoints(value: string): number[] {
  const points: number[] = [];

  for (const pair of value.split(/[\s;]+/)) {
    if (pair === '') {
      continue;
    }

    const [rawX, rawY] = pair.split(',');
    const x = Number(rawX);
    const y = Number(rawY);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push(x, y);
    }
  }

  return points;
}

/**
 * Draws a shape into the node rect.
 *
 * Local `(0,0)` is the rect's top-left corner: the normalized node pivot only
 * positions the rect, it never shifts its content. The editor preview cannot
 * fake this with CSS `background` / `border-radius`, because the runtime draws it
 * here — there is exactly one implementation.
 */
export function drawGraphicsShape(
  graphics: Graphics,
  props: GraphicsRendererProps,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): void {
  const x = offsetX;
  const y = offsetY;

  graphics.clear();

  switch (props.shape) {
    case 'ellipse':
      graphics.ellipse(x + width / 2, y + height / 2, width / 2, height / 2);
      break;
    case 'circle': {
      const radius = Math.min(width, height) / 2;
      graphics.circle(x + width / 2, y + height / 2, radius);
      break;
    }
    case 'polygon': {
      const points = parsePolygonPoints(props.points);

      if (points.length >= 6) {
        graphics.poly(points);
        break;
      }

      graphics.rect(x, y, width, height);
      break;
    }
    case 'roundedRect':
      graphics.roundRect(x, y, width, height, Math.min(props.radius, width / 2, height / 2));
      break;
    case 'rect':
    default:
      graphics.rect(x, y, width, height);
      break;
  }

  graphics.fill(props.fill);

  if (props.strokeWidth > 0) {
    graphics.stroke({ color: props.stroke, width: props.strokeWidth });
  }
}

/** Paints a shape from the node rect. The display object *is* the `Graphics`. */
export class PixiGraphicsRendererView implements RendererView<GraphicsRendererProps> {
  readonly displayObject = new Graphics();

  private created = false;
  private destroyed = false;
  private signature = '';

  create(): void {
    if (this.created || this.destroyed) {
      return;
    }

    this.created = true;
    this.displayObject.label = 'graphics-renderer';
  }

  update(props: GraphicsRendererProps, context: RenderContext): void {
    if (this.destroyed) {
      return;
    }

    if (!this.created) {
      this.create();
    }

    const width = context.transform.width;
    const height = context.transform.height;
    const signature = buildSignature([
      props.shape,
      props.radius,
      props.fill,
      props.stroke,
      props.strokeWidth,
      props.points,
      props.visible,
      width,
      height,
    ]);

    if (signature === this.signature) {
      return;
    }

    this.signature = signature;
    this.displayObject.visible = props.visible;
    drawGraphicsShape(this.displayObject, props, width, height);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.created = false;
    this.signature = '';
    this.displayObject.destroy({ texture: false, textureSource: false });
  }
}

export const graphicsRendererFactory: RendererFactory<GraphicsRendererProps> = {
  type: 'engine.GraphicsRenderer',
  create: () => new PixiGraphicsRendererView(),
  resolveProps: resolveGraphicsRendererProps,
};
