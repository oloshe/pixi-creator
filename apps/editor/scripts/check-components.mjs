import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { transform } from 'sucrase';

const workspace = fileURLToPath(new URL('../../../', import.meta.url));
const project = resolve(process.argv[2] ?? resolve(workspace, 'examples/demo-project'));
const server = await createServer({ root: workspace, configFile: false, server: { middlewareMode: true },
  ssr: { noExternal: ['@pxe/schema', '@pxe/runtime'] } });
try {
  const runtime = await server.ssrLoadModule('/packages/runtime/src/component-api.ts');
  const { parseProjectConfig } = await server.ssrLoadModule('/packages/schema/src/index.ts');
  const { isIgnoredPath } = await server.ssrLoadModule('/apps/editor/src/editor/assetDatabase.ts');
  const { scanComponentPaths, componentMetadataSchema } = await server.ssrLoadModule('/apps/editor/src/editor/componentDatabase.ts');
  const config = parseProjectConfig(JSON.parse(await readFile(resolve(project, 'pxe.config.json'), 'utf8')));
  const paths = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const path = relative(project, absolute).replaceAll('\\', '/');
      if (isIgnoredPath(path, config.components)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else paths.push(path);
    }
  }
  await walk(resolve(project, config.components));
  const scan = scanComponentPaths(paths, config.components);
  const modules = await Promise.all(scan.sources.map(async (path) => ({ path,
    code: transform(await readFile(resolve(project, path), 'utf8'), { transforms: ['typescript', 'imports'], filePath: path }).code,
  })));
  const definitions = runtime.evaluateComponentModules(modules, runtime);
  for (const path of scan.metadata) {
    const metadata = componentMetadataSchema.parse(JSON.parse(await readFile(resolve(project, path), 'utf8')));
    const source = definitions.find(({ definition }) => definition.type === metadata.type);
    if (!source || JSON.stringify(componentMetadataSchema.parse(source.definition)) !== JSON.stringify(metadata)) {
      throw new Error(`Metadata/runtime mismatch: ${path} (${metadata.type})`);
    }
  }
  console.log(`Validated ${definitions.length} runtime component(s), ${scan.metadata.length} metadata file(s) in ${project}`);
} finally { await server.close(); }
