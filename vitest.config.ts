import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/**/*.test.ts', 'apps/editor/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@pxe/player': new URL('./packages/player/src/index.ts', import.meta.url).pathname,
      '@pxe/schema': new URL('./packages/schema/src/index.ts', import.meta.url).pathname,
      '@pxe/rendering': new URL('./packages/rendering/src/index.ts', import.meta.url).pathname,
      '@pxe/runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
      '@pxe/editor-core': new URL('./packages/editor-core/src/index.ts', import.meta.url).pathname,
    },
  },
});
