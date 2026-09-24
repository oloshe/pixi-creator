import type { AssetManifest, SceneData } from '@pxe/schema';
import type { CompiledModule } from '@pxe/runtime';

export function downloadJSON(name: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Escape user data so a scene name or script cannot close the HTML script tag. */
export function createEmbedSnippet(scene: SceneData, assets: AssetManifest, modules: CompiledModule[] = []): string {
  const options = JSON.stringify({ scene: 'scene.json', assets, ...(modules.length ? { modules } : {}),
    width: scene.settings.designWidth, height: scene.settings.designHeight }).replace(/</g, '\\u003c');
  return `<div id="scene"></div>\n<script src="./pxe-player.js"></script>\n<script>PxePlayer.mount('#scene', ${options}).catch(console.error);</script>`;
}
