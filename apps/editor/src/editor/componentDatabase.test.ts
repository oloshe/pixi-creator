import { describe, expect, it } from 'vitest';
import { SceneDocument, createCanvasNode } from '@pxe/editor-core';
import { createDefaultSceneSettings } from '@pxe/schema';
import * as runtime from '@pxe/runtime';
import { transform } from 'sucrase';
import { buildComponentManifest, parseComponentDatabase, reconcileComponentDatabase, scanComponentPaths } from './componentDatabase';
import { createComponentManifest } from './componentManifest';
import { addComponent } from './componentActions';
import { openProjectFromEntries } from './project';
import { evaluateComponentModules } from '@pxe/runtime';

const metadata = { type: 'game.test', displayName: 'Test', category: 'Game', properties: { speed: { type: 'number' as const, default: 42 } } };
describe('project component database', () => {
  it('scans sources and metadata with the shared ignores and deduplicates paths', () => {
    expect(scanComponentPaths(['src/A.ts', 'src/A.ts', 'src/A.component.json', 'src/A.d.ts', 'src/README.md',
      'src/dist/B.ts', 'src/node_modules/C.ts', 'src/.pxe/D.ts', 'assets/E.ts'])).toEqual({
      sources: ['src/A.ts'], metadata: ['src/A.component.json'], ignored: ['src/A.d.ts', 'src/README.md'],
    });
  });
  it('reconciles rename/rescan without churn and removes deleted types', () => {
    const first = reconcileComponentDatabase(parseComponentDatabase(null), [{ path: 'src/A.component.json', metadata }]);
    const again = reconcileComponentDatabase(first, [{ path: 'src/A.component.json', metadata }]);
    expect(again).toEqual(first);
    const renamed = reconcileComponentDatabase(first, [{ path: 'src/Renamed.component.json', metadata }]);
    expect(renamed.components[0]!.id).toBe(first.components[0]!.id);
    expect(reconcileComponentDatabase(first, []).components).toEqual([]);
    const manifest = buildComponentManifest(first);
    manifest[0]!.displayName = 'Changed';
    expect(first.components[0]!.metadata.displayName).toBe('Test');
  });
  it('exposes the source path on the editor manifest item', () => {
    const db = reconcileComponentDatabase(parseComponentDatabase(null), [{ path: 'src/components/A.ts', metadata }]);
    expect(buildComponentManifest(db)[0]!.sourcePath).toBe('src/components/A.ts');
    expect(createComponentManifest().every((item) => item.sourcePath === undefined)).toBe(true);
  });
  it('strips ctor and rejects duplicate/reserved types and malformed property metadata', () => {
    const db = reconcileComponentDatabase(parseComponentDatabase(null), [{ path: 'src/A.ts', metadata: { ...metadata, ctor: () => {} } }]);
    expect(buildComponentManifest(db)[0]).not.toHaveProperty('ctor');
    expect(() => reconcileComponentDatabase(db, [db.components[0]!, db.components[0]!])).toThrow('Duplicate');
    expect(() => reconcileComponentDatabase(db, [{ path: 'a', metadata: { ...metadata, type: 'engine.Bad' } }])).toThrow();
    expect(parseComponentDatabase({ schemaVersion: 1, components: [{ metadata: {} }] }).components).toEqual([]);
  });
  it('separates custom source roots from assets in the read-only directory fallback', async () => {
    const entries = ['code/A.ts', 'code/A.component.json', 'code/node_modules/B.ts', 'assets/a.png', 'src/ignored.ts']
      .map((path) => ({ path, file: new File([''], path), handle: null }));
    entries.push({ path: 'pxe.config.json', file: new File([JSON.stringify({ name: 'Custom', components: 'code' })], 'pxe.config.json'), handle: null });
    const project = await openProjectFromEntries(entries);
    expect(project.sourcePaths).toEqual(['code/A.ts', 'code/A.component.json']);
    expect(project.assetPaths).toEqual(['assets/a.png']);
    expect(project.hasWriteAccess).toBe(false);
  });
  it('injects manifests per document and roundtrips unknown component props without alteration', () => {
    const doc = new SceneDocument({ schemaVersion: 3, id: 'test', name: 'Test', settings: createDefaultSceneSettings(), root: createCanvasNode() });
    const manifest = createComponentManifest([metadata]);
    expect(addComponent(doc, doc.data.root.id, metadata.type, manifest)).toBe(true);
    expect(doc.data.root.components[0]!.props).toEqual({ speed: 42 });
    expect(addComponent(doc, doc.data.root.id, metadata.type, createComponentManifest())).toBe(false);
    const unknown = { id: 'missing', type: 'game.notExist', enabled: false, props: { text: '汉字', number: 0, nested: [null, { extra: true }] } };
    doc.data.root.components.push(unknown);
    const reloaded = new SceneDocument(JSON.parse(JSON.stringify(doc.serialize())));
    expect(JSON.stringify(reloaded.data.root.components[1])).toBe(JSON.stringify(unknown));
  });
  it('transpiles TS with relative imports and exports runtime definitions without constructing behaviors', () => {
    const modules = [
      { path: 'src/helper.ts', text: 'export const speed: number = 42;' },
      { path: 'src/A.ts', text: `import { Component, defineComponent, prop } from '@pxe/runtime';
        import { speed } from './helper';
        class Test extends Component { constructor() { super(); throw new Error('must not construct'); } }
        export const components = [defineComponent({type:'game.test',displayName:'Test',category:'Game',ctor:Test,properties:{speed:prop.number({default:speed})}})];` },
    ].map(({ path, text }) => ({ path, code: transform(text, { transforms: ['typescript', 'imports'] }).code }));
    const definitions = evaluateComponentModules(modules, runtime);
    expect(definitions).toHaveLength(1);
    expect(definitions[0]!.definition.properties.speed).toEqual({ type: 'number', default: 42 });
    expect(() => evaluateComponentModules([{ path: 'a.ts', code: "require('not-installed')" }], runtime)).toThrow('Unsupported import');
  });
});
