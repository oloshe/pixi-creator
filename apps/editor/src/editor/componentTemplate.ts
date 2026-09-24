/** Turns a free-form script name into a `PascalCase` file base and a `game.*` type. */
export function scriptIdentifiers(input: string): { fileName: string; type: string } {
  const trimmed = input.trim().replace(/\.ts$/i, '');
  const pascal = trimmed
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  const name = pascal || 'NewComponent';
  const type = `game.${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return { fileName: `${name}.ts`, type };
}

/** Standard project component template, matching `MoveComponent.ts` in the demo. */
export function componentTemplate(type: string, className: string): string {
  return `import { Component, defineComponent, prop } from '@pxe/runtime';

class ${className} extends Component {
  // speed = 100;

  update(dt: number): void {
    // this.node.x += this.speed * dt;
  }
}

export default defineComponent({
  type: '${type}', displayName: '${className}', category: 'Game', ctor: ${className},
  properties: {
    // speed: prop.number({ default: 100, min: 0, max: 2000 }),
  },
});
`;
}
