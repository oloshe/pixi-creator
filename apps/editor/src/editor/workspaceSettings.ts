/**
 * Project-level editor UI preferences.
 *
 * Persisted to `.pxe/editor-settings.json` — the project's gitignored cache
 * directory, analogous in spirit to a VSCode `.vscode/settings.json`. Read-only
 * browser projects fall back to `localStorage` keyed by the project name.
 */

export const editorSettingsPath = '.pxe/editor-settings.json';

export interface EditorWorkspaceSettings {
  leftPanelWidth: number;
  rightPanelWidth: number;
}

export const defaultEditorWorkspaceSettings: EditorWorkspaceSettings = {
  leftPanelWidth: 290,
  rightPanelWidth: 350,
};

export const minPanelWidth = 180;
export const maxPanelWidth = 640;

export function clampPanelWidth(value: number): number {
  return Math.min(maxPanelWidth, Math.max(minPanelWidth, Math.round(value)));
}

export function parseEditorWorkspaceSettings(data: unknown): EditorWorkspaceSettings {
  const base = { ...defaultEditorWorkspaceSettings };

  if (!data || typeof data !== 'object') {
    return base;
  }

  const record = data as Record<string, unknown>;

  return {
    leftPanelWidth: typeof record.leftPanelWidth === 'number'
      ? clampPanelWidth(record.leftPanelWidth)
      : base.leftPanelWidth,
    rightPanelWidth: typeof record.rightPanelWidth === 'number'
      ? clampPanelWidth(record.rightPanelWidth)
      : base.rightPanelWidth,
  };
}

export function serializeEditorWorkspaceSettings(settings: EditorWorkspaceSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function storageKey(rootName: string): string {
  return `pxe:workspace:${rootName}`;
}

/** Read-only fallback when the project cannot be written to disk. */
export function readCachedWorkspaceSettings(rootName: string): EditorWorkspaceSettings {
  try {
    const text = window.localStorage.getItem(storageKey(rootName));
    return text ? parseEditorWorkspaceSettings(JSON.parse(text)) : { ...defaultEditorWorkspaceSettings };
  } catch {
    return { ...defaultEditorWorkspaceSettings };
  }
}

export function writeCachedWorkspaceSettings(rootName: string, settings: EditorWorkspaceSettings): void {
  try {
    window.localStorage.setItem(storageKey(rootName), JSON.stringify(settings));
  } catch {
    /* Best-effort. */
  }
}
