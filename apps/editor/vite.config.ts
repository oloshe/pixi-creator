import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@pxe/player': fileURLToPath(new URL('../../packages/player/src/index.ts', import.meta.url)) } },
  worker: { format: 'es' },
  optimizeDeps: { include: ['sucrase'] },
  build: {
    rollupOptions: {
      input: {
        editor: fileURLToPath(new URL('./index.html', import.meta.url)),
        play: fileURLToPath(new URL('./play.html', import.meta.url)),
      },
    },
  },
});
