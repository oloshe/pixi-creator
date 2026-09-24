import type { BLEND_MODES } from 'pixi.js';

/**
 * Blend modes the engine exposes as component data.
 *
 * The names are the engine's own vocabulary; `toBlendMode` maps them onto Pixi's
 * blend strings so the mapping exists once instead of in each renderer.
 */
export const BlendModes = ['normal', 'add', 'multiply', 'screen'] as const;

export type BlendMode = (typeof BlendModes)[number];

const pixiBlendModes: Record<BlendMode, BLEND_MODES> = {
  normal: 'normal',
  add: 'add',
  multiply: 'multiply',
  screen: 'screen',
};

export function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && (BlendModes as readonly string[]).includes(value);
}

export function toBlendMode(value: unknown, fallback: BlendMode = 'normal'): BLEND_MODES {
  return pixiBlendModes[isBlendMode(value) ? value : fallback];
}

/**
 * Colours travel through the engine as CSS strings (`#rrggbb`, `rgba(...)`, named
 * colours) because that is what Pixi accepts directly on `tint`, `fill` and
 * `TextStyle`. This normalises a value that came from component data.
 */
export function toColor(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  return fallback;
}

export function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function toStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isAssetRef(value: unknown): value is { assetId: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'assetId' in value &&
      typeof (value as { assetId: unknown }).assetId === 'string' &&
      (value as { assetId: string }).assetId !== '',
  );
}
