// Bundles backend/src/main.ts into dist/backend/Code.js for Apps Script.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const alias = { '@shared': `${root}shared`, '@backend': `${root}backend/src` };

// API names come from shared/apiNames.ts (type-checked against ApiContract).
const names = [...readFileSync(`${root}shared/apiNames.ts`, 'utf8').matchAll(/'(api_[A-Za-z]+)'/g)].map((m) => m[1]);
if (names.length === 0) throw new Error('No API names found');

const result = await build({
  entryPoints: [`${root}backend/src/main.ts`],
  bundle: true,
  format: 'iife',
  globalName: '__App',
  target: 'es2020',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  alias,
  write: false,
  legalComments: 'none',
});

const stubs = [
  '',
  '// ---- Apps Script entry points (generated) ----',
  'function doGet(e) { return __App.doGet(e); }',
  'function setupDatabase() { return __App.setupDatabase(); }',
  ...names.map((n) => `function ${n}(input) { return __App.call('${n}', input); }`),
  '',
].join('\n');

mkdirSync(`${root}dist/backend`, { recursive: true });
writeFileSync(`${root}dist/backend/Code.js`, result.outputFiles[0].text + stubs);
console.log(`Code.js: ${(result.outputFiles[0].contents.length / 1024).toFixed(1)} KB, ${names.length} API entry points`);
