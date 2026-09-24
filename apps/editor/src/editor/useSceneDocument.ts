import type { SceneDocument } from '@pxe/editor-core';
import { useEditorStore } from './store';

/**
 * The open scene document, or `null` while no scene is open.
 *
 * `App` renders the start screen in that case, so panels inside the editor shell
 * can treat `null` as "not mounted" and return nothing.
 */
export function useSceneDocument(): SceneDocument | null {
  return useEditorStore((state) => state.document);
}
