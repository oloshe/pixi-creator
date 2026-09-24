import type { EditorComponentManifestItem } from './componentManifest';
import type { CompiledModule } from '@pxe/runtime';

export interface ComponentCompilation {
  modules: CompiledModule[];
  entries: { path: string; metadata: EditorComponentManifestItem }[];
}

export function compileProjectComponents(sources: { path: string; text: string }[]): Promise<ComponentCompilation> {
  if (!sources.length) return Promise.resolve({ modules: [], entries: [] });
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./componentWorker.ts', import.meta.url), { type: 'module' });
    const finish = () => { clearTimeout(timeout); worker.terminate(); };
    const timeout = setTimeout(() => { finish(); reject(new Error('Component compilation timed out (15 seconds)')); }, 15000);
    worker.onerror = (event) => { finish(); reject(new Error(event.message)); };
    worker.onmessage = (event: MessageEvent<ComponentCompilation & { error?: string }>) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage({ sources });
  });
}
