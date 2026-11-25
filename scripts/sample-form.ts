/*
 * Writes sample CSC Form No. 6 printouts to dist/samples/ for a visual check:
 *   node scripts/build-sample.mjs
 * One blank-signature form (as printed right after filing) and one fully e-signed form.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { endpoints } from '../backend/src/api/endpoints';
import { PEOPLE, seededDeps } from '../backend/src/testing/fixtures';

const outDir = process.argv[2] ?? 'dist/samples';
const signaturePng = process.argv[3] ?? '';
mkdirSync(outDir, { recursive: true });

const deps = seededDeps({ nowMs: Date.UTC(2026, 10, 27, 1) });
const ok = <T,>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
};

deps.setActiveEmail(PEOPLE.owner);
ok(endpoints.api_saveHoliday(deps, { date: '2026-12-08', name: 'Feast of the Immaculate Conception' }));
ok(endpoints.api_saveSettings(deps, { ...ok(endpoints.api_getSettings(deps, {})), esignEnabled: true }));

deps.setActiveEmail(PEOPLE.staff);
const a = ok(
  endpoints.api_fileLeave(deps, {
    idempotencyKey: '00000000-0000-4000-8000-00000000a001',
    form: { leaveType: 'VL', details: { location: 'PH', locationText: 'Camiguin' }, dates: ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10'], commutation: 'NOT_REQUESTED' },
  }),
);
writeFileSync(`${outDir}/form-filed.html`, ok(endpoints.api_formHtml(deps, { applicationId: a.applicationId })).html);

for (const [email, decision, extra] of [
  [PEOPLE.chief, 'FOR_APPROVAL', {}],
  [PEOPLE.ao, 'CERTIFIED', { credits: { asOf: '2026-11-30', vlEarned: '24.250', vlLess: '3', vlBalance: '21.250', slEarned: '30.500', slLess: '0', slBalance: '30.500' } }],
  [PEOPLE.rd, 'APPROVED', { daysWithPay: '3' }],
] as const) {
  deps.setActiveEmail(email);
  if (signaturePng) ok(endpoints.api_uploadSignature(deps, { pngBase64: signaturePng }));
  const v = ok(endpoints.api_getApplication(deps, { applicationId: a.applicationId })).version;
  ok(endpoints.api_sign(deps, { applicationId: a.applicationId, version: v, method: signaturePng ? 'ESIGN' : 'PAPER', decision, ...extra }));
}
writeFileSync(`${outDir}/form-signed.html`, ok(endpoints.api_formHtml(deps, { applicationId: a.applicationId })).html);
console.log(`Wrote ${outDir}/form-filed.html and form-signed.html`);
