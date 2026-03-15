import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

export default defineConfig({
  define: {
    '__PKG_VERSION__': JSON.stringify(pkg.version),
  },
  test: {
    root: 'src',
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['**/__tests__/**', '**/*.test.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
