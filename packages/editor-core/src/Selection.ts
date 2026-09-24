import type { SelectionState } from './types';

export class Selection {
  private state: SelectionState = {
    nodeIds: [],
    primaryNodeId: null,
  };

  get value(): SelectionState {
    return {
      nodeIds: [...this.state.nodeIds],
      primaryNodeId: this.state.primaryNodeId,
    };
  }

  select(nodeId: string | null): void {
    this.state = nodeId
      ? {
          nodeIds: [nodeId],
          primaryNodeId: nodeId,
        }
      : {
          nodeIds: [],
          primaryNodeId: null,
        };
  }

  restore(state: SelectionState): void {
    this.state = {
      nodeIds: [...state.nodeIds],
      primaryNodeId: state.primaryNodeId,
    };
  }
}
