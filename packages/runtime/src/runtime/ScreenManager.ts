import type { Container } from 'pixi.js';
import type { ResizeMode, SafeAreaInsets } from '@pxe/schema';
import { emptySafeArea, normalizeSafeArea } from '@pxe/schema';
import { ResolutionManager } from './ResolutionManager';

export type { SafeAreaInsets };
export { emptySafeArea };

export interface SafeAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Screen adapter: design/screen resolution mapping plus safe-area insets.
 *
 * Insets are expressed in *screen* (CSS) pixels — the unit reported by
 * `env(safe-area-inset-*)` and by native bridges — and converted to design
 * units through {@link ScreenManager.safeAreaInDesign}.
 */
export class ScreenManager {
  readonly safeArea: SafeAreaInsets = { ...emptySafeArea };

  private current: ResolutionManager;

  constructor(designWidth: number, designHeight: number, resizeMode: ResizeMode = 'contain') {
    this.current = new ResolutionManager(designWidth, designHeight, resizeMode);
  }

  get resolution(): ResolutionManager {
    return this.current;
  }

  /** Re-targets the adapter at a scene's design resolution. */
  configure(designWidth: number, designHeight: number, resizeMode: ResizeMode): void {
    const screenWidth = this.current.screenWidth || designWidth;
    const screenHeight = this.current.screenHeight || designHeight;
    this.current = new ResolutionManager(designWidth, designHeight, resizeMode);
    this.current.resize(screenWidth, screenHeight);
  }

  get designWidth(): number {
    return this.current.designWidth;
  }

  get designHeight(): number {
    return this.current.designHeight;
  }

  get screenWidth(): number {
    return this.current.screenWidth;
  }

  get screenHeight(): number {
    return this.current.screenHeight;
  }

  resize(screenWidth: number, screenHeight: number): void {
    this.current.resize(screenWidth, screenHeight);
  }

  setResizeMode(mode: ResizeMode): void {
    this.current.setResizeMode(mode);
  }

  applyTo(target: Container): void {
    this.current.applyTo(target);
  }

  setSafeArea(insets: Partial<SafeAreaInsets>): void {
    Object.assign(this.safeArea, normalizeSafeArea(insets));
  }

  /** Safe-area insets converted into design units. */
  get safeAreaInDesign(): SafeAreaInsets {
    return {
      top: this.safeArea.top / this.current.scaleY,
      right: this.safeArea.right / this.current.scaleX,
      bottom: this.safeArea.bottom / this.current.scaleY,
      left: this.safeArea.left / this.current.scaleX,
    };
  }

  /** Usable rect in design coordinates (design space minus safe-area insets). */
  get safeAreaRect(): SafeAreaRect {
    const insets = this.safeAreaInDesign;
    return {
      x: insets.left,
      y: insets.top,
      width: Math.max(0, this.designWidth - insets.left - insets.right),
      height: Math.max(0, this.designHeight - insets.top - insets.bottom),
    };
  }

  /** Reads `env(safe-area-inset-*)` through a probe element and stores it. */
  readCssSafeArea(host?: HTMLElement | null): SafeAreaInsets {
    if (typeof document === 'undefined') {
      return { ...emptySafeArea };
    }

    const element = document.createElement('div');
    element.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top)',
      'padding-right:env(safe-area-inset-right)',
      'padding-bottom:env(safe-area-inset-bottom)',
      'padding-left:env(safe-area-inset-left)',
    ].join(';');

    (host ?? document.body).appendChild(element);
    const style = getComputedStyle(element);
    const insets: SafeAreaInsets = {
      top: parseFloat(style.paddingTop) || 0,
      right: parseFloat(style.paddingRight) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
    };
    element.remove();

    this.setSafeArea(insets);
    return insets;
  }
}

/** Renderer backing-store resolution: DPR capped at 2. */
export function rendererResolution(): number {
  return Math.min(globalThis.devicePixelRatio || 1, 2);
}

export function safeAreaFromInsets(insets: Partial<SafeAreaInsets>): SafeAreaInsets {
  return normalizeSafeArea(insets);
}
