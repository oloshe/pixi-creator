import { type Game, Button } from '@pxe/runtime';
import { parseSceneData, AssetManifestSchema } from '@pxe/schema';
import { mount } from '@pxe/player';

let game: Game | null = null;
let loading = false;
let ready = false;
let paused = false;
function log(message: string) { parent.postMessage({ type: 'pxe:log', message }, location.origin); }
window.addEventListener('error', (event) => log(`Error: ${event.message}`));
window.addEventListener('unhandledrejection', (event) => log(`Error: ${String(event.reason)}`));
window.addEventListener('message', (event) => {
  if (event.source !== parent || event.origin !== location.origin) return;
  if (event.data?.type === 'pxe:pause') {
    paused = Boolean(event.data.paused);
    if (ready && game) paused ? game.pause() : game.resume();
  }
  if (event.data?.type === 'pxe:safeArea' && ready && game) {
    game.setSafeArea(event.data.insets ?? {});
  }
  if (event.data?.type !== 'pxe:load' || loading) return;
  loading = true;
  paused = Boolean(event.data.paused);
  void (async () => {
    const scene = parseSceneData(event.data.scene);
    const assets = AssetManifestSchema.parse(event.data.assets);
    game = await mount(document.body, {
      scene, assets, modules: event.data.modules ?? [], componentTypes: event.data.componentTypes ?? [],
      reportWarning: (message) => {
        log(message);
        parent.postMessage({ type: 'pxe:warning', message }, location.origin);
      },
    });
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as unknown as { __pxeGame?: Game }).__pxeGame = game;
    }
    ready = true;
    // The runtime maps the design resolution onto this screen itself.
    game.screen.readCssSafeArea();
    game.resize(window.innerWidth, window.innerHeight);
    if (paused) game.pause();
    for (const component of game.scene.currentScene?.components ?? []) {
      if (component instanceof Button) component.on('click', () => log(`click · ${component.node.name}`));
    }
    const screen = game.screen;
    const design = `${Math.round(scene.settings.designWidth)}×${Math.round(scene.settings.designHeight)}`;
    log(`Playing ${scene.name} · design ${design} · scale ${screen.resolution.scaleX.toFixed(3)} · ${scene.settings.resizeMode}`);
  })().catch((error: unknown) => log(`Error: ${String(error)}`));
});
window.addEventListener('pagehide', () => { if (ready && game) { ready = false; game.destroy(); } });
document.addEventListener('visibilitychange', () => {
  if (ready && game) document.hidden || paused ? game.pause() : game.resume();
});
parent.postMessage({ type: 'pxe:ready' }, location.origin);
