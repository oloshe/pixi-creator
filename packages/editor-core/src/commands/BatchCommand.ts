import type { Command } from '../types';

export class BatchCommand implements Command {
  constructor(readonly label: string, private readonly commands: Command[]) {}
  execute(): void { this.commands.forEach((command) => command.execute()); }
  undo(): void { [...this.commands].reverse().forEach((command) => command.undo()); }
}
