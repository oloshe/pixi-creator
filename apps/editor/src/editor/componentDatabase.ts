import { normalizeProjectPath } from '@pxe/schema';
import { z } from 'zod';
import type { EditorComponentManifestItem } from './componentManifest';
import { isIgnoredPath, isInsideAssets } from './assetDatabase';

const propertySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), default: z.number().optional(), min: z.number().optional(), max: z.number().optional() }),
  z.object({ type: z.literal('string'), default: z.string().optional() }),
  z.object({ type: z.literal('boolean'), default: z.boolean().optional() }),
  z.object({ type: z.literal('color'), default: z.string().optional() }),
  z.object({ type: z.literal('enum'), values: z.array(z.string()).min(1), default: z.string().optional() }),
  z.object({ type: z.literal('vec2'), default: z.object({ x: z.number(), y: z.number() }).optional() }),
  z.object({ type: z.literal('asset'), assetType: z.string().optional(), default: z.object({ assetId: z.string() }).nullable().optional() }),
  z.object({ type: z.literal('nodeRef'), default: z.object({ nodeId: z.string() }).nullable().optional() }),
  z.object({ type: z.literal('componentRef'), componentType: z.string().optional(), default: z.object({ nodeId: z.string(), componentId: z.string() }).nullable().optional() }),
]);

/** Explicit whitelist: neither constructors nor arbitrary executable data survive. */
export const componentMetadataSchema = z.object({
  type: z.string().min(1).refine((type) => !type.startsWith('engine.'), 'Project types cannot use engine.*'),
  displayName: z.string().min(1), category: z.string().min(1), properties: z.record(propertySchema),
});
export interface ComponentRecord {
  id: string;
  path: string;
  metadata: EditorComponentManifestItem;
}
export interface ComponentDatabase { schemaVersion: 1; components: ComponentRecord[] }
export interface ComponentScan { sources: string[]; metadata: string[]; ignored: string[] }

export function scanComponentPaths(paths: Iterable<string>, sourceRoot = 'src'): ComponentScan {
  const scan: ComponentScan = { sources: [], metadata: [], ignored: [] };
  for (const path of [...new Set([...paths].map(normalizeProjectPath))].sort()) {
    if (!isInsideAssets(path, sourceRoot) || isIgnoredPath(path, sourceRoot)) continue;
    if (/\.component\.json$/i.test(path)) scan.metadata.push(path);
    else if (/\.[jt]s$/i.test(path) && !/\.d\.ts$/i.test(path)) scan.sources.push(path);
    else scan.ignored.push(path);
  }
  return scan;
}

export function parseComponentDatabase(data: unknown): ComponentDatabase {
  const result = z.object({ schemaVersion: z.literal(1), components: z.array(z.object({
    id: z.string(), path: z.string(), metadata: componentMetadataSchema,
  })) }).safeParse(data);
  return result.success ? result.data : { schemaVersion: 1, components: [] };
}

export function reconcileComponentDatabase(
  previous: ComponentDatabase,
  entries: { path: string; metadata: unknown }[],
): ComponentDatabase {
  const types = new Set<string>();
  const components = entries.map(({ path, metadata }) => {
    const parsed = componentMetadataSchema.parse(metadata);
    if (types.has(parsed.type)) throw new Error(`Duplicate component type: ${parsed.type}`);
    types.add(parsed.type);
    // Type is the durable identity: renaming a source file must not rename components.
    const id = previous.components.find((entry) => entry.metadata.type === parsed.type)?.id ?? `component:${parsed.type}`;
    return { id, path: normalizeProjectPath(path), metadata: parsed };
  }).sort((a, b) => a.metadata.type.localeCompare(b.metadata.type));
  return { schemaVersion: 1, components };
}

export function buildComponentManifest(database: ComponentDatabase): EditorComponentManifestItem[] {
  return database.components.map(({ path, metadata }) => ({ ...structuredClone(metadata), sourcePath: path }));
}
