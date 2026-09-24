import { useEffect, useState } from 'react';
import { assetDatabasePath, defaultScenesDirName, projectConfigFileName } from '@pxe/schema';
import { detectHttpBackend } from '../lib/api';
import { useEditorStore } from '../editor/store';
import { useI18n } from '../i18n';

/**
 * Landing screen.
 *
 * The editor deliberately ships **no** default scene and opens **no** default
 * project: a scene is opened from `assets/scenes/` inside a project, or created
 * empty by the user. Under `pxe web` an explicit "Open Workspace" action opens
 * the CLI's current directory (with external-editor support); otherwise "Open
 * Project" uses the browser-native directory picker.
 */
export function StartScreen() {
  const { t } = useI18n();
  const store = useEditorStore;
  const project = store((state) => state.project);
  const assets = store((state) => state.assets);
  const status = store((state) => state.status);
  const busy = store((state) => state.busy);
  const openProject = store((state) => state.openProject);
  const openScene = store((state) => state.openScene);
  const newScene = store((state) => state.newScene);
  const refreshAssets = store((state) => state.refreshAssets);
  const closeProject = store((state) => state.closeProject);
  const [backend, setBackend] = useState(false);

  useEffect(() => {
    void detectHttpBackend().then(setBackend);
  }, []);

  const scenes = assets.filter((asset) => asset.type === 'scene');

  return (
    <div className="startScreen">
      <div className="startCard">
        <h1>Pixi Creator</h1>

        {!project ? (
          <>
            <p className="hint">
              {t('start.subtitle', { config: projectConfigFileName, assets: 'assets/', db: assetDatabasePath })}
            </p>
            <pre className="layoutPreview">{`project/
├── assets/
│   ├── textures/   audio/   fonts/
│   └── scenes/
├── src/components/
├── .pxe/asset-db.json
├── pxe.config.json
└── package.json`}</pre>
            <div className="startActions">
              <button type="button" className="primaryButton" disabled={busy} onClick={newScene}>{t('start.newScene')}</button>
              <button type="button" disabled={busy} onClick={() => void store.getState().openSceneJSON()}>{t('start.openSceneJSON')}</button>
              {backend && (
                <button
                  type="button"
                  className="primaryButton"
                  disabled={busy}
                  onClick={() => void store.getState().openCurrentWorkspace()}
                >
                  {t('start.openWorkspace')}
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => void openProject()}>
                {t('start.openProject')}
              </button>
            </div>
            <p className="hint">{t('start.scaffoldHint', { config: projectConfigFileName })}</p>
          </>
        ) : (
          <>
            <p className="hint">
              {t('start.projectOpen', { name: project.name, root: project.rootName, dir: `${project.assetsDir}/scenes/` })}
            </p>
            <div className="scenePicker">
              {scenes.map((scene) => (
                <button key={scene.id} type="button" className="sceneChoice" onClick={() => void openScene(scene.path)}>
                  <span>{scene.displayName}</span>
                  <span className="hint">{scene.path}</span>
                </button>
              ))}
              {scenes.length === 0 && (
                <p className="hint">{t('start.noScene', { dir: `${defaultScenesDirName}/` })}</p>
              )}
            </div>
            <div className="startActions">
              <button type="button" className="primaryButton" onClick={newScene}>{t('start.newScene')}</button>
              <button type="button" disabled={busy} onClick={() => void refreshAssets()}>{t('start.rescanAssets')}</button>
              <button type="button" disabled={busy} onClick={() => void openProject()}>{t('start.openAnother')}</button>
              <button type="button" onClick={closeProject}>{t('start.closeProject')}</button>
            </div>
          </>
        )}

        <p className="startStatus">{status}</p>
      </div>
    </div>
  );
}
