// Copies the built frontend + backend + manifest into deploy/<env>/build for clasp push.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const env = process.argv[2];
if (!['staging', 'production'].includes(env)) throw new Error('Usage: assemble.mjs staging|production');

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}deploy/${env}/build`;
for (const f of ['dist/frontend/index.html', 'dist/backend/Code.js']) {
  if (!existsSync(`${root}${f}`)) throw new Error(`Missing ${f}. Run npm run build first.`);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(`${root}dist/frontend/index.html`, `${out}/index.html`);
cpSync(`${root}dist/backend/Code.js`, `${out}/Code.js`);
cpSync(`${root}backend/appsscript.json`, `${out}/appsscript.json`);
writeFileSync(`${out}/Env.js`, `var APP_ENVIRONMENT = ${JSON.stringify(env)};\n`);
console.log(`Assembled ${env} → deploy/${env}/build`);
