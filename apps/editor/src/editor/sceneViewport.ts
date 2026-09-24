import { pivotWithCompensation } from '@pxe/editor-core';
import {
  Application,
  Container,
  Graphics,
  type FederatedPointerEvent,
} from 'pixi.js';
import type { AssetManifest, NodeData, RectTransformData, SceneData, SceneSettings } from '@pxe/schema';
import {
  createBuiltInRendererRegistry,
  nullAssetResolver,
  ScenePreviewTree,
  type RenderContext,
  type ResolutionInfo,
} from '@pxe/rendering';
import type { EditorCameraState, EditorViewPreferences } from '@pxe/editor-core';
import { LocalProjectAssetResolver } from './assetResolver';
import type { DevicePreviewResult } from './devicePreview';
import {
  axisVectors,
  axisScaleRatio,
  GIZMO_AXIS_LENGTH,
  GIZMO_CENTER_RADIUS,
  GIZMO_HIT_TOLERANCE,
  GIZMO_ROTATE_RADIUS,
  pointToSegmentDistance,
  projectOntoAxis,
  ringHit,
  uniformScaleRatio,
  type GizmoHandle,
  type Vector2,
} from './gizmo';
import { collectGuides, measureSpacing, snapRectToGuides, type GuideLine } from './guides';
import { layoutPreview, nodeRect } from './previewLayout';
import { positionStep, snapRotation, snapScale, snapValue, type SnapConfig } from './snapping';
import { designToScreen, screenToDesign, type DeviceTransform, type Rect, type ViewportSize } from './viewport';

export type EditorTool = 'select' | 'move' | 'rotate' | 'scale' | 'pivot';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const canvasCorners: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const edgeHandles: ResizeHandle[] = ['n', 'e', 's', 'w'];
const handleScreenSize = 9;
const handleHitRadius = 8;
const pivotHitRadius = 11;
const guideThresholdScreen = 6;
const dimSpan = 20000;

interface DragState {
  kind: 'move' | 'rotate' | 'scale' | 'pivot' | 'resize' | 'pan';
  nodeId: string | null;
  handle?: ResizeHandle;
  /** Tool gizmo that started this drag (move axis / rotate ring / scale axis). */
  gizmo?: GizmoHandle;
  startGlobal: { x: number; y: number };
  startLocal: { x: number; y: number };
  before: RectTransformData;
  after: RectTransformData;
}

export interface SceneViewCallbacks {
  onSelect(nodeId: string | null): void;
  onCommitTransform(nodeId: string, before: RectTransformData, after: RectTransformData): void;
  onStatus(status: string): void;
  onViewportResize(size: ViewportSize): void;
  onPan(deltaX: number, deltaY: number): void;
  onWheelZoom(anchor: { x: number; y: number }, factor: number): void;
}

export interface NodeEditorState {
  locked: boolean;
  editorVisible: boolean;
}

const defaultNodeEditorState: NodeEditorState = { locked: false, editorVisible: true };

/**
 * Editor viewport.
 *
 * ```
 * Editor Viewport
 * ├── camera            (viewport camera — never the scene's own scale)
 * │   ├── grid          (design space, infinite workspace)
 * │   ├── device frame  (device space)
 * │   └── designLayer   (design → device transform)
 * │       ├── artboard background
 * │       ├── scenePreviewRoot  ← ScenePreviewTree, the shared renderers
 * │       ├── overflow dimming
 * │       └── safe area
 * └── overlay           (screen space: selection box, pivot, gizmos, guides)
 * ```
 *
 * Scene *content* is drawn exclusively by the shared `@pxe/rendering` renderers
 * through `ScenePreviewTree`; this class owns only the editor-only layers
 * (workspace, camera, grid, guides, selection, gizmos) and never writes back into
 * `SceneData`.
 */
export class SceneViewRuntime {
  app = new Application();

  private readonly registry = createBuiltInRendererRegistry();
  /** Design root that owns the previewed scene; the tree creates its children. */
  private readonly scenePreviewRoot = new Container();
  /** Exposed for debugging/automation through `window.__pxeSceneView`. */
  readonly tree = new ScenePreviewTree(this.registry, this.scenePreviewRoot);
  private resolver: LocalProjectAssetResolver | null = null;

  private readonly cameraContainer = new Container();
  private readonly designLayer = new Container();
  private readonly gridLayer = new Graphics();
  private readonly artboardBackground = new Graphics();
  private readonly clipMask = new Graphics();
  private readonly overflowDim = new Graphics();
  private readonly safeAreaLayer = new Graphics();
  private readonly deviceFrame = new Graphics();
  private readonly overlay = new Graphics();

  private scene: SceneData | null = null;
  private preview: NodeData | null = null;
  private view: EditorViewPreferences | null = null;
  private device: DevicePreviewResult | null = null;
  private camera: EditorCameraState = { x: 0, y: 0, zoom: 1 };
  private viewportSize: ViewportSize = { width: 1, height: 1 };
  private tool: EditorTool = 'select';
  private selection: string | null = null;
  private nodeState: (nodeId: string) => NodeEditorState = () => defaultNodeEditorState;
  private draft: { nodeId: string; transform: RectTransformData } | null = null;

  private drag: DragState | null = null;
  private guides: GuideLine[] = [];
  private spacing: string | null = null;
  private spacePanning = false;
  private initialized = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly callbacks: SceneViewCallbacks) {}

  async init(host: HTMLDivElement): Promise<void> {
    await this.app.init({ background: '#2b2b2b', resizeTo: host, antialias: true });
    host.appendChild(this.app.canvas);
    this.initialized = true;

    // The grid lives in design space (scene coordinates); the device frame is
    // painted on top of the scene so contain letterboxing and cover cropping are
    // visible exactly where the runtime would cut content.
    this.cameraContainer.addChild(this.designLayer, this.deviceFrame);
    this.designLayer.addChild(
      this.gridLayer,
      this.artboardBackground,
      this.scenePreviewRoot,
      this.clipMask,
      this.overflowDim,
      this.safeAreaLayer,
    );
    this.clipMask.visible = false;
    this.overflowDim.visible = false;
    this.app.stage.addChild(this.cameraContainer, this.overlay);

    this.viewportSize = { width: this.app.screen.width, height: this.app.screen.height };
    this.callbacks.onViewportResize(this.viewportSize);

    // Pixi's `resizeTo` only reacts to *window* resizes. Panel-dragging changes
    // the host size without resizing the window, which would leave the renderer
    // at its old resolution while CSS stretches the canvas (the "stretched
    // scene" bug). Observe the host directly so the renderer always matches.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        // `app.resize()` re-reads `resizeTo`'s clientWidth/Height and emits the
        // renderer 'resize' event handled below.
        this.app.resize();
      });
      this.resizeObserver.observe(host);
    }

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.bindEvents();
    this.app.renderer.on('resize', () => {
      const size = { width: this.app.screen.width, height: this.app.screen.height };
      this.viewportSize = size;
      this.app.stage.hitArea = this.app.screen;
      this.callbacks.onViewportResize(size);
      this.redraw();
    });
  }

  get ready(): boolean {
    return this.initialized;
  }

  destroy(): void {
    this.unbindEvents();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.tree.destroy();

    if (this.initialized) {
      this.app.destroy(true, { children: true });
    }

    this.initialized = false;
  }

  setScene(scene: SceneData, nodeState: (nodeId: string) => NodeEditorState): void {
    this.scene = scene;
    this.nodeState = nodeState;
    this.applyScene();
  }

  /**
   * Points the preview at the project's asset database.
   *
   * Called again after a rescan: the manifest carries fresh `blob:` URLs, so the
   * scene is re-applied and textures that changed on disk are re-fetched.
   */
  setAssetManifest(manifest: AssetManifest): void {
    this.resolver = new LocalProjectAssetResolver(manifest);
    this.applyScene();
  }

  setSelection(nodeId: string | null): void {
    this.selection = nodeId;
    this.redraw();
  }

  setView(view: EditorViewPreferences): void {
    this.view = view;
    this.redraw();
  }

  setDevice(device: DevicePreviewResult): void {
    this.device = device;
    this.redraw();
  }

  setCamera(camera: EditorCameraState): void {
    this.camera = camera;
    this.redraw();
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.redraw();
  }

  /* ------------------------------------------------------------------ */
  /* Scene rendering                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Incremental sync.
   *
   * The preview tree reuses Pixi objects: moving a node re-applies one transform,
   * editing a text colour updates one `PIXI.Text`. A full destroy/rebuild only
   * happens when a node or component genuinely disappears.
   */
  private applyScene(): void {
    if (!this.scene) {
      return;
    }

    this.preview = layoutPreview(this.scene.root);
    this.tree.sync(this.preview, {
      mode: 'editor',
      assets: this.resolver ?? nullAssetResolver,
      resolution: this.resolutionInfo(),
      nodeState: (nodeId) => this.nodeState(nodeId),
      requestRender: this.requestRender,
      reportWarning: (message) => this.callbacks.onStatus(message),
    });

    this.redraw();
  }

  /** Renderers call this after an async texture/font load lands. */
  private readonly requestRender = (): void => this.redraw();

  private resolutionInfo(): ResolutionInfo {
    const settings = this.scene?.settings;

    return {
      designWidth: settings?.designWidth ?? 0,
      designHeight: settings?.designHeight ?? 0,
      screenWidth: this.device?.screenWidth ?? this.viewportSize.width,
      screenHeight: this.device?.screenHeight ?? this.viewportSize.height,
    };
  }

  /** Mode and assets shared by every renderer of this viewport. */
  private renderContext(transform: RectTransformData): RenderContext {
    return {
      mode: 'editor',
      assets: this.resolver ?? nullAssetResolver,
      resolution: this.resolutionInfo(),
      transform,
      requestRender: this.requestRender,
      reportWarning: (message) => this.callbacks.onStatus(message),
    };
  }

  private nodeVisible(nodeId: string): boolean {
    const node = this.preview ? findNode(this.preview, nodeId) : null;

    if (!node) {
      return true;
    }

    return node.active && node.transform.visible && this.nodeState(nodeId).editorVisible;
  }


  /* ------------------------------------------------------------------ */
  /* Overlays                                                            */
  /* ------------------------------------------------------------------ */

  private redraw(): void {
    if (!this.initialized || !this.scene) {
      return;
    }

    const device = this.deviceTransform();
    this.cameraContainer.position.set(
      this.viewportSize.width / 2 - this.camera.x * this.camera.zoom,
      this.viewportSize.height / 2 - this.camera.y * this.camera.zoom,
    );
    this.cameraContainer.scale.set(this.camera.zoom);
    this.designLayer.position.set(device.offsetX, device.offsetY);
    this.designLayer.scale.set(device.scaleX, device.scaleY);

    this.drawArtboard();
    this.drawGrid();
    this.drawDeviceFrame();
    this.drawSafeArea();
    this.drawOverlay();
  }

  private drawArtboard(): void {
    const settings = this.scene!.settings;
    const color = this.backgroundFill(settings);
    this.artboardBackground.clear();

    if (color) {
      this.artboardBackground.rect(0, 0, settings.designWidth, settings.designHeight).fill(color);
    }

    this.clipMask.clear();
    this.overflowDim.clear();

    if (!settings.clipContent) {
      this.clipMask.visible = false;
      this.overflowDim.visible = false;
      this.scenePreviewRoot.mask = null;
      return;
    }

    this.clipMask.rect(0, 0, settings.designWidth, settings.designHeight).fill(0xffffff);

    if (this.view?.showOverflow) {
      // Show overflowing content, dimmed, so it stays editable.
      this.clipMask.visible = false;
      this.scenePreviewRoot.mask = null;
      this.dimOutside(this.overflowDim, settings.designWidth, settings.designHeight);
      this.overflowDim.visible = true;
    } else {
      this.clipMask.visible = true;
      this.scenePreviewRoot.mask = this.clipMask;
      this.overflowDim.visible = false;
    }
  }

  private backgroundFill(settings: SceneSettings): string | null {
    switch (this.view?.background) {
      case 'black':
        return '#000000';
      case 'white':
        return '#ffffff';
      case 'custom':
        return this.view.customBackground;
      case 'transparent':
        return null;
      case 'scene':
      default:
        return settings.backgroundColor;
    }
  }

  private dimOutside(graphics: Graphics, width: number, height: number): void {
    const dim = { color: 0x000000, alpha: 0.55 };
    graphics.rect(-dimSpan, -dimSpan, width + dimSpan * 2, dimSpan).fill(dim);
    graphics.rect(-dimSpan, height, width + dimSpan * 2, dimSpan).fill(dim);
    graphics.rect(-dimSpan, 0, dimSpan, height).fill(dim);
    graphics.rect(width, 0, dimSpan, height).fill(dim);
  }

  private drawGrid(): void {
    const grid = this.gridLayer;
    grid.clear();

    if (!this.view?.showGrid || !this.scene) {
      return;
    }

    const designScale = this.designScale();
    const visible = this.visibleDesignRect();
    const lineWidth = 1 / designScale;

    if (this.view.majorGrid * designScale >= 6) {
      drawGridLines(grid, visible, this.view.majorGrid, 0x64748b, 0.5, lineWidth);
    }

    if (this.view.gridSize * designScale >= 6) {
      drawGridLines(grid, visible, this.view.gridSize, 0x475569, 0.3, lineWidth);
    }
  }

  /**
   * Device preview mask (§16).
   *
   * Everything the simulated runtime would not show is dimmed, so contain
   * letterboxing, cover cropping and the extra fixed-width area are visible at
   * a glance. The bright region is exactly `screen ∩ design viewport`.
   */
  private drawDeviceFrame(): void {
    const graphics = this.deviceFrame;
    graphics.clear();

    if (!this.device?.active || !this.scene) {
      return;
    }

    const width = this.device.screenWidth;
    const height = this.device.screenHeight;
    const lineWidth = 1 / this.camera.zoom;
    const transform = this.device.transform;
    const viewportWidth = this.scene.settings.designWidth * transform.scaleX;
    const viewportHeight = this.scene.settings.designHeight * transform.scaleY;

    const left = Math.max(0, transform.offsetX);
    const top = Math.max(0, transform.offsetY);
    const right = Math.min(width, transform.offsetX + viewportWidth);
    const bottom = Math.min(height, transform.offsetY + viewportHeight);

    const span = dimSpan;
    graphics
      .rect(-span, -span, width + span * 2, height + span * 2)
      .fill({ color: 0x000000, alpha: 0.72 });

    if (right > left && bottom > top) {
      graphics.rect(left, top, right - left, bottom - top).cut();
    }

    graphics.rect(0, 0, width, height).stroke({ color: 0x94a3b8, width: lineWidth, alignment: 0.5 });
  }

  private drawSafeArea(): void {
    const graphics = this.safeAreaLayer;
    graphics.clear();

    if (!this.view?.showSafeArea || !this.scene) {
      return;
    }

    const settings = this.scene.settings;
    const lineWidth = 1 / Math.max(this.designScale(), 0.0001);
    const insets = this.view.safeArea;
    const width = settings.designWidth;
    const height = settings.designHeight;
    const innerHeight = Math.max(0, height - insets.top - insets.bottom);
    const innerWidth = Math.max(0, width - insets.left - insets.right);

    for (const band of [
      { x: 0, y: 0, width, height: insets.top },
      { x: 0, y: height - insets.bottom, width, height: insets.bottom },
      { x: 0, y: insets.top, width: insets.left, height: innerHeight },
      { x: width - insets.right, y: insets.top, width: insets.right, height: innerHeight },
    ]) {
      if (band.width > 0 && band.height > 0) {
        graphics.rect(band.x, band.y, band.width, band.height).fill({ color: 0x0891b2, alpha: 0.22 });
      }
    }

    graphics
      .rect(insets.left, insets.top, innerWidth, innerHeight)
      .stroke({ color: 0x22d3ee, width: lineWidth, alpha: 0.95 });
  }

  private drawOverlay(): void {
    const graphics = this.overlay;
    graphics.clear();

    if (!this.scene) {
      return;
    }

    const settings = this.scene.settings;
    const artboard = this.designRectToScreen({ x: 0, y: 0, width: settings.designWidth, height: settings.designHeight });
    graphics
      .rect(artboard.x, artboard.y, artboard.width, artboard.height)
      .stroke({ color: 0x38bdf8, width: 1.5, alpha: 0.85 });

    const node = this.selectedNode();

    if (node) {
      const corners = this.nodeCornersScreen(node.id);

      if (corners) {
        graphics
          .poly(canvasCorners.flatMap((handle) => [corners[handle].x, corners[handle].y]))
          .stroke({ color: 0x7dd3fc, width: 1.5 });

        for (const handle of canvasCorners) {
          if (this.isLocked(node.id)) break;
          if (edgeHandles.includes(handle) && this.tool === 'move') {
            continue;
          }

          const point = corners[handle];
          graphics
            .rect(point.x - handleScreenSize / 2, point.y - handleScreenSize / 2, handleScreenSize, handleScreenSize)
            .fill(0x0f172a)
            .stroke({ color: 0x7dd3fc, width: 1.5 });
        }
      }

      const pivot = this.pivotScreen(node.id);

      if (pivot) {
        graphics.circle(pivot.x, pivot.y, 6).fill(0x0f172a).stroke({ color: 0xf472b6, width: 2 });
        graphics.moveTo(pivot.x - 11, pivot.y).lineTo(pivot.x + 11, pivot.y).stroke({ color: 0xf472b6, width: 1 });
        graphics.moveTo(pivot.x, pivot.y - 11).lineTo(pivot.x, pivot.y + 11).stroke({ color: 0xf472b6, width: 1 });
      }

      if (pivot && !this.isLocked(node.id)) {
        this.drawToolGizmo(graphics, node.id, pivot);
      }
    }

    for (const guide of this.guides) {
      const from = Math.min(guide.from, guide.to) - 40;
      const to = Math.max(guide.from, guide.to) + 40;
      const start = guide.axis === 'x'
        ? this.designPointToScreen(guide.snapped, from)
        : this.designPointToScreen(from, guide.snapped);
      const end = guide.axis === 'x'
        ? this.designPointToScreen(guide.snapped, to)
        : this.designPointToScreen(to, guide.snapped);
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y)
        .stroke({ color: guide.kind === 'center' ? 0xf472b6 : 0xfacc15, width: 1 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Transform gizmos                                                    */
  /* ------------------------------------------------------------------ */

  /** Screen-space unit directions of a node's local X/Y axes. */
  private nodeAxesScreen(nodeId: string): { x: Vector2; y: Vector2 } | null {
    const container = this.tree.containerOf(nodeId);

    if (!container) {
      return null;
    }

    const origin = container.toGlobal({ x: 0, y: 0 });
    const xEnd = container.toGlobal({ x: 1, y: 0 });
    const yEnd = container.toGlobal({ x: 0, y: 1 });
    const xLen = Math.hypot(xEnd.x - origin.x, xEnd.y - origin.y) || 1;
    const yLen = Math.hypot(yEnd.x - origin.x, yEnd.y - origin.y) || 1;

    return {
      x: { x: (xEnd.x - origin.x) / xLen, y: (xEnd.y - origin.y) / xLen },
      y: { x: (yEnd.x - origin.x) / yLen, y: (yEnd.y - origin.y) / yLen },
    };
  }

  private drawToolGizmo(graphics: Graphics, nodeId: string, pivot: Vector2): void {
    const axes = this.nodeAxesScreen(nodeId);

    if (!axes) {
      return;
    }

    if (this.tool === 'move') {
      const xEnd = { x: pivot.x + axes.x.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.x.y * GIZMO_AXIS_LENGTH };
      const yEnd = { x: pivot.x + axes.y.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.y.y * GIZMO_AXIS_LENGTH };
      this.drawGizmoArrow(graphics, pivot, xEnd, 0xff3b30);
      this.drawGizmoArrow(graphics, pivot, yEnd, 0x34c759);
      this.drawGizmoCenter(graphics, pivot, 0xffffff);
    } else if (this.tool === 'rotate') {
      graphics.circle(pivot.x, pivot.y, GIZMO_ROTATE_RADIUS).stroke({ color: 0x22d3ee, width: 1.5 });
      const handle = { x: pivot.x + axes.x.x * GIZMO_ROTATE_RADIUS, y: pivot.y + axes.x.y * GIZMO_ROTATE_RADIUS };
      graphics.circle(handle.x, handle.y, 3.5).fill(0x22d3ee);
    } else if (this.tool === 'scale') {
      const xEnd = { x: pivot.x + axes.x.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.x.y * GIZMO_AXIS_LENGTH };
      const yEnd = { x: pivot.x + axes.y.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.y.y * GIZMO_AXIS_LENGTH };
      this.drawGizmoArrow(graphics, pivot, xEnd, 0xff3b30);
      this.drawGizmoArrow(graphics, pivot, yEnd, 0x34c759);
      this.drawGizmoSquare(graphics, xEnd, 0xff3b30);
      this.drawGizmoSquare(graphics, yEnd, 0x34c759);
      this.drawGizmoCenter(graphics, pivot, 0xfacc15);
    }
  }

  private drawGizmoArrow(graphics: Graphics, from: Vector2, to: Vector2, color: number): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const size = 7;

    graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color, width: 2 });
    graphics
      .poly([
        to.x, to.y,
        to.x - ux * size + px * size * 0.5, to.y - uy * size + py * size * 0.5,
        to.x - ux * size - px * size * 0.5, to.y - uy * size - py * size * 0.5,
      ])
      .fill(color);
  }

  private drawGizmoSquare(graphics: Graphics, at: Vector2, color: number): void {
    graphics.rect(at.x - 4, at.y - 4, 8, 8).fill(0x0f172a).stroke({ color, width: 1.5 });
  }

  private drawGizmoCenter(graphics: Graphics, at: Vector2, color: number): void {
    graphics.rect(at.x - 5, at.y - 5, 10, 10).fill(0x0f172a).stroke({ color, width: 1.5 });
  }

  private hitTestGizmo(nodeId: string, point: Vector2): GizmoHandle | null {
    const pivot = this.pivotScreen(nodeId);

    if (!pivot) {
      return null;
    }

    const axes = this.nodeAxesScreen(nodeId);

    if (!axes) {
      return null;
    }

    if (this.tool === 'move') {
      if (distance(point, pivot) <= GIZMO_CENTER_RADIUS) return 'move-center';
      const xEnd = { x: pivot.x + axes.x.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.x.y * GIZMO_AXIS_LENGTH };
      const yEnd = { x: pivot.x + axes.y.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.y.y * GIZMO_AXIS_LENGTH };
      if (pointToSegmentDistance(point, pivot, xEnd) <= GIZMO_HIT_TOLERANCE) return 'move-x';
      if (pointToSegmentDistance(point, pivot, yEnd) <= GIZMO_HIT_TOLERANCE) return 'move-y';
      return null;
    }

    if (this.tool === 'rotate') {
      return ringHit(point, pivot, GIZMO_ROTATE_RADIUS) ? 'rotate-ring' : null;
    }

    if (this.tool === 'scale') {
      if (distance(point, pivot) <= GIZMO_CENTER_RADIUS) return 'scale-uniform';
      const xEnd = { x: pivot.x + axes.x.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.x.y * GIZMO_AXIS_LENGTH };
      const yEnd = { x: pivot.x + axes.y.x * GIZMO_AXIS_LENGTH, y: pivot.y + axes.y.y * GIZMO_AXIS_LENGTH };
      if (distance(point, xEnd) <= GIZMO_HIT_TOLERANCE) return 'scale-x';
      if (distance(point, yEnd) <= GIZMO_HIT_TOLERANCE) return 'scale-y';
      return null;
    }

    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Coordinate helpers                                                  */
  /* ------------------------------------------------------------------ */

  private deviceTransform(): DeviceTransform {
    return this.device?.transform ?? { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  }

  private designScale(): number {
    const device = this.deviceTransform();
    return Math.max(0.0001, device.scaleX * this.camera.zoom);
  }

  private visibleDesignRect(): Rect {
    const topLeft = this.screenToDesignPoint({ x: 0, y: 0 });
    const bottomRight = this.screenToDesignPoint({ x: this.viewportSize.width, y: this.viewportSize.height });

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  private screenToDesignPoint(point: { x: number; y: number }): { x: number; y: number } {
    return screenToDesign(this.camera, this.viewportSize, this.deviceTransform(), point.x, point.y);
  }

  private designPointToScreen(x: number, y: number): { x: number; y: number } {
    return designToScreen(this.camera, this.viewportSize, this.deviceTransform(), x, y);
  }

  private designRectToScreen(rect: Rect): Rect {
    const topLeft = this.designPointToScreen(rect.x, rect.y);
    const bottomRight = this.designPointToScreen(rect.x + rect.width, rect.y + rect.height);

    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  private nodeCornersScreen(nodeId: string): Record<ResizeHandle, { x: number; y: number }> | null {
    const node = this.findPreviewNode(nodeId);
    const container = this.tree.containerOf(nodeId);

    if (!node || !container) {
      return null;
    }

    const width = node.transform.width;
    const height = node.transform.height;
    const toScreen = (x: number, y: number) => container.toGlobal({ x, y });

    return {
      nw: toScreen(0, 0),
      n: toScreen(width / 2, 0),
      ne: toScreen(width, 0),
      e: toScreen(width, height / 2),
      se: toScreen(width, height),
      s: toScreen(width / 2, height),
      sw: toScreen(0, height),
      w: toScreen(0, height / 2),
    };
  }

  private pivotScreen(nodeId: string): { x: number; y: number } | null {
    const node = this.findPreviewNode(nodeId);
    const container = this.tree.containerOf(nodeId);

    if (!node || !container) {
      return null;
    }

    return container.toGlobal({
      x: node.transform.pivotX,
      y: node.transform.pivotY,
    });
  }

  private findPreviewNode(nodeId: string): NodeData | null {
    if (!this.preview) {
      return null;
    }

    const node = findNode(this.preview, nodeId);

    if (!node) {
      return null;
    }

    // Live drag feedback: overlays follow the draft transform, not the document.
    if (this.draft?.nodeId === nodeId) {
      return { ...node, transform: this.draft.transform };
    }

    return node;
  }

  private selectedNode(): NodeData | null {
    return this.selection ? this.findPreviewNode(this.selection) : null;
  }

  /* ------------------------------------------------------------------ */
  /* Interaction                                                         */
  /* ------------------------------------------------------------------ */

  private bindEvents(): void {
    this.app.stage.on('pointerdown', this.onPointerDown);
    this.app.stage.on('pointermove', this.onPointerMove);
    this.app.stage.on('pointerup', this.onPointerUp);
    this.app.stage.on('pointerupoutside', this.onPointerUp);
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.app.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private unbindEvents(): void {
    this.app.stage?.off('pointerdown', this.onPointerDown);
    this.app.stage?.off('pointermove', this.onPointerMove);
    this.app.stage?.off('pointerup', this.onPointerUp);
    this.app.stage?.off('pointerupoutside', this.onPointerUp);
    this.app.canvas?.removeEventListener('wheel', this.onWheel);
    this.app.canvas?.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private readonly onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.spacePanning = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      this.spacePanning = false;
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();

    // Shift + wheel pans horizontally instead of zooming (a trackpad reports the
    // horizontal gesture in `deltaX`, a physical wheel in `deltaY`).
    if (event.shiftKey) {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      this.callbacks.onPan(delta, 0);
      return;
    }

    const rect = this.app.canvas.getBoundingClientRect();
    this.callbacks.onWheelZoom(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      Math.exp(-event.deltaY * 0.0015),
    );
  };

  private onPointerDown = (event: FederatedPointerEvent): void => {
    if (!this.scene || !this.preview) {
      return;
    }

    const global = { x: event.global.x, y: event.global.y };
    const button = (event.nativeEvent as MouseEvent | undefined)?.button ?? 0;

    if (button === 1 || button === 2 || this.spacePanning) {
      this.drag = {
        kind: 'pan',
        nodeId: null,
        startGlobal: global,
        startLocal: global,
        before: emptyTransform(),
        after: emptyTransform(),
      };
      return;
    }

    const selected = this.selectedNode();

    if (selected && this.tool === 'pivot' && !this.isLocked(selected.id)) {
      const pivot = this.pivotScreen(selected.id);

      if (pivot && distance(pivot, global) <= pivotHitRadius) {
        this.startDrag('pivot', selected, global);
        return;
      }
    }

    if (selected && this.tool === 'select' && !this.isLocked(selected.id)) {
      const handle = this.hitHandle(selected.id, global);

      if (handle) {
        this.startDrag('resize', selected, global, handle);
        return;
      }
    }

    // Cocos-style gizmos: axis handles / rotation ring win over the node rect.
    if (selected && !this.isLocked(selected.id) && ['move', 'rotate', 'scale'].includes(this.tool)) {
      const gizmo = this.hitTestGizmo(selected.id, global);

      if (gizmo) {
        this.startDrag(this.tool as 'move' | 'rotate' | 'scale', selected, global, undefined, gizmo);
        return;
      }
    }

    // A selected empty container can be transformed through its rectangle.
    // Unselected groups still do not intercept ordinary selection clicks.
    if (selected && !this.isLocked(selected.id) && ['move', 'rotate', 'scale'].includes(this.tool)) {
      const container = this.tree.containerOf(selected.id);
      const point = container?.toLocal(global);
      if (point && point.x >= 0 && point.y >= 0 && point.x <= selected.transform.width && point.y <= selected.transform.height) {
        this.startDrag(this.tool as 'move' | 'rotate' | 'scale', selected, global);
        return;
      }
    }

    const hit = this.hitTest(global);

    if (hit !== this.selection) {
      this.callbacks.onSelect(hit);
    }

    if (!hit || this.isLocked(hit)) {
      return;
    }

    const node = this.findPreviewNode(hit);

    if (!node) {
      return;
    }

    if (this.tool === 'move' || this.tool === 'rotate' || this.tool === 'scale') {
      this.startDrag(this.tool, node, global);
    } else if (this.tool === 'select') {
      this.startDrag('move', node, global);
    }
  };

  private onPointerMove = (event: FederatedPointerEvent): void => {
    const drag = this.drag;

    if (!drag) {
      return;
    }

    const global = { x: event.global.x, y: event.global.y };

    if (drag.kind === 'pan') {
      this.callbacks.onPan(global.x - drag.startGlobal.x, global.y - drag.startGlobal.y);
      drag.startGlobal = global;
      return;
    }

    if (!drag.nodeId || !this.preview) {
      return;
    }

    const container = this.tree.containerOf(drag.nodeId);
    const parentContainer = container?.parent;
    const node = findNode(this.preview, drag.nodeId);

    if (!container || !parentContainer || !node) {
      return;
    }

    // Work in the parent's local space so parent rotation / scale is respected.
    const local = parentContainer.toLocal(global);
    const temporaryToggle = event.ctrlKey || event.metaKey;
    const next: RectTransformData = { ...drag.before };
    this.guides = [];
    this.spacing = null;

    if (drag.kind === 'move') {
      if (drag.gizmo === 'move-x' || drag.gizmo === 'move-y') {
        const axes = axisVectors(drag.before.rotationDeg);
        const axis = drag.gizmo === 'move-x' ? axes.x : axes.y;
        const delta = { x: local.x - drag.startLocal.x, y: local.y - drag.startLocal.y };
        const projection = projectOntoAxis(delta, axis);
        const step = positionStep(this.snapConfig(), temporaryToggle);
        const snapped = step > 0 ? snapValue(projection, step) : projection;
        next.x = drag.before.x + snapped * axis.x;
        next.y = drag.before.y + snapped * axis.y;
      } else {
        next.x = drag.before.x + (local.x - drag.startLocal.x);
        next.y = drag.before.y + (local.y - drag.startLocal.y);
        this.applyMoveGuides(drag.nodeId, next, temporaryToggle);
      }
    } else if (drag.kind === 'rotate') {
      const pivot = { x: drag.before.x, y: drag.before.y };
      const startAngle = Math.atan2(drag.startLocal.y - pivot.y, drag.startLocal.x - pivot.x);
      const angle = Math.atan2(local.y - pivot.y, local.x - pivot.x);
      next.rotationDeg = snapRotation(
        drag.before.rotationDeg + ((angle - startAngle) * 180) / Math.PI,
        this.snapConfig(),
        temporaryToggle,
      );
    } else if (drag.kind === 'scale') {
      if (drag.gizmo === 'scale-x' || drag.gizmo === 'scale-y') {
        const axes = axisVectors(drag.before.rotationDeg);
        const axis = drag.gizmo === 'scale-x' ? axes.x : axes.y;
        const ratio = axisScaleRatio({ x: drag.before.x, y: drag.before.y }, drag.startLocal, local, axis);
        if (drag.gizmo === 'scale-x') {
          next.scaleX = snapScale(drag.before.scaleX * ratio, this.snapConfig(), temporaryToggle);
        } else {
          next.scaleY = snapScale(drag.before.scaleY * ratio, this.snapConfig(), temporaryToggle);
        }
      } else {
        const factor = uniformScaleRatio({ x: drag.before.x, y: drag.before.y }, drag.startLocal, local);
        next.scaleX = snapScale(drag.before.scaleX * factor, this.snapConfig(), temporaryToggle);
        next.scaleY = snapScale(drag.before.scaleY * factor, this.snapConfig(), temporaryToggle);
      }
    } else if (drag.kind === 'resize' && drag.handle) {
      Object.assign(next, resizeTransform(drag.before, drag.handle, local, this.snapConfig(), temporaryToggle));
    } else if (drag.kind === 'pivot') {
      const before = drag.before;
      const angle = before.rotationDeg * Math.PI / 180;
      const dx = local.x - before.x;
      const dy = local.y - before.y;
      if (before.scaleX !== 0 && before.scaleY !== 0) {
        const pivotX = clamp(before.pivotX + (Math.cos(angle) * dx + Math.sin(angle) * dy) / before.scaleX, 0, before.width);
        const pivotY = clamp(before.pivotY + (-Math.sin(angle) * dx + Math.cos(angle) * dy) / before.scaleY, 0, before.height);
        Object.assign(next, pivotWithCompensation(before, pivotX, pivotY));
      }
    }

    drag.after = next;
    this.draft = { nodeId: drag.nodeId, transform: next };

    // Live feedback goes through the same preview node the committed state uses,
    // so a drag and a settled transform can never render differently.
    const previewNode = this.tree.nodes.get(drag.nodeId);

    if (previewNode) {
      const draftNode: NodeData = { ...node, transform: next };
      previewNode.syncTransform(next, this.nodeVisible(drag.nodeId));
      previewNode.syncRenderers(draftNode.components, this.renderContext(next), this.registry);
    }

    this.redraw();

    if (this.spacing) {
      this.callbacks.onStatus(this.spacing);
    }
  };

  private onPointerUp = (): void => {
    const drag = this.drag;
    this.drag = null;
    this.guides = [];
    this.draft = null;

    if (!drag || drag.kind === 'pan' || !drag.nodeId) {
      this.redraw();
      return;
    }

    const changed = JSON.stringify(drag.before) !== JSON.stringify(drag.after);

    if (changed) {
      this.callbacks.onCommitTransform(drag.nodeId, drag.before, drag.after);
    } else {
      this.applyScene();
    }

    this.redraw();
  };

  private startDrag(
    kind: DragState['kind'],
    node: NodeData,
    global: { x: number; y: number },
    handle?: ResizeHandle,
    gizmo?: GizmoHandle,
  ): void {
    const container = this.tree.containerOf(node.id);
    const parentContainer = container?.parent;

    if (!container || !parentContainer) {
      return;
    }

    this.drag = {
      kind,
      nodeId: node.id,
      handle,
      gizmo,
      startGlobal: global,
      startLocal: parentContainer.toLocal(global),
      before: { ...node.transform },
      after: { ...node.transform },
    };
  }

  /** Edge / center smart guides plus snapping while moving. */
  private applyMoveGuides(nodeId: string, next: RectTransformData, temporaryToggle: boolean): void {
    if (!this.preview) {
      return;
    }

    const parentId = this.tree.parentOf(nodeId);
    const parent = parentId ? findNode(this.preview, parentId) : null;
    const rect = nodeRect(next);
    const siblings = (parent?.children ?? [])
      .filter((child) => child.id !== nodeId)
      .map((child) => nodeRect(child.transform));
    const parentRect: Rect = {
      x: 0,
      y: 0,
      width: parent?.transform.width ?? this.scene?.settings.designWidth ?? 0,
      height: parent?.transform.height ?? this.scene?.settings.designHeight ?? 0,
    };

    const threshold = guideThresholdScreen / this.designScale();
    const result = snapRectToGuides(rect, collectGuides(parentRect, siblings, rect), threshold);
    const step = positionStep(this.snapConfig(), temporaryToggle);
    const snapped: Rect = step > 0
      ? { ...result.rect, x: snapValue(result.rect.x, step), y: snapValue(result.rect.y, step) }
      : result.rect;

    this.guides = result.lines;

    if (snapped.x !== rect.x || snapped.y !== rect.y) {
      const effectivePivotX = next.scaleX < 0 ? next.width - next.pivotX : next.pivotX;
      const effectivePivotY = next.scaleY < 0 ? next.height - next.pivotY : next.pivotY;
      next.x = snapped.x + effectivePivotX * Math.abs(next.scaleX);
      next.y = snapped.y + effectivePivotY * Math.abs(next.scaleY);
    }

    const spacing = measureSpacing(snapped, siblings);

    if (spacing.length > 0) {
      const nearest = spacing.reduce((best, item) => (item.gap < best.gap ? item : best));
      this.spacing = `gap ${nearest.gap.toFixed(1)}px · ${nearest.axis.toUpperCase()}`;
    }
  }

  private snapConfig(): SnapConfig {
    return {
      enabled: this.view?.snap.enabled ?? false,
      position: this.view?.snap.position ?? 10,
      rotation: this.view?.snap.rotation ?? 15,
      scale: this.view?.snap.scale ?? 0.1,
      snapToGrid: this.view?.snapToGrid ?? false,
      gridSize: this.view?.gridSize ?? 10,
    };
  }

  private isLocked(nodeId: string): boolean {
    return nodeId === this.scene?.root.id || this.nodeState(nodeId).locked;
  }

  private hitHandle(nodeId: string, point: { x: number; y: number }): ResizeHandle | null {
    const corners = this.nodeCornersScreen(nodeId);

    if (!corners) {
      return null;
    }

    for (const handle of canvasCorners) {
      if (distance(corners[handle], point) <= handleHitRadius) {
        return handle;
      }
    }

    return null;
  }

  /**
   * Picks the topmost node with rendered content under the pointer.
   *
   * Group nodes without their own renderer are intentionally not pickable —
   * otherwise a group covering the whole canvas would swallow every click.
   * Clicking empty artboard space selects the Canvas (design-space root).
   */
  private hitTest(point: { x: number; y: number }): string | null {
    if (!this.preview) {
      return null;
    }

    const order = [...collectNodes(this.preview)].reverse();

    for (const node of order) {
      const previewNode = this.tree.nodes.get(node.id);
      const state = this.nodeState(node.id);

      if (!previewNode || previewNode.renderers.size === 0 || state.locked || state.editorVisible === false) {
        continue;
      }

      if (!isVisible(previewNode.container)) {
        continue;
      }

      for (const renderer of previewNode.renderers.values()) {
        if (renderer.displayObject.getBounds().containsPoint(point.x, point.y)) {
          return node.id;
        }
      }
    }

    return this.artboardContains(point) ? this.preview.id : null;
  }

  private artboardContains(point: { x: number; y: number }): boolean {
    if (!this.scene) {
      return false;
    }

    const design = this.screenToDesignPoint(point);
    return design.x >= 0
      && design.y >= 0
      && design.x <= this.scene.settings.designWidth
      && design.y <= this.scene.settings.designHeight;
  }
}

function drawGridLines(
  graphics: Graphics,
  visible: Rect,
  step: number,
  color: number,
  alpha: number,
  lineWidth: number,
): void {
  const startX = Math.floor(visible.x / step) * step;
  const startY = Math.floor(visible.y / step) * step;
  const endX = visible.x + visible.width;
  const endY = visible.y + visible.height;

  for (let x = startX, guard = 0; x <= endX && guard < 3000; x += step, guard += 1) {
    graphics.moveTo(x, visible.y).lineTo(x, endY);
  }

  for (let y = startY, guard = 0; y <= endY && guard < 3000; y += step, guard += 1) {
    graphics.moveTo(visible.x, y).lineTo(endX, y);
  }

  graphics.stroke({ color, alpha, width: lineWidth });
}

function resizeTransform(
  before: RectTransformData,
  handle: ResizeHandle,
  point: { x: number; y: number },
  config: SnapConfig,
  temporaryToggle: boolean,
): RectTransformData {
  const rect = nodeRect(before);
  const magnitudeX = Math.abs(before.scaleX) || 1;
  const magnitudeY = Math.abs(before.scaleY) || 1;
  const step = positionStep(config, temporaryToggle);
  const x = step > 0 ? snapValue(point.x, step) : point.x;
  const y = step > 0 ? snapValue(point.y, step) : point.y;

  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle.includes('w')) left = Math.min(x, right - 1);
  if (handle.includes('e')) right = Math.max(x, left + 1);
  if (handle.includes('n')) top = Math.min(y, bottom - 1);
  if (handle.includes('s')) bottom = Math.max(y, top + 1);

  const nextWidth = Math.max(1, (right - left) / magnitudeX);
  const nextHeight = Math.max(1, (bottom - top) / magnitudeY);
  const effectivePivotX = before.scaleX < 0 ? nextWidth - before.pivotX : before.pivotX;
  const effectivePivotY = before.scaleY < 0 ? nextHeight - before.pivotY : before.pivotY;

  return {
    ...before,
    width: nextWidth,
    height: nextHeight,
    x: left + effectivePivotX * magnitudeX,
    y: top + effectivePivotY * magnitudeY,
  };
}

function collectNodes(root: NodeData): NodeData[] {
  return [root, ...root.children.flatMap(collectNodes)];
}

function findNode(root: NodeData, nodeId: string): NodeData | null {
  if (root.id === nodeId) {
    return root;
  }

  for (const child of root.children) {
    const found = findNode(child, nodeId);

    if (found) {
      return found;
    }
  }

  return null;
}

function isVisible(container: Container): boolean {
  for (let current: Container | null = container; current; current = current.parent) {
    if (!current.visible) {
      return false;
    }
  }

  return true;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function emptyTransform(): RectTransformData {
  return {
    x: 0, y: 0, width: 0, height: 0, pivotX: 0, pivotY: 0,
    scaleX: 1, scaleY: 1, rotationDeg: 0, alpha: 1, visible: true,
  };
}
