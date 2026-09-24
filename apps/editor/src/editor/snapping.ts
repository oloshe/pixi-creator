import type { SnapSettings } from '@pxe/editor-core';

export interface SnapConfig extends SnapSettings {
  snapToGrid: boolean;
  gridSize: number;
}

export function snapValue(value: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return value;
  }

  return Math.round(value / step) * step;
}

/**
 * Whether position snapping is active.
 *
 * Holding Ctrl/Cmd inverts the decision: snapping on → temporarily off,
 * snapping off → temporarily on.
 */
function positionActive(config: SnapConfig, temporaryToggle: boolean): boolean {
  const active = config.enabled || config.snapToGrid;
  return temporaryToggle ? !active : active;
}

/** Position step: the explicit snap setting wins, otherwise the grid. */
export function positionStep(config: SnapConfig, temporaryToggle = false): number {
  if (!positionActive(config, temporaryToggle)) {
    return 0;
  }

  if (config.enabled && config.position > 0) {
    return config.position;
  }

  if (config.snapToGrid) {
    return config.gridSize;
  }

  return config.position > 0 ? config.position : 0;
}

export function snapPosition(value: number, config: SnapConfig, temporaryToggle = false): number {
  return snapValue(value, positionStep(config, temporaryToggle));
}

function rotationActive(config: SnapConfig, temporaryToggle: boolean): boolean {
  return temporaryToggle ? !config.enabled : config.enabled;
}

export function snapRotation(value: number, config: SnapConfig, temporaryToggle = false): number {
  return rotationActive(config, temporaryToggle) ? snapValue(value, config.rotation) : value;
}

export function snapScale(value: number, config: SnapConfig, temporaryToggle = false): number {
  return rotationActive(config, temporaryToggle) ? snapValue(value, config.scale) : value;
}
