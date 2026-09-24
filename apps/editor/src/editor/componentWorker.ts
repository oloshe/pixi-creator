import { transform } from 'sucrase';
import { Component, defineComponent, prop, evaluateComponentModules } from '@pxe/runtime/component-api';
// `Button` is present so project components can `import { Button }` and use it
// for event binding (`getComponent(Button)` / `componentRef`). A stub is enough
// here: metadata extraction only evaluates module top level, never the Button
// class (whose real ctor lives in `@pxe/runtime` and is used by the Play host).
class Button {}
const runtime = { Component, defineComponent, prop, Button };
import { componentMetadataSchema } from './componentDatabase';

self.onmessage = (event: MessageEvent<{ sources: { path: string; text: string }[] }>) => {
  try {
    const modules = event.data.sources.map(({ path, text }) => ({ path, code: transform(text, {
      transforms: ['typescript', 'imports'], filePath: path,
    }).code }));
    const entries = evaluateComponentModules(modules, runtime).map(({ path, definition }) => ({
      path, metadata: componentMetadataSchema.parse(definition),
    }));
    self.postMessage({ modules, entries });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
