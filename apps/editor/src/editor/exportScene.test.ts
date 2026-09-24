import { expect, it } from 'vitest';
import { createCanvasNode } from '@pxe/editor-core';
import { createDefaultSceneSettings } from '@pxe/schema';
import { createEmbedSnippet } from './exportScene';

it('embeds portable assets and escapes project code without closing the HTML script', () => {
  const scene = { schemaVersion: 4 as const, id: 'scene', name: 'Test', settings: createDefaultSceneSettings(), root: createCanvasNode() };
  const snippet = createEmbedSnippet(scene, { schemaVersion: 2, assets: [{ id: 'a', type: 'texture', path: 'assets/a.svg' }], scenePreloads: {} },
    [{ path: 'src/A.ts', code: 'const label = "</script><script>unexpected()</script>";' }]);
  expect(snippet.split('\n')).toHaveLength(3);
  expect(snippet.match(/<\/script>/g)).toHaveLength(2);
  expect(snippet).toContain('assets/a.svg');
  expect(snippet).not.toContain('blob:');
  const options = JSON.parse(snippet.split("mount('#scene', ")[1]!.split(').catch')[0]!);
  expect(options.scene).toBe('scene.json');
  expect(options.modules[0].code).toContain('</script>');
});
