import type { GameNode } from '../GameNode';
import { SpriteRenderer } from '../renderers/SpriteRenderer';
import { TextRenderer } from '../renderers/TextRenderer';
import { GraphicsRenderer } from '../renderers/GraphicsRenderer';
import { Button } from './Button';

/**
 * Pushes runtime component state into Pixi display objects.
 *
 * Anchor layout itself is not resolved here: `LayoutSystem.flush()` runs before
 * component updates and only touches dirty nodes.
 */
export function syncUI(root: GameNode): void {
  function visit(node: GameNode): void {
    for (const component of node.components) {
      if (component instanceof SpriteRenderer || component instanceof TextRenderer ||
        component instanceof GraphicsRenderer || component instanceof Button) component.applyProperties();
    }
    node.children.forEach(visit);
  }
  visit(root);
}
