// Bundles and runs scripts/sample-form.ts (sample printouts for a visual check).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  entryPoints: [`${root}scripts/sample-form.ts`],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: `${root}dist/sample-form.mjs`,
  alias: { '@shared': `${root}shared`, '@backend': `${root}backend/src` },
});
execFileSync('node', [`${root}dist/sample-form.mjs`, ...process.argv.slice(2)], { stdio: 'inherit' });
