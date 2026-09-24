import { useEffect, useMemo, useRef } from 'react';
import { computeDevicePreview, getDevicePreset } from '../editor/devicePreview';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { designToScreen, deviceToScreen, screenToDevice } from '../editor/viewport';

const rulerSize = 20;
const labelSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/**
 * DOM overlay for the viewport: rulers (§30), artboard size label (§2) and the
 * device preview label (§15). Ruler coordinates follow the scene, not the
 * screen.
 */
export function ViewportOverlay() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const camera = useEditorStore((state) => state.camera);
  const viewportSize = useEditorStore((state) => state.viewportSize);
  const document = useSceneDocument();
  const view = useEditorStore((state) => state.meta.view);
  const deviceId = useEditorStore((state) => state.deviceId);
  const customDevice = useEditorStore((state) => state.customDevice);
  const settings = document?.data.settings;

  const device = useMemo(() => {
    const preset = getDevicePreset(deviceId);
    const resolved = preset.id === 'custom' ? { ...preset, ...customDevice } : preset;
    return settings ? computeDevicePreview(settings, resolved) : null;
  }, [deviceId, customDevice, settings]);

  const transform = device?.transform ?? { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const width = Math.max(1, Math.round(viewportSize.width));
    const height = Math.max(1, Math.round(viewportSize.height));
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    if (!view.showRulers) {
      return;
    }

    drawRuler(context, 'x', { width, height }, camera, transform, viewportSize);
    drawRuler(context, 'y', { width, height }, camera, transform, viewportSize);
  }, [camera, viewportSize, transform, view.showRulers]);

  if (!settings || !device) {
    return null;
  }

  const artboardCenter = designToScreen(camera, viewportSize, transform, settings.designWidth / 2, 0);
  const deviceLabel = device.active
    ? deviceToScreen(camera, viewportSize, 0, device.screenHeight)
    : null;

  return (
    <div className="viewportOverlay">
      <canvas ref={canvasRef} className="rulerCanvas" />
      <div className="artboardLabel" style={{ left: artboardCenter.x, top: Math.max(4, artboardCenter.y - 22) }}>
        {settings.designWidth} × {settings.designHeight}
      </div>
      {deviceLabel && (
        <div className="deviceLabel" style={{ left: deviceLabel.x, top: deviceLabel.y + 6 }}>
          {getDevicePreset(deviceId).label} · {settings.resizeMode}
        </div>
      )}
    </div>
  );
}

function drawRuler(
  context: CanvasRenderingContext2D,
  axis: 'x' | 'y',
  size: { width: number; height: number },
  camera: { x: number; y: number; zoom: number },
  transform: { scaleX: number; scaleY: number; offsetX: number; offsetY: number },
  viewportSize: { width: number; height: number },
): void {
  const scale = axis === 'x' ? transform.scaleX * camera.zoom : transform.scaleY * camera.zoom;
  const length = axis === 'x' ? size.width : size.height;

  if (scale <= 0) {
    return;
  }

  const start = axis === 'x'
    ? screenToDevice(camera, viewportSize, 0, 0).x
    : screenToDevice(camera, viewportSize, 0, 0).y;
  const end = axis === 'x'
    ? screenToDevice(camera, viewportSize, size.width, size.height).x
    : screenToDevice(camera, viewportSize, size.width, size.height).y;
  const designStart = axis === 'x'
    ? (start - transform.offsetX) / transform.scaleX
    : (start - transform.offsetY) / transform.scaleY;
  const designEnd = axis === 'x'
    ? (end - transform.offsetX) / transform.scaleX
    : (end - transform.offsetY) / transform.scaleY;

  const step = labelSteps.find((candidate) => candidate * scale >= 64) ?? labelSteps[labelSteps.length - 1]!;

  context.save();
  context.fillStyle = '#0b1120';
  if (axis === 'x') {
    context.fillRect(0, 0, size.width, rulerSize);
    context.strokeStyle = '#1e293b';
    context.beginPath();
    context.moveTo(0, rulerSize - 0.5);
    context.lineTo(size.width, rulerSize - 0.5);
    context.stroke();
  } else {
    context.fillRect(0, 0, rulerSize, size.height);
    context.strokeStyle = '#1e293b';
    context.beginPath();
    context.moveTo(rulerSize - 0.5, 0);
    context.lineTo(rulerSize - 0.5, size.height);
    context.stroke();
  }

  context.font = '10px ui-sans-serif, system-ui, sans-serif';
  context.fillStyle = '#94a3b8';
  context.strokeStyle = '#64748b';
  context.beginPath();

  const first = Math.floor(Math.min(designStart, designEnd) / step) * step;
  const last = Math.max(designStart, designEnd);

  for (let value = first, guard = 0; value <= last && guard < 2000; value += step, guard += 1) {
    const screen = axis === 'x'
      ? designToScreen(camera, viewportSize, transform, value, 0).x
      : designToScreen(camera, viewportSize, transform, 0, value).y;

    if (screen < (axis === 'x' ? -40 : -20) || screen > length + 40) {
      continue;
    }

    if (axis === 'x') {
      context.moveTo(screen, rulerSize - 7);
      context.lineTo(screen, rulerSize);
      context.fillText(formatTick(value), screen + 3, 10);
    } else {
      context.moveTo(rulerSize - 7, screen);
      context.lineTo(rulerSize, screen);
      context.save();
      context.translate(9, screen + 3);
      context.rotate(-Math.PI / 2);
      context.fillText(formatTick(value), 0, 0);
      context.restore();
    }
  }

  context.stroke();
  context.restore();
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
