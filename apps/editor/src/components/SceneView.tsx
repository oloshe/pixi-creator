import { useEffect, useMemo, useRef, useState } from 'react';
import { transformNode } from '../editor/transformActions';
import type { RectTransformData } from '@pxe/schema';
import { computeDevicePreview, getDevicePreset } from '../editor/devicePreview';
import { SceneViewRuntime } from '../editor/sceneViewport';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { ViewportOverlay } from './ViewportOverlay';

export function SceneView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneViewRuntime | null>(null);
  const [ready, setReady] = useState(false);

  const store = useEditorStore;
  const document = useSceneDocument();
  const meta = store((state) => state.meta);
  const revision = store((state) => state.revision);
  const selection = store((state) => state.selection);
  const sceneSelected = store((state) => state.sceneSelected);
  const view = store((state) => state.meta.view);
  const camera = store((state) => state.camera);
  const tool = store((state) => state.activeTool);
  const deviceId = store((state) => state.deviceId);
  const customDevice = store((state) => state.customDevice);
  const assetManifest = store((state) => state.assetManifest);
  const scenePath = store((state) => state.scenePath);

  const settings = document?.data.settings;
  const device = useMemo(() => {
    const preset = getDevicePreset(deviceId);
    const resolved = preset.id === 'custom' ? { ...preset, ...customDevice } : preset;
    return settings ? computeDevicePreview(settings, resolved) : null;
  }, [deviceId, customDevice, settings]);

  // Pixi runtime lifecycle.
  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return;
    }

    const state = () => useEditorStore.getState();
    const runtime = new SceneViewRuntime({
      onSelect: (nodeId) => {
        if (nodeId) state().selectNode(nodeId);
        else state().selectScene();
      },
      onCommitTransform: (nodeId, before: RectTransformData, after: RectTransformData) => {
        const current = state();
        if (current.document) transformNode(current.document, nodeId, before, after);
        current.refreshFromDocument('Transformed node');
      },
      onStatus: (status) => state().setStatus(status),
      onViewportResize: (size) => state().setViewportSize(size),
      onPan: (dx, dy) => state().pan(dx, dy),
      onWheelZoom: (anchor, factor) => state().zoomAtPoint(anchor, factor),
    });

    runtimeRef.current = runtime;
    let disposed = false;

    // Development hook: inspect the live Pixi preview from the console
    // (`window.__pxeSceneView.tree`), matching the store's `__pxeEditor` hook.
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as unknown as { __pxeSceneView?: SceneViewRuntime }).__pxeSceneView = runtime;
    }

    void runtime
      .init(host)
      .then(() => {
        if (disposed) {
          runtime.destroy();
          return;
        }

        const current = state();
        runtime.setAssetManifest(current.assetManifest);

        if (current.document) {
          runtime.setScene(current.document.data, (nodeId) => current.meta.nodeMeta(nodeId));
        }

        runtime.setView(current.meta.view);
        runtime.setCamera(current.camera);
        runtime.setTool(current.activeTool);
        setReady(true);
      })
      .catch((error: unknown) => {
        state().setStatus(`Renderer error: ${String(error)}`);
      });

    return () => {
      disposed = true;
      runtimeRef.current = null;
      runtime.destroy();
    };
  }, []);

  // New project / rescan: the manifest carries fresh blob URLs.
  useEffect(() => {
    if (!ready) return;
    runtimeRef.current?.setAssetManifest(assetManifest);
  }, [ready, assetManifest]);

  useEffect(() => {
    if (!ready || !document) return;
    runtimeRef.current?.setScene(document.data, (nodeId) => meta.nodeMeta(nodeId));
  }, [ready, document, revision, meta]);

  useEffect(() => {
    if (!ready) return;
    runtimeRef.current?.setSelection(sceneSelected ? null : selection.primaryNodeId);
  }, [ready, sceneSelected, selection.primaryNodeId, revision]);

  useEffect(() => {
    if (!ready) return;
    runtimeRef.current?.setView(view);
  }, [ready, view]);

  useEffect(() => {
    if (!ready || !device) return;
    runtimeRef.current?.setDevice(device);
  }, [ready, device]);

  useEffect(() => {
    if (!ready) return;
    runtimeRef.current?.setCamera(camera);
  }, [ready, camera]);

  useEffect(() => {
    if (!ready) return;
    runtimeRef.current?.setTool(tool);
  }, [ready, tool]);

  // Opening a scene always frames the artboard (§32) and keeps it framed while
  // the viewport settles, until the user moves the camera.
  const viewportWidth = store((state) => state.viewportSize.width);
  const viewportHeight = store((state) => state.viewportSize.height);
  const autoFit = store((state) => state.autoFit);

  useEffect(() => {
    if (!ready || !autoFit) {
      return;
    }

    useEditorStore.getState().fitCanvas();
  }, [ready, autoFit, viewportWidth, viewportHeight, scenePath, document?.data.id]);

  if (!document) {
    return null;
  }

  // Camera and view shortcuts (§27, §31).
  useEffect(() => {
    if (!ready) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) {
        return;
      }

      const state = useEditorStore.getState();

      if ((event.ctrlKey || event.metaKey) && event.key === "'") {
        event.preventDefault();
        state.updateView({ showGrid: !state.meta.view.showGrid });
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      switch (event.key) {
        case 'f':
        case 'F':
          event.preventDefault();
          if (event.shiftKey) state.frameAll();
          else state.frameSelection();
          break;
        case '1':
          event.preventDefault();
          state.setZoom(1);
          break;
        case '2':
          event.preventDefault();
          state.fitCanvas();
          break;
        case '3':
          event.preventDefault();
          state.frameSelection();
          break;
        case 'v':
        case 'V':
          state.setTool('select');
          break;
        case 'w':
        case 'W':
          state.setTool('move');
          break;
        case 'e':
        case 'E':
          state.setTool('rotate');
          break;
        case 'r':
        case 'R':
          state.setTool('scale');
          break;
        case 'y':
        case 'Y':
          state.setTool('pivot');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready]);

  return (
    <main className="sceneView">
      <div ref={hostRef} className="viewportHost" />
      <ViewportOverlay />
    </main>
  );
}
