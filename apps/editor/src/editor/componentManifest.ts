import { builtInComponentDefinitions, type ComponentDefinition, type PropertyDefinition } from '@pxe/runtime';
import { createComponentData } from '@pxe/editor-core';

export type EditorComponentManifestItem = Omit<ComponentDefinition, 'ctor'> & {
  /** Project-relative source path, set only for user project components. */
  sourcePath?: string;
};

export function createComponentManifest(project: EditorComponentManifestItem[] = []): EditorComponentManifestItem[] {
  return [...builtInComponentDefinitions.map(({ ctor: _ctor, ...metadata }) => structuredClone(metadata)), ...structuredClone(project)];
}

export function getComponentDefinition(type: string, manifest = createComponentManifest()): EditorComponentManifestItem | undefined {
  return manifest.find((definition) => definition.type === type);
}

export function getPropertyDefault(definition: PropertyDefinition): unknown {
  if ('default' in definition) return structuredClone(definition.default);
  switch (definition.type) {
    case 'number': return undefined;
    case 'string': return '';
    case 'boolean': return false;
    case 'enum': return definition.values[0] ?? '';
    case 'color': return '#ffffff';
    case 'vec2': return { x: 0, y: 0 };
    default: return null;
  }
}

export function createManifestComponent(type: string, overrides: Record<string, unknown> = {}, manifest = createComponentManifest()) {
  const definition = getComponentDefinition(type, manifest);
  if (!definition) throw new Error(`Unknown component: ${type}`);
  const props = Object.fromEntries(Object.entries(definition.properties)
    .map(([key, property]) => [key, getPropertyDefault(property)])
    .filter(([, value]) => value !== undefined));
  return createComponentData(type, { ...props, ...overrides });
}

export const COMPONENT_DRAG_TYPE = 'application/x-pxe-component';
export const NODE_DRAG_TYPE = 'application/x-pxe-node';
/**
 * Payload of an asset dragged out of the Assets Browser. The value is the
 * project-relative asset path, resolved against the asset database on drop.
 */
export const ASSET_DRAG_TYPE = 'application/x-pxe-asset';
