import { describe, expect, it } from 'vitest';
import { runtimeTypeDeclarations, typeStubPath } from './typeStub';

describe('typeStub', () => {
  it('declares the @pxe/runtime ambient module with the authoring symbols', () => {
    const dts = runtimeTypeDeclarations();

    expect(dts).toContain("declare module '@pxe/runtime'");
    expect(dts).toContain("declare module '@pxe/runtime/component-api'");
    expect(dts).toContain('class Component');
    expect(dts).toContain('defineComponent');
    expect(dts).toContain('componentRef');
    expect(dts).toContain('class Button');
  });

  it('lives under the components source root so an existing tsconfig includes it', () => {
    expect(typeStubPath).toBe('src/pxe-runtime.d.ts');
  });
});
