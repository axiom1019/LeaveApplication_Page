// Copies the built frontend + backend + manifest into deploy/<env>/build for clasp push.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
// Extra administrator addresses stay out of git (the repository is public): deploy/<env>/admins.local.json.
const adminsFile = `${root}deploy/${env}/admins.local.json`;
const admins = existsSync(adminsFile) ? JSON.parse(readFileSync(adminsFile, 'utf8')) : [];
if (!Array.isArray(admins) || admins.some((a) => typeof a !== 'string' || !a.includes('@'))) throw new Error(`${adminsFile} must be a JSON array of email addresses`);
writeFileSync(`${out}/Env.js`, `var APP_ENVIRONMENT = ${JSON.stringify(env)};\nvar EXTRA_ADMIN_EMAILS = ${JSON.stringify(admins)};\n`);
if (admins.length) console.log(`Extra administrators: ${admins.length}`);
console.log(`Assembled ${env} → deploy/${env}/build`);
