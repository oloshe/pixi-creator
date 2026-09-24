import { useEffect, useState } from 'react';
import { Hierarchy } from './components/Hierarchy';
import { Inspector } from './components/Inspector';
import { SceneView } from './components/SceneView';
import { Toolbar } from './components/Toolbar';
import { PlayView } from './components/PlayView';
import { AssetsBrowser } from './components/AssetsBrowser';
import { MenuBar } from './components/MenuBar';
import { StartScreen } from './components/StartScreen';
import { Toaster } from './components/Toast';
import { useEditorStore } from './editor/store';
import { useI18n } from './i18n';
import { detectHttpBackend } from './lib/api';
import { clampPanelWidth, maxPanelWidth, minPanelWidth } from './editor/workspaceSettings';

/** A scene document can be edited independently or inside an optional workspace. */
export function App() {
  const document = useEditorStore((state) => state.document);

  // Under `pxe web` the workspace is the CLI's cwd; open it automatically so
  // `cd my-project && npx pxe web` lands directly in the editor with a real
  // `rootPath` (which external-editor launches and the file manager need).
  // Opening a *different* project still goes through the directory picker.
  useEffect(() => {
    void (async () => {
      if (await detectHttpBackend()) {
        await useEditorStore.getState().openCurrentWorkspace();
      }
    })();
  }, []);

  return (
    <>
      {!document ? <StartScreen /> : <EditorShell />}
      <Toaster />
    </>
  );
}

function EditorShell() {
  const { t } = useI18n();
  const status = useEditorStore((state) => state.status);
  const playState = useEditorStore((state) => state.playState);
  const camera = useEditorStore((state) => state.camera);
  const settings = useEditorStore((state) => state.document!.data.settings);
  const selection = useEditorStore((state) => state.selection);
  const sceneSelected = useEditorStore((state) => state.sceneSelected);
  const scenePath = useEditorStore((state) => state.scenePath);
  const leftPanelWidth = useEditorStore((state) => state.leftPanelWidth);
  const rightPanelWidth = useEditorStore((state) => state.rightPanelWidth);

  return (
    <div className="editorShell">
      <MenuBar />
      <Toolbar />
      <div className="workspace" style={{ gridTemplateColumns: `${leftPanelWidth}px 6px minmax(0, 1fr) 6px ${rightPanelWidth}px` }}>
        <LeftPanel />
        <PanelDivider side="left" />
        {playState === 'stopped' ? <SceneView /> : <PlayView />}
        <PanelDivider side="right" />
        <Inspector />
      </div>
      <footer className="bottomBar">
        <span>{status}</span>
        <span className="statusMeta">
          <span>{settings.designWidth} × {settings.designHeight}</span>
          <span>{Math.round(camera.zoom * 100)}%</span>
          <span>{sceneSelected ? t('status.sceneSelected') : selection.primaryNodeId ?? t('status.nothingSelected')}</span>
          <span title={scenePath ?? 'Unsaved scene'}>{scenePath ? t('status.savedFile') : t('status.unsaved')}</span>
          <span>{t('status.shortcuts')}</span>
        </span>
      </footer>
    </div>
  );
}

function LeftPanel() {
  const [tab, setTab] = useState<'hierarchy' | 'assets'>('hierarchy');
  const assetCount = useEditorStore((state) => state.assets.length);

  return (
    <div className="panel leftPanel">
      <div className="panelTabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'hierarchy'}
          className={tab === 'hierarchy' ? 'active' : ''}
          onClick={() => setTab('hierarchy')}
        >
          Hierarchy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'assets'}
          className={tab === 'assets' ? 'active' : ''}
          onClick={() => setTab('assets')}
        >
          Assets <span className="tabCount">{assetCount}</span>
        </button>
      </div>
      {tab === 'hierarchy' ? <Hierarchy /> : <AssetsBrowser />}
    </div>
  );
}

const DIVIDER_WIDTH = 6;
/** The scene viewport never collapses below this width, even with wide panels. */
const MIN_CENTER_WIDTH = 240;

/** Clamps a panel width so the two side panels always leave room for the scene. */
function panelLimit(containerWidth: number, otherPanelWidth: number): number {
  return Math.max(
    minPanelWidth,
    Math.min(maxPanelWidth, containerWidth - otherPanelWidth - DIVIDER_WIDTH * 2 - MIN_CENTER_WIDTH),
  );
}

/**
 * Drag handle between the sidebars and the scene view. Dragging updates the
 * matching panel width live; the value is persisted on release.
 */
function PanelDivider({ side }: { side: 'left' | 'right' }) {
  const setPanelWidth = useEditorStore((state) => state.setPanelWidth);
  const persistPanelWidths = useEditorStore((state) => state.persistPanelWidths);

  return (
    <div
      className={`panelDivider ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize left panel' : 'Resize right panel'}
      onPointerDown={(event) => {
        event.preventDefault();
        const workspace = event.currentTarget.parentElement;
        const containerWidth = workspace?.clientWidth ?? window.innerWidth;
        const startX = event.clientX;
        const state = useEditorStore.getState();
        const startWidth = side === 'left' ? state.leftPanelWidth : state.rightPanelWidth;
        const otherWidth = side === 'left' ? state.rightPanelWidth : state.leftPanelWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (moveEvent: PointerEvent) => {
          const delta = moveEvent.clientX - startX;
          const raw = side === 'left' ? startWidth + delta : startWidth - delta;
          const max = panelLimit(containerWidth, otherWidth);
          setPanelWidth(side, clampPanelWidth(Math.min(max, raw)));
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          void persistPanelWidths();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }}
    />
  );
}
