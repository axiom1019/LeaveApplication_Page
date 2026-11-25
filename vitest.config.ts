import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { '@shared': r('./shared'), '@backend': r('./backend/src') } },
  test: { include: ['backend/src/**/*.test.ts', 'shared/**/*.test.ts'], environment: 'node' },
});
