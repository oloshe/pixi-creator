import { Rectangle } from 'pixi.js';
import { Component } from '../Component';

type ButtonEvent = 'click' | 'pointerDown' | 'pointerUp';

export class Button extends Component {
  interactable = true;
  private readonly listeners = new Map<ButtonEvent, Set<() => void>>();
  private readonly click = () => this.emit('click');
  private readonly down = () => this.emit('pointerDown');
  private readonly up = () => this.emit('pointerUp');

  on(event: ButtonEvent, listener: () => void): () => void {
    const listeners = this.listeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return () => listeners.delete(listener);
  }

  onLoad(): void {
    this.node.view.on('pointertap', this.click);
    this.node.view.on('pointerdown', this.down);
    this.node.view.on('pointerup', this.up);
    this.node.view.on('pointerupoutside', this.up);
    this.applyProperties();
  }

  applyProperties(): void {
    const available = this.enabled && this.interactable && this.node.activeInHierarchy;
    this.node.view.eventMode = available ? 'static' : 'auto';
    this.node.view.cursor = available ? 'pointer' : 'default';
    // Hit area is the node rect in its own local space (top-left at 0,0).
    const width = this.node.width;
    const height = this.node.height;
    this.node.view.hitArea = width > 0 && height > 0
      ? new Rectangle(0, 0, width, height)
      : null;
  }

  onEnable(): void { this.applyProperties(); }
  onDisable(): void { this.applyProperties(); }

  onDestroy(): void {
    this.node.view.off('pointertap', this.click);
    this.node.view.off('pointerdown', this.down);
    this.node.view.off('pointerup', this.up);
    this.node.view.off('pointerupoutside', this.up);
    this.node.view.eventMode = 'auto';
    this.node.view.cursor = 'default';
    this.node.view.hitArea = null;
    this.listeners.clear();
  }

  private emit(event: ButtonEvent): void {
    if (!this.enabled || !this.interactable || !this.node.activeInHierarchy) return;
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
}
