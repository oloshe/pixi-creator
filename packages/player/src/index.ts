import * as runtime from '@pxe/runtime';
import { Game, builtInComponentDefinitions, evaluateComponentModules, type ComponentDefinition, type CompiledModule } from '@pxe/runtime';
import { AssetManifestSchema, parseSceneData, type AssetManifest, type SceneData, type SceneSettings } from '@pxe/schema';

export { Component, defineComponent, prop } from '@pxe/runtime';

export interface MountOptions {
  scene: SceneData | string;
  assets?: AssetManifest | string;
  width?: number;
  height?: number;
  resizeMode?: SceneSettings['resizeMode'];
  /** URL used for relative assets when scene is supplied as an object. */
  baseUrl?: string;
  components?: ComponentDefinition[];
  modules?: CompiledModule[] | string;
  componentTypes?: string[];
  reportWarning?: (message: string) => void;
}

export function resolveAssetManifest(manifest: AssetManifest, sceneUrl: string): AssetManifest {
  const parsed = AssetManifestSchema.parse(manifest);
  return { ...parsed, assets: parsed.assets.map((asset) => ({ ...asset, path: new URL(asset.path, sceneUrl).href })) };
}

async function readJSON(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  return response.json();
}

/** Standalone static player and editor Play use exactly the same host. */
export async function mount(target: string | HTMLElement, options: MountOptions): Promise<Game> {
  const host = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
  if (!host) throw new Error(`Player target not found: ${target}`);
  const sceneUrl = new URL(typeof options.scene === 'string' ? options.scene : options.baseUrl ?? document.baseURI, document.baseURI).href;
  const warn = options.reportWarning ?? console.warn;
  const scene = parseSceneData(typeof options.scene === 'string' ? await readJSON(sceneUrl) : options.scene, undefined, warn);
  if (options.resizeMode) scene.settings.resizeMode = options.resizeMode;
  const assetsInput = typeof options.assets === 'string'
    ? await readJSON(new URL(options.assets, sceneUrl).href) : options.assets ?? { schemaVersion: 2, assets: [], scenePreloads: {} };
  const assets = resolveAssetManifest(AssetManifestSchema.parse(assetsInput), sceneUrl);
  const modules = typeof options.modules === 'string'
    ? await readJSON(new URL(options.modules, sceneUrl).href) as CompiledModule[] : options.modules ?? [];
  const components = [...options.components ?? [], ...evaluateComponentModules(modules, runtime).map((item) => item.definition)];
  if (options.componentTypes) {
    const expected = new Set(options.componentTypes);
    const actual = new Set(components.map((item) => item.type));
    const mismatch = [...expected].filter((type) => !actual.has(type)).concat([...actual].filter((type) => !expected.has(type)));
    if (mismatch.length) warn(`Component metadata/runtime mismatch: ${mismatch.join(', ')}`);
  }
  const game = new Game();
  game.components.registerMany([...builtInComponentDefinitions, ...components]);
  const size = () => ({ width: options.width ?? (host.clientWidth || scene.settings.designWidth),
    height: options.height ?? (host.clientHeight || scene.settings.designHeight) });
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  try {
    await game.init({ canvas, ...size(), assets, scenes: { [scene.id]: scene }, startScene: scene.id, resizeToWindow: false });
  } catch (error) {
    if (game.app.renderer) game.destroy();
    canvas.remove();
    throw error;
  }
  const observer = new ResizeObserver(() => { const { width, height } = size(); game.resize(width, height); game.screen.readCssSafeArea(); });
  observer.observe(host);
  const destroy = game.destroy.bind(game);
  let destroyed = false;
  game.destroy = () => { if (destroyed) return; destroyed = true; observer.disconnect(); destroy(); };
  game.app.render();
  return game;
}
