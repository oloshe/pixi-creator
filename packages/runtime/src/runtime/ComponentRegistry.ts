import type { Component, ComponentConstructor } from './Component';
import { MissingComponent } from './MissingComponent';

export type PropertyDefinition =
  | { type: 'number'; default?: number; min?: number; max?: number }
  | { type: 'string'; default?: string }
  | { type: 'boolean'; default?: boolean }
  | { type: 'enum'; values: string[]; default?: string }
  | { type: 'color'; default?: string }
  | { type: 'vec2'; default?: { x: number; y: number } }
  | { type: 'asset'; assetType?: string; default?: { assetId: string } | null }
  | { type: 'nodeRef'; default?: { nodeId: string } | null }
  | { type: 'componentRef'; componentType?: string; default?: { nodeId: string; componentId: string } | null };

export type PropertyDefinitions = Record<string, PropertyDefinition>;

export type ComponentDefinition<T extends Component = Component> = {
  type: string;
  displayName: string;
  category: string;
  ctor: ComponentConstructor<T>;
  properties: PropertyDefinitions;
};

export function defineComponent<T extends Component>(definition: ComponentDefinition<T>): ComponentDefinition<T> {
  return definition;
}

export const prop = {
  number(options: Omit<Extract<PropertyDefinition, { type: 'number' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'number', ...options };
  },
  string(options: Omit<Extract<PropertyDefinition, { type: 'string' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'string', ...options };
  },
  boolean(options: Omit<Extract<PropertyDefinition, { type: 'boolean' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'boolean', ...options };
  },
  enum(options: Omit<Extract<PropertyDefinition, { type: 'enum' }>, 'type'>): PropertyDefinition {
    return { type: 'enum', ...options };
  },
  color(options: Omit<Extract<PropertyDefinition, { type: 'color' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'color', ...options };
  },
  vec2(options: Omit<Extract<PropertyDefinition, { type: 'vec2' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'vec2', ...options };
  },
  asset(options: Omit<Extract<PropertyDefinition, { type: 'asset' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'asset', ...options };
  },
  nodeRef(options: Omit<Extract<PropertyDefinition, { type: 'nodeRef' }>, 'type'> = {}): PropertyDefinition {
    return { type: 'nodeRef', ...options };
  },
  componentRef(
    options: Omit<Extract<PropertyDefinition, { type: 'componentRef' }>, 'type'> = {},
  ): PropertyDefinition {
    return { type: 'componentRef', ...options };
  },
};

export class ComponentRegistry {
  private readonly definitions = new Map<string, ComponentDefinition>();

  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Component type already registered: ${definition.type}`);
    }

    this.definitions.set(definition.type, definition);
  }

  registerMany(definitions: ComponentDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  get(type: string): ComponentDefinition | undefined {
    return this.definitions.get(type);
  }

  list(): ComponentDefinition[] {
    return [...this.definitions.values()];
  }

  create(type: string): Component {
    const definition = this.get(type);

    if (!definition) {
      return new MissingComponent(type, {});
    }

    return new definition.ctor();
  }
}
