import { describe, expect, it } from 'vitest';
import type { ApiResult, CreditsDto } from '@shared/api';
import { endpoints } from '../api/endpoints';
import { PEOPLE, seededDeps } from '../testing/fixtures';
import { addMonths, monthsBetween } from './credits';

type Deps = ReturnType<typeof seededDeps>;
function ok<T>(r: ApiResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}
function err<T>(r: ApiResult<T>) {
  if (r.ok) throw new Error('expected an error');
  return r.error;
}
const as = (deps: Deps, email: string) => deps.setActiveEmail(email);
let n = 0;
const key = () => `00000000-0000-4000-9000-${(++n).toString(16).padStart(12, '0')}`;
const file = (deps: Deps, email: string, leaveType: string, dates: string[], details: Record<string, string> = {}) => {
  as(deps, email);
  return endpoints.api_fileLeave(deps, { idempotencyKey: key(), form: { leaveType, details, dates, commutation: 'NOT_REQUESTED' } });
};
const approve = (deps: Deps, applicationId: string, withChief = true) => {
  const sign = (email: string, decision: string) => {
    as(deps, email);
    const a = ok(endpoints.api_getApplication(deps, { applicationId }));
    ok(endpoints.api_sign(deps, { applicationId, version: a.version, method: 'PAPER', decision }));
  };
  if (withChief) sign(PEOPLE.chief, 'FOR_APPROVAL');
  sign(PEOPLE.ao, 'CERTIFIED');
  sign(PEOPLE.rd, 'APPROVED');
  as(deps, PEOPLE.hr);
  ok(endpoints.api_fileApplication(deps, { applicationId }));
};
const lineOf = (c: CreditsDto, code: string) => c.lines.find((l) => l.code === code)!;

describe('leave credits', () => {
  it('counts months and COC lapse dates', () => {
    expect(monthsBetween('2026-09-30', '2026-12-01')).toBe(2);
    expect(monthsBetween('2026-10-31', '2026-11-30')).toBe(1);
    expect(monthsBetween('2026-10-15', '2026-11-25')).toBe(1);
    expect(monthsBetween('2026-12-01', '2026-12-01')).toBe(0);
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2025-12-05', 12)).toBe('2026-12-05');
  });

  it('gives COS staff only CTO and Wellness Leave, and regular staff not those', () => {
    const deps = seededDeps();
    expect(err(file(deps, PEOPLE.cos, 'VL', ['2026-12-07'], { location: 'PH' })).message).toContain('CTO or Wellness');
    expect(err(file(deps, PEOPLE.staff, 'WELLNESS', ['2026-12-07'])).message).toContain('contract of service');
    as(deps, PEOPLE.cos);
    expect(ok(endpoints.api_myCredits(deps, {})).lines.map((l) => l.code)).toEqual(['CTO', 'WELLNESS']);
    as(deps, PEOPLE.staff);
    expect(ok(endpoints.api_myCredits(deps, {})).lines.map((l) => l.code)).toEqual(['VL', 'SL', 'FL', 'SPL']);
  });

  it('allows 5 days of wellness leave a year, counting leave on hold', () => {
    const deps = seededDeps();
    ok(file(deps, PEOPLE.cos, 'WELLNESS', ['2026-12-07', '2026-12-08', '2026-12-09']));
    const e = err(file(deps, PEOPLE.cos, 'WELLNESS', ['2026-12-14', '2026-12-15', '2026-12-16']));
    expect(e.message).toBe('You have 2 days of Wellness Leave left, after 3 on hold in other applications. This application needs 3.');
    ok(file(deps, PEOPLE.cos, 'WELLNESS', ['2026-12-14', '2026-12-15']));
    // Next year starts again at 5.
    ok(file(deps, PEOPLE.cos, 'WELLNESS', ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08']));
  });

  it('builds CTO from recorded COC hours, uses them up, and lets them lapse after a year', () => {
    const deps = seededDeps();
    expect(err(file(deps, PEOPLE.cos, 'CTO', ['2026-12-07'])).message).toContain('0 days of Compensatory Time-Off');
    as(deps, PEOPLE.cos);
    expect(err(endpoints.api_saveCoc(deps, { employeeId: deps.ids.cos, earnedOn: '2026-11-20', hours: 8, reference: 'OT-1' })).code).toBe('FORBIDDEN');
    as(deps, PEOPLE.hr);
    ok(endpoints.api_saveCoc(deps, { employeeId: deps.ids.cos, earnedOn: '2025-11-20', hours: 8, reference: 'Lapsed' }));
    ok(endpoints.api_saveCoc(deps, { employeeId: deps.ids.cos, earnedOn: '2026-11-20', hours: 12, reference: 'OT authority 2026-15' }));
    as(deps, PEOPLE.cos);
    expect(lineOf(ok(endpoints.api_myCredits(deps, {})), 'CTO').available).toBe(1.5);
    expect(err(file(deps, PEOPLE.cos, 'CTO', ['2026-12-07', '2026-12-08'])).code).toBe('VALIDATION');
    const a = ok(file(deps, PEOPLE.cos, 'CTO', ['2026-12-07']));
    approve(deps, a.applicationId);
    as(deps, PEOPLE.cos);
    const cto = lineOf(ok(endpoints.api_myCredits(deps, {})), 'CTO');
    expect([cto.used, cto.available]).toEqual([1, 0.5]);
    as(deps, PEOPLE.hr);
    const entries = ok(endpoints.api_listCoc(deps, { employeeId: deps.ids.cos }));
    expect(entries.map((x) => x.remainingHours)).toEqual([4, 0]);
    ok(endpoints.api_deleteCoc(deps, { entryId: entries[0]!.entryId }));
    as(deps, PEOPLE.cos);
    expect(lineOf(ok(endpoints.api_myCredits(deps, {})), 'CTO').available).toBeLessThanOrEqual(0);
  });

  it('adds 1.25 days of VL and SL a month to the leave card balance and deducts approved leave', () => {
    const deps = seededDeps(); // today is 2026-12-01
    as(deps, PEOPLE.hr);
    const all = ok(endpoints.api_saveCredits(deps, { employeeId: deps.ids.staff, asOf: '2026-09-30', vlBalance: 10, slBalance: 8 }));
    expect(lineOf(all.find((x) => x.employeeId === deps.ids.staff)!, 'VL').earned).toBe(12.5);
    const a = ok(file(deps, PEOPLE.staff, 'VL', ['2026-12-07', '2026-12-08'], { location: 'PH' }));
    as(deps, PEOPLE.staff);
    let vl = lineOf(ok(endpoints.api_myCredits(deps, {})), 'VL');
    expect([vl.onHold, vl.available]).toEqual([2, 10.5]);
    approve(deps, a.applicationId);
    as(deps, PEOPLE.staff);
    vl = lineOf(ok(endpoints.api_myCredits(deps, {})), 'VL');
    expect([vl.used, vl.onHold, vl.available]).toEqual([2, 0, 10.5]);
    expect(err(file(deps, PEOPLE.staff, 'SPL', ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17'], { location: 'PH' })).message).toContain('3 days of Special Privilege Leave');
  });

  it('shows everyone’s credits only to HR, admins and the Supervising AO', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.staff);
    expect(err(endpoints.api_listCredits(deps, {})).code).toBe('FORBIDDEN');
    as(deps, PEOPLE.ao);
    expect(ok(endpoints.api_listCredits(deps, {})).length).toBeGreaterThan(5);
  });
});
