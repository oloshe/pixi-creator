import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: { entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)), name: 'PxePlayer', formats: ['es', 'iife'],
      fileName: (format) => format === 'es' ? 'pxe-player.mjs' : 'pxe-player.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
