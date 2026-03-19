import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

export default defineConfig([
  // CLI entry point
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node18',
    clean: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
    define: {
      '__PKG_VERSION__': JSON.stringify(pkg.version),
    },
  },
  // Library modules (consumed programmatically, no CLI banner)
  {
    entry: ['src/modules/observability/index.ts'],
    outDir: 'dist/modules/observability',
    format: ['esm'],
    target: 'node18',
    dts: true,
    define: {
      '__PKG_VERSION__': JSON.stringify(pkg.version),
    },
  },
]);
