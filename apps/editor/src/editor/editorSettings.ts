/**
 * Editor-level preferences (not project data): default external editor and an
 * optional custom launch command. Persisted to localStorage, best-effort like
 * the locale preference.
 */
export type EditorId = 'vscode' | 'zed' | 'sublime' | 'notepad' | 'custom';

export const DEFAULT_EDITOR: EditorId = 'vscode';

const EDITOR_STORAGE_KEY = 'pxe:editor';
const EDITOR_COMMAND_KEY = 'pxe:editor:command';

const editorIds: EditorId[] = ['vscode', 'zed', 'sublime', 'notepad', 'custom'];

export function isEditorId(value: string): value is EditorId {
  return (editorIds as string[]).includes(value);
}

export function readDefaultEditor(): EditorId {
  try {
    const value = window.localStorage.getItem(EDITOR_STORAGE_KEY);
    return value && isEditorId(value) ? value : DEFAULT_EDITOR;
  } catch {
    return DEFAULT_EDITOR;
  }
}

export function writeDefaultEditor(editor: EditorId): void {
  try {
    window.localStorage.setItem(EDITOR_STORAGE_KEY, editor);
  } catch {
    /* Best-effort. */
  }
}

export function readCustomCommand(): string {
  try {
    return window.localStorage.getItem(EDITOR_COMMAND_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeCustomCommand(command: string): void {
  try {
    window.localStorage.setItem(EDITOR_COMMAND_KEY, command);
  } catch {
    /* Best-effort. */
  }
}

export const editorLabels: Record<EditorId, string> = {
  vscode: 'VS Code',
  zed: 'Zed',
  sublime: 'Sublime Text',
  notepad: 'Notepad',
  custom: 'Custom',
};
