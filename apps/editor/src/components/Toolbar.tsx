import { useEffect } from 'react';
import { devicePresets } from '../editor/devicePreview';
import { useEditorStore, type EditorTool } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { useI18n } from '../i18n';
import { MoveIcon, PivotIcon, RotateIcon, ScaleIcon, SelectIcon } from './icons';

const tools: { id: EditorTool; hint: string; Icon: typeof SelectIcon }[] = [
  { id: 'select', hint: 'V', Icon: SelectIcon },
  { id: 'move', hint: 'W', Icon: MoveIcon },
  { id: 'rotate', hint: 'E', Icon: RotateIcon },
  { id: 'scale', hint: 'R', Icon: ScaleIcon },
  { id: 'pivot', hint: 'Y', Icon: PivotIcon },
];

export function Toolbar() {
  const store = useEditorStore;
  const { t } = useI18n();
  const document = useSceneDocument();
  const project = store((state) => state.project);
  const scenePath = store((state) => state.scenePath);
  const activeTool = store((state) => state.activeTool);
  const playState = store((state) => state.playState);
  const camera = store((state) => state.camera);
  const view = store((state) => state.meta.view);
  const deviceId = store((state) => state.deviceId);
  const customDevice = store((state) => state.customDevice);
  const setTool = store((state) => state.setTool);
  const refreshFromDocument = store((state) => state.refreshFromDocument);
  const setPlayState = store((state) => state.setPlayState);

  const state = () => useEditorStore.getState();

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey;

      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void state().saveScene();
        return;
      }

      const target = event.target;

      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) {
        return;
      }

      const current = state().document;

      if (!current) {
        return;
      }

      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) current.redo();
        else current.undo();
        refreshFromDocument('History updated');
        return;
      }

      if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        current.redo();
        refreshFromDocument('Redo');
        return;
      }

      if ((command && event.key.toLowerCase() === 'd') || event.key === 'Delete') {
        const id = current.selection.value.primaryNodeId;

        // The Canvas node (scene root) can never be deleted or duplicated.
        if (!id || id === current.data.root.id) {
          return;
        }

        event.preventDefault();

        if (event.key === 'Delete') {
          state().deleteNode(id);
        } else {
          state().duplicateNode(id);
        }
      }
    };

    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [refreshFromDocument]);

  return (
    <header className="topBar">
      <div className="toolbar">
        <div className="toolGroup" role="group" aria-label="Tools">
          {tools.map(({ id, hint, Icon }) => (
            <button
              key={id}
              type="button"
              title={`${t(`tool.${id}`)} (${hint})`}
              className={`toolButton ${activeTool === id ? 'active' : ''}`}
              aria-pressed={activeTool === id}
              onClick={() => setTool(id)}
            >
              <Icon size={16} />
              <span className="toolLabel">{t(`tool.${id}`)}</span>
            </button>
          ))}
        </div>

        <div className="toolGroup" role="group" aria-label="Play">
          <button
            type="button"
            className={playState !== 'stopped' ? 'active' : ''}
            onClick={() => setPlayState(playState === 'stopped' ? 'playing' : 'stopped')}
          >
            {playState === 'stopped' ? `▶ ${t('view.play')}` : `■ ${t('view.stop')}`}
          </button>
          {playState !== 'stopped' && (
            <button type="button" onClick={() => setPlayState(playState === 'paused' ? 'playing' : 'paused')}>
              {playState === 'paused' ? t('view.resume') : t('view.pause')}
            </button>
          )}
        </div>

        <div className="title">
          <span className="projectName" title={project ? `assets: ${project.assetsDir}${project.hasWriteAccess ? '' : ' (read-only)'}` : ''}>
            {project?.name ?? 'No project'}
          </span>
          <span className="sceneTitle" title={scenePath ?? 'Not saved to a file yet'}>
            {document?.data.name}{document?.dirty ? ' *' : ''}
          </span>
        </div>
      </div>

      <div className="viewportBar">
        <div className="toolGroup" role="group" aria-label="Zoom">
          <button type="button" className="square" onClick={() => state().zoomStep(-1)} title={t('view.zoomOut')}>−</button>
          <select
            aria-label="Zoom"
            className="zoomSelect"
            value=""
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) state().setZoom(value);
            }}
          >
            <option value="">{Math.round(camera.zoom * 100)}%</option>
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((value) => (
              <option key={value} value={value}>{Math.round(value * 100)}%</option>
            ))}
          </select>
          <button type="button" className="square" onClick={() => state().zoomStep(1)} title={t('view.zoomIn')}>+</button>
          <button type="button" onClick={() => state().fitCanvas()} title={t('view.fitCanvas')}>{t('view.fit')}</button>
          <button type="button" onClick={() => state().frameSelection()} title={t('view.frameSelected')}>{t('view.frame')}</button>
        </div>

        <div className="toolGroup" role="group" aria-label="Viewport display">
          <label className="inlineCheck">
            <input type="checkbox" checked={view.showGrid} onChange={(event) => state().updateView({ showGrid: event.target.checked })} />
            {t('view.grid')}
          </label>
          <label className="inlineCheck">
            <input type="checkbox" checked={view.showRulers} onChange={(event) => state().updateView({ showRulers: event.target.checked })} />
            {t('view.rulers')}
          </label>
          <label className="inlineCheck">
            <input type="checkbox" checked={view.snapToGrid} onChange={(event) => state().updateView({ snapToGrid: event.target.checked })} />
            {t('view.snapGrid')}
          </label>
          <label className="inlineCheck">
            <input type="checkbox" checked={view.showSafeArea} onChange={(event) => state().updateView({ showSafeArea: event.target.checked })} />
            {t('view.safeArea')}
          </label>
          <label className="inlineCheck">
            <input type="checkbox" checked={view.showOverflow} onChange={(event) => state().updateView({ showOverflow: event.target.checked })} />
            {t('view.showOverflow')}
          </label>
        </div>

        <div className="toolGroup">
          <label className="inlineField">
            {t('view.grid')}
            <input
              type="number"
              min={1}
              value={view.gridSize}
              onChange={(event) => state().updateView({ gridSize: Math.max(1, Number(event.target.value) || 1) })}
            />
          </label>
          <label className="inlineField">
            Major
            <input
              type="number"
              min={1}
              value={view.majorGrid}
              onChange={(event) => state().updateView({ majorGrid: Math.max(1, Number(event.target.value) || 1) })}
            />
          </label>
        </div>

        <div className="toolGroup">
          <label className="inlineCheck">
            <input type="checkbox" checked={view.snap.enabled} onChange={(event) => state().updateView({ snap: { ...view.snap, enabled: event.target.checked } })} />
            {t('view.snap')}
          </label>
          <label className="inlineField">
            {t('view.pos')}
            <input
              type="number"
              min={0}
              value={view.snap.position}
              onChange={(event) => state().updateView({ snap: { ...view.snap, position: Number(event.target.value) || 0 } })}
            />
          </label>
          <label className="inlineField">
            {t('view.rot')}
            <input
              type="number"
              min={0}
              value={view.snap.rotation}
              onChange={(event) => state().updateView({ snap: { ...view.snap, rotation: Number(event.target.value) || 0 } })}
            />
          </label>
          <label className="inlineField">
            {t('view.scale')}
            <input
              type="number"
              min={0}
              step="0.05"
              value={view.snap.scale}
              onChange={(event) => state().updateView({ snap: { ...view.snap, scale: Number(event.target.value) || 0 } })}
            />
          </label>
        </div>

        <div className="toolGroup">
          <label className="inlineField">
            {t('view.device')}
            <select value={deviceId} onChange={(event) => state().setDevice(event.target.value)}>
              {devicePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          {deviceId === 'custom' && (
            <>
              <input
                aria-label="Device width"
                className="tinyNumber"
                type="number"
                min={1}
                value={customDevice.width}
                onChange={(event) => state().setDevice('custom', { width: Math.max(1, Number(event.target.value) || 1) })}
              />
              <input
                aria-label="Device height"
                className="tinyNumber"
                type="number"
                min={1}
                value={customDevice.height}
                onChange={(event) => state().setDevice('custom', { height: Math.max(1, Number(event.target.value) || 1) })}
              />
            </>
          )}
          <label className="inlineField">
            {t('view.bg')}
            <select
              value={view.background}
              onChange={(event) => state().updateView({ background: event.target.value as typeof view.background })}
            >
              <option value="scene">{t('view.sceneColor')}</option>
              <option value="transparent">{t('view.transparent')}</option>
              <option value="black">{t('view.black')}</option>
              <option value="white">{t('view.white')}</option>
              <option value="custom">{t('view.custom')}</option>
            </select>
          </label>
          {view.background === 'custom' && (
            <input
              aria-label="Custom background"
              type="color"
              className="colorInput"
              value={view.customBackground}
              onChange={(event) => state().updateView({ customBackground: event.target.value })}
            />
          )}
        </div>
      </div>
    </header>
  );
}
