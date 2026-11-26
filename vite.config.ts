import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./frontend'),
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@shared': r('./shared'), '@backend': r('./backend/src') } },
  build: { outDir: r('./dist/frontend'), emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  server: { port: 5174, strictPort: true },
});
