import type { ComponentDefinition } from './ComponentRegistry';

export interface CompiledModule { path: string; code: string }

/** Used only in the metadata Worker and the Play host, never the editor document. */
export function evaluateComponentModules(modules: CompiledModule[], runtime: Record<string, unknown>) {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const byPath = new Map(modules.map((module) => [module.path, module.code]));
  const resolve = (from: string, request: string): string => {
    if (!request.startsWith('.')) throw new Error(`Unsupported import ${request} in ${from}. Use @pxe/runtime or relative source imports.`);
    const parts = from.split('/').slice(0, -1);
    for (const part of request.split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    const base = parts.join('/');
    const match = [base, `${base}.ts`, `${base}.js`, `${base}/index.ts`, `${base}/index.js`].find((path) => byPath.has(path));
    if (!match) throw new Error(`Cannot resolve ${request} in ${from}`);
    return match;
  };
  const load = (path: string): Record<string, unknown> => {
    const existing = cache.get(path);
    if (existing) return existing.exports;
    const module = { exports: {} };
    cache.set(path, module);
    const require = (request: string) => request === '@pxe/runtime' ? runtime : load(resolve(path, request));
    new Function('require', 'module', 'exports', `${byPath.get(path)}\n//# sourceURL=pxe-project/${path}`)(require, module, module.exports);
    return module.exports;
  };
  const definitions: { path: string; definition: ComponentDefinition }[] = [];
  const seen = new Set<unknown>();
  for (const { path } of modules) {
    const exports = load(path);
    const candidates = Array.isArray(exports.components) ? exports.components : exports.default ? [exports.default] : [];
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const definition = candidate as ComponentDefinition;
      if (!definition || typeof definition.type !== 'string' || typeof definition.ctor !== 'function') {
        throw new Error(`Invalid component export in ${path}`);
      }
      if (definitions.some((item) => item.definition.type === definition.type)) {
        throw new Error(`Duplicate component type: ${definition.type}`);
      }
      definitions.push({ path, definition });
    }
  }
  return definitions;
}
