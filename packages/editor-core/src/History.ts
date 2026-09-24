import type { Command } from './types';

export class History {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(command: Command): void {
    command.execute();

    const previous = this.undoStack.at(-1);
    if (previous?.merge?.(command)) {
      this.redoStack.length = 0;
      return;
    }

    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  undo(): void {
    const command = this.undoStack.pop();

    if (!command) {
      return;
    }

    command.undo();
    this.redoStack.push(command);
  }

  redo(): void {
    const command = this.redoStack.pop();

    if (!command) {
      return;
    }

    command.execute();
    this.undoStack.push(command);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
