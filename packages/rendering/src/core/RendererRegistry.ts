import type { RendererView } from './RendererView';

/**
 * Creates one renderer view for a component type.
 *
 * Editor and runtime register the *same* factories, which is what keeps their
 * visual output identical.
 */
export interface RendererFactory<TProps = never> {
  readonly type: string;
  create(): RendererView<TProps>;
  /**
   * Normalises raw component data into renderer props.
   *
   * Hung off the factory (an extension over the two-member shape in the spec)
   * so the defaults live next to the view that consumes them. That is what makes
   * it impossible for the editor to drift from the runtime: neither side
   * implements its own defaults.
   */
  resolveProps(raw: Record<string, unknown>): TProps;
}

/**
 * Component type → renderer view factory.
 *
 * Unknown types resolve to `null` rather than throwing: a scene legitimately
 * contains non-rendering components (layout, behaviour, editor-only metadata)
 * and the preview must skip those instead of failing to load the scene.
 */
export class RendererRegistry {
  private readonly factories = new Map<string, RendererFactory<unknown>>();

  register(type: string, factory: RendererFactory<unknown>): void {
    if (this.factories.has(type)) {
      throw new Error(`Renderer already registered: ${type}`);
    }

    if (factory.type !== type) {
      throw new Error(`Renderer factory type mismatch: ${factory.type} registered as ${type}`);
    }

    this.factories.set(type, factory);
  }

  registerMany(factories: readonly RendererFactory<unknown>[]): void {
    for (const factory of factories) {
      this.register(factory.type, factory);
    }
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  /** The factory for a component type, or `undefined` for non-renderer types. */
  factory(type: string): RendererFactory<unknown> | undefined {
    return this.factories.get(type);
  }

  create(type: string): RendererView<unknown> | null {
    const factory = this.factories.get(type);
    return factory ? factory.create() : null;
  }

  /** Renderer types this registry can instantiate. */
  types(): string[] {
    return [...this.factories.keys()];
  }

  /** Drops every registration; used by tests and by project reloads. */
  clear(): void {
    this.factories.clear();
  }
}

/**
 * The engine's built-in renderer registry: one definition, consumed by both the
 * editor preview and the runtime.
 *
 * The renderer factories are passed in rather than imported so this module stays
 * free of the concrete view implementations.
 */
export function createRendererRegistry(
  factories: readonly RendererFactory<unknown>[] = [],
): RendererRegistry {
  const registry = new RendererRegistry();
  registry.registerMany(factories);
  return registry;
}
