import { BatchCommand, SetComponentPropertyCommand, SetNodeTransformCommand, type Command, type SceneDocument } from '@pxe/editor-core';
import type { RectTransformData } from '@pxe/schema';
import { findNode } from './find';
import { getAnchorSettings, nodeRect } from './previewLayout';

/** Keep an anchored transform edit by updating its layout margins in the same undo step. */
export function transformNode(document: SceneDocument, nodeId: string, before: RectTransformData, after: RectTransformData): void {
  if (nodeId === document.data.root.id) return;
  const node = findNode(document.data.root, nodeId);
  if (!node) return;
  const anchor = getAnchorSettings(node);
  const component = node.components.find((item) => item.type === 'engine.UIAnchor' && item.enabled);
  const commands: Command[] = [new SetNodeTransformCommand(document.data.root, nodeId, after)];
  if (anchor && component) {
    const a = nodeRect(before);
    const b = nodeRect(after);
    const patch: Record<string, number> = {};
    if (anchor.anchorLeft) patch.left = anchor.left + b.x - a.x;
    if (anchor.anchorRight) patch.right = anchor.right - (b.x + b.width - a.x - a.width);
    if (!anchor.anchorLeft && !anchor.anchorRight && anchor.centerX) patch.offsetX = anchor.offsetX + b.x + b.width / 2 - a.x - a.width / 2;
    if (anchor.anchorTop) patch.top = anchor.top + b.y - a.y;
    if (anchor.anchorBottom) patch.bottom = anchor.bottom - (b.y + b.height - a.y - a.height);
    if (!anchor.anchorTop && !anchor.anchorBottom && anchor.centerY) patch.offsetY = anchor.offsetY + b.y + b.height / 2 - a.y - a.height / 2;
    for (const [key, value] of Object.entries(patch)) {
      commands.push(new SetComponentPropertyCommand(document.data.root, component.id, `props.${key}`, value));
    }
  }
  document.execute(new BatchCommand('Transform node', commands));
}
