// Creates a new version and points the environment's stable deployment at it (URL never changes).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const env = process.argv[2];
if (!['staging', 'production'].includes(env)) throw new Error('Usage: deploy.mjs staging|production');
const dir = fileURLToPath(new URL(`../deploy/${env}/`, import.meta.url));
if (env === 'production') {
  // Production needs an approved privacy notice (RA 10173) and an explicit confirmation.
  const notice = readFileSync(fileURLToPath(new URL('../shared/privacy.ts', import.meta.url)), 'utf8');
  if (!/^\s*approved:\s*true,\s*$/m.test(notice)) throw new Error('Refusing to deploy production: the privacy notice is not approved yet (shared/privacy.ts).');
  if (process.env.CONFIRM_PRODUCTION !== 'yes') throw new Error('Refusing to deploy production without CONFIRM_PRODUCTION=yes.');
}
const file = `${dir}deployment.json`;
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const desc = `${env} ${sha} ${new Date().toISOString()}`;
// Retries transient network failures (ECONNRESET / premature close seen on this network).
function clasp(args, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return execFileSync('clasp', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    } catch (e) {
      const msg = `${e.stdout ?? ''}${e.stderr ?? ''}`;
      if (i >= attempts || !/ECONNRESET|Premature close|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(msg)) {
        throw new Error(`clasp ${args.join(' ')} failed:\n${msg}`, { cause: e });
      }
      console.warn(`clasp network error (attempt ${i}), retrying in 15 s…`);
      execFileSync('sleep', ['15']);
    }
  }
}

if (existsSync(file)) {
  const { deploymentId } = JSON.parse(readFileSync(file, 'utf8'));
  console.log(clasp(['create-deployment', '-i', deploymentId, '-d', desc]));
} else {
  const out = clasp(['create-deployment', '-d', desc]);
  const id = out.match(/Deployed (\S+)/)?.[1];
  if (!id) throw new Error(`Could not read deployment id from: ${out}`);
  writeFileSync(file, JSON.stringify({ deploymentId: id }, null, 2) + '\n');
  console.log(out);
}
const { deploymentId } = JSON.parse(readFileSync(file, 'utf8'));
console.log(`URL: https://script.google.com/macros/s/${deploymentId}/exec`);
