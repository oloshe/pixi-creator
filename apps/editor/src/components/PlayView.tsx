import type { CompiledModule } from '@pxe/runtime';
import { useEffect, useRef, useState } from 'react';
import type { AssetManifest, SceneData } from '@pxe/schema';
import { activeSession, useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';

interface PlayBundle {
  scene: SceneData;
  assets: AssetManifest;
  modules: CompiledModule[];
  componentTypes: string[];
}

/**
 * Play preview.
 *
 * The scene and the project's asset manifest are handed to the iframe through
 * `postMessage` — no `temp/current-scene.json` intermediate file. Assets travel
 * as `blob:` URLs created by the project session, which the same-origin iframe can
 * fetch directly.
 */
export function PlayView() {
  const frame = useRef<HTMLIFrameElement>(null);
  const document = useSceneDocument();
  const playState = useEditorStore((state) => state.playState);
  const assetManifest = useEditorStore((state) => state.assetManifest);
  const snapshot = useRef<PlayBundle | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const playStateRef = useRef(playState);
  playStateRef.current = playState;

  // Captured once on mount: Play runs a snapshot, edits during Play do not leak in.
  if (!snapshot.current && document) {
    snapshot.current = { scene: document.serialize(), assets: assetManifest, modules: activeSession()?.componentModules ?? [], componentTypes: activeSession()?.componentManifest.map((item) => item.type) ?? [] };
  }

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type === 'pxe:ready') {
        frame.current.contentWindow?.postMessage({ type: 'pxe:load', scene: snapshot.current?.scene,
          assets: snapshot.current?.assets, modules: snapshot.current?.modules, componentTypes: snapshot.current?.componentTypes, paused: playStateRef.current === 'paused' }, location.origin);
      }
      if (event.data?.type === 'pxe:warning') useEditorStore.getState().setStatus(String(event.data.message));
      if (event.data?.type === 'pxe:log') setLogs((previous) => [...previous.slice(-99), String(event.data.message)]);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'pxe:pause', paused: playState === 'paused' }, location.origin);
  }, [playState]);

  if (!document) {
    return null;
  }

  return <main className="playSurface">
    <iframe ref={frame} title="Game preview" src="./play.html" />
    <div className="playConsole" aria-label="Play console">{logs.map((log, index) => <p key={index}>{log}</p>)}</div>
  </main>;
}
