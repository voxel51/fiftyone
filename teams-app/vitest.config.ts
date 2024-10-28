import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      pages: 'app/packages/app/pages'
    },
    include: ['packages/**/*.test.ts']
  }
});
