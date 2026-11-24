import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@classroom/shared': fileURLToPath(new URL('./shared/src', import.meta.url)) },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 10000 },
});
