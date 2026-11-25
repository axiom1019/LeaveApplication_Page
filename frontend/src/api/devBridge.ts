/**
 * LOCAL DEVELOPMENT ONLY (left out of production builds).
 * Runs the real backend endpoints in the browser on an in-memory database with sample people.
 * Pick who you are with ?as=staff|cos|chief|ao|rd|oic|hr|owner|stranger. Data resets on reload.
 */
import type { ApiName, ApiResult } from '@shared/api';
import { endpoints } from '@backend/api/endpoints';
import { PEOPLE, seededDeps } from '@backend/testing/fixtures';

const params = new URLSearchParams(location.search);
const who = params.get('as') ?? 'staff';
const deps = seededDeps({ nowMs: Date.now() });

// A sample application waiting for the Division Chief, plus a holiday.
deps.setActiveEmail(PEOPLE.owner);
endpoints.api_saveHoliday(deps, { date: '2026-12-08', name: 'Feast of the Immaculate Conception' });
endpoints.api_saveHoliday(deps, { date: '2026-12-25', name: 'Christmas Day' });
endpoints.api_saveHoliday(deps, { date: '2026-12-30', name: 'Rizal Day' });
deps.setActiveEmail(PEOPLE.staff);
endpoints.api_fileLeave(deps, {
  idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
  form: { leaveType: 'VL', details: { location: 'PH', locationText: 'Camiguin' }, dates: ['2026-12-21', '2026-12-22', '2026-12-23'], commutation: 'NOT_REQUESTED' },
});

const emails: Record<string, string> = { ...PEOPLE, stranger: 'stranger@dhsud.gov.ph' };
// The COS worker has a personal address, so Google does not share it: they sign in with a code.
deps.setActiveEmail(who === 'cos' ? '' : (emails[who] ?? ''));
if (who === 'cos') {
  // Show the code in the console instead of emailing it.
  const send = deps.mail.send;
  deps.mail.send = (to, subject, body) => {
    console.info(`[dev] email to ${to}: ${subject}`);
    send(to, subject, body);
  };
}

export async function devTransport(name: ApiName, input: unknown): Promise<ApiResult<unknown>> {
  await new Promise((r) => setTimeout(r, 120));
  return structuredClone(endpoints[name](deps, structuredClone(input)) as ApiResult<unknown>);
}
