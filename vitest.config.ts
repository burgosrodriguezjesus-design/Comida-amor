import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./client/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['server/tests/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
