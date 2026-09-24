import { SetSceneNameCommand } from '@pxe/editor-core';
import { matchResolutionPreset, resolutionPresets } from '@pxe/schema';
import type { ResizeMode, SceneOrientation } from '@pxe/schema';
import { useEditorStore } from '../editor/store';
import { useSceneDocument } from '../editor/useSceneDocument';
import { useI18n } from '../i18n';
import { NumberInput } from './NumberInput';

const resizeModes: ResizeMode[] = ['contain', 'cover', 'fixed-width', 'fixed-height', 'stretch'];
const orientations: SceneOrientation[] = ['portrait', 'landscape', 'any'];

const resizeLabels: Record<ResizeMode, string> = {
  contain: 'Contain',
  cover: 'Cover',
  'fixed-width': 'Fixed Width',
  'fixed-height': 'Fixed Height',
  stretch: 'Stretch',
};

/** Scene Settings inspector, shown when the Scene row is selected (§4, §5). */
export function SceneSettingsInspector() {
  const { t } = useI18n();
  const store = useEditorStore;
  const document = useSceneDocument();
  const updateSceneSettings = store((state) => state.updateSceneSettings);

  if (!document) {
    return null;
  }

  const settings = document.data.settings;
  const preset = matchResolutionPreset(settings.designWidth, settings.designHeight);

  return (
    <aside className="panel inspector">
      <div className="panelHeader">{t('sceneSettings.title')}</div>

      <section className="inspectorSection">
        <h2>{t('sceneSettings.canvas')}</h2>
        <div className="fieldGrid">
          <label>
            {t('inspector.width')}
            <NumberInput
              min={1}
              value={settings.designWidth}
              onChange={(value) => updateSceneSettings({ designWidth: Math.max(1, Math.round(value)) })}
            />
          </label>
          <label>
            {t('inspector.height')}
            <NumberInput
              min={1}
              value={settings.designHeight}
              onChange={(value) => updateSceneSettings({ designHeight: Math.max(1, Math.round(value)) })}
            />
          </label>
        </div>

        <label>
          {t('sceneSettings.preset')}
          <select
            value={preset ? `${preset.width}x${preset.height}` : 'custom'}
            onChange={(event) => {
              if (event.target.value === 'custom') return;
              const [width, height] = event.target.value.split('x').map(Number);
              updateSceneSettings({ designWidth: width, designHeight: height });
            }}
          >
            {!preset && <option value="custom">{t('view.custom')}</option>}
            {resolutionPresets.map((item) => (
              <option key={item.label} value={`${item.width}x${item.height}`}>{item.label}</option>
            ))}
            {preset && <option value="custom">{t('view.custom')}</option>}
          </select>
        </label>

        <label>
          {t('sceneSettings.background')}
          <input
            type="color"
            value={settings.backgroundColor}
            onChange={(event) => updateSceneSettings({ backgroundColor: event.target.value })}
          />
        </label>

        <label>
          {t('sceneSettings.resizeMode')}
          <select value={settings.resizeMode} onChange={(event) => updateSceneSettings({ resizeMode: event.target.value as ResizeMode })}>
            {resizeModes.map((mode) => <option key={mode} value={mode}>{resizeLabels[mode]}</option>)}
          </select>
        </label>

        <label>
          {t('sceneSettings.orientation')}
          <select value={settings.orientation} onChange={(event) => updateSceneSettings({ orientation: event.target.value as SceneOrientation })}>
            {orientations.map((orientation) => <option key={orientation} value={orientation}>{orientation}</option>)}
          </select>
        </label>

        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={settings.clipContent}
            onChange={(event) => updateSceneSettings({ clipContent: event.target.checked })}
          />
          {t('sceneSettings.clipContent')}
        </label>

        <p className="hint">{t('sceneSettings.clipHint')}</p>
      </section>

      <section className="inspectorSection">
        <h2>{t('sceneSettings.scene')}</h2>
        <label>
          {t('inspector.name')}
          <input
            value={document.data.name}
            onChange={(event) => {
              document.execute(new SetSceneNameCommand(document.data, event.target.value));
              useEditorStore.getState().refreshFromDocument('Scene renamed');
            }}
          />
        </label>
        <label>
          {t('sceneSettings.id')}
          <input readOnly value={document.data.id} />
        </label>
      </section>
    </aside>
  );
}
