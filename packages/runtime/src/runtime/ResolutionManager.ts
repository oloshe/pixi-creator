import type { Container } from 'pixi.js';
import type { ResizeMode } from '@pxe/schema';

/**
 * Maps the design (game) resolution onto the real screen.
 *
 * Three resolutions are deliberately kept apart:
 * - design resolution  → `designWidth` × `designHeight` (game coordinates)
 * - screen/CSS size    → `screenWidth` × `screenHeight`
 * - renderer backing store → CSS size × DPR (owned by Pixi's `autoDensity`)
 */
export class ResolutionManager {
  readonly designWidth: number;
  readonly designHeight: number;

  resizeMode: ResizeMode;

  screenWidth = 0;
  screenHeight = 0;

  scaleX = 1;
  scaleY = 1;

  viewportWidth = 0;
  viewportHeight = 0;

  offsetX = 0;
  offsetY = 0;

  /** How much of the design space is actually visible (screen size / scale). */
  visibleDesignWidth: number;
  visibleDesignHeight: number;

  constructor(designWidth: number, designHeight: number, resizeMode: ResizeMode = 'contain') {
    this.designWidth = designWidth;
    this.designHeight = designHeight;
    this.resizeMode = resizeMode;
    this.visibleDesignWidth = designWidth;
    this.visibleDesignHeight = designHeight;
    this.resize(designWidth, designHeight);
  }

  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    const ratioX = screenWidth / this.designWidth;
    const ratioY = screenHeight / this.designHeight;

    switch (this.resizeMode) {
      case 'cover': {
        const scale = Math.max(ratioX, ratioY);
        this.setUniform(scale, screenWidth, screenHeight);
        break;
      }
      case 'fixed-width': {
        const scale = ratioX;
        this.setUniform(scale, screenWidth, screenHeight, 'x');
        break;
      }
      case 'fixed-height': {
        const scale = ratioY;
        this.setUniform(scale, screenWidth, screenHeight, 'y');
        break;
      }
      case 'stretch': {
        this.scaleX = ratioX;
        this.scaleY = ratioY;
        this.viewportWidth = screenWidth;
        this.viewportHeight = screenHeight;
        this.offsetX = 0;
        this.offsetY = 0;
        break;
      }
      case 'contain':
      default: {
        const scale = Math.min(ratioX, ratioY);
        this.setUniform(scale, screenWidth, screenHeight);
        break;
      }
    }

    this.visibleDesignWidth = this.scaleX === 0 ? 0 : screenWidth / this.scaleX;
    this.visibleDesignHeight = this.scaleY === 0 ? 0 : screenHeight / this.scaleY;
  }

  setResizeMode(mode: ResizeMode): void {
    this.resizeMode = mode;
    this.resize(this.screenWidth, this.screenHeight);
  }

  /** Screen (CSS pixel) point → design coordinate. */
  toDesign(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - this.offsetX) / this.scaleX,
      y: (y - this.offsetY) / this.scaleY,
    };
  }

  /** Design coordinate → screen (CSS pixel) point. */
  toScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: x * this.scaleX + this.offsetX,
      y: y * this.scaleY + this.offsetY,
    };
  }

  applyTo(target: Container): void {
    target.scale.set(this.scaleX, this.scaleY);
    target.position.set(this.offsetX, this.offsetY);
  }

  private setUniform(scale: number, screenWidth: number, screenHeight: number, lock?: 'x' | 'y'): void {
    this.scaleX = scale;
    this.scaleY = scale;
    this.viewportWidth = this.designWidth * scale;
    this.viewportHeight = this.designHeight * scale;
    this.offsetX = lock === 'x' ? 0 : (screenWidth - this.viewportWidth) / 2;
    this.offsetY = lock === 'y' ? 0 : (screenHeight - this.viewportHeight) / 2;
  }
}
