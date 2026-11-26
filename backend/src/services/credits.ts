/*
 * Leave credits: what each person has left.
 *
 * Regular staff: HR enters the VL and SL balance from the leave card with an "as of" date. The
 * app adds 1.25 days of each for every month since, and deducts approved leave dated after it.
 * Forced leave (taken from VL) and special privilege leave have yearly allowances.
 * Everyone: CTO from the COCs HR records (hours, 8 to a day, lapsing after a year, oldest used
 * first). Everyone also gets 5 days of wellness leave a year.
 * Leave that is filed but not yet decided is shown "on hold" and already counts against what is
 * available, so nobody files the same days twice.
 */
import type { CocDto, CreditLine, CreditsDto } from '@shared/api';
import { CREDIT_RULES } from '@shared/leaveTypes';
import type { Db, Deps } from '../platform/types';
import { audit } from './audit';
import { requireRole, type Caller } from './auth';
import { AppError } from './errors';
import { fullName, loadDivisions, loadEmployees, loadScheduleChanges, toApplication, toEmployee, type Application, type Division, type Employee } from './model';
import { formatLongDate, manilaDate } from '@shared/dates';

const round = (n: number) => Math.round(n * 1000) / 1000;
const ON_HOLD = new Set(['PENDING', 'FOR_FILING']);

/** Same day `months` later (clamped to the month's last day). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** How many month-ends fall on or before `iso`. */
const monthEndsUpTo = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return y * 12 + m - (d >= lastDay(y, m) ? 0 : 1);
};

/** Months of credit earned after `from` up to `to`: leave credits are earned at the end of each month. */
export function monthsBetween(from: string, to: string): number {
  if (!from || to <= from) return 0;
  return Math.max(0, monthEndsUpTo(to) - monthEndsUpTo(from));
}

interface CocEntry {
  entryId: string;
  employeeId: string;
  earnedOn: string;
  hours: number;
  reference: string;
}

function cocEntries(db: Db, employeeId: string): CocEntry[] {
  return db
    .readAll('CocEntries')
    .filter((r) => r.employee_id === employeeId && !r.deleted_at)
    .map((r) => ({ entryId: r.entry_id, employeeId: r.employee_id, earnedOn: r.earned_on, hours: Number(r.hours) || 0, reference: r.reference }))
    .sort((a, b) => a.earnedOn.localeCompare(b.earnedOn) || a.entryId.localeCompare(b.entryId));
}

/**
 * Applies approved CTO to COCs, oldest first, using only COCs earned on or before the leave and
 * not yet lapsed on it. Returns each entry's remaining hours.
 */
function cocRemaining(entries: CocEntry[], approvedCto: Application[]): Map<string, number> {
  const earned = entries.filter((e) => e.hours > 0);
  const left = new Map(earned.map((e) => [e.entryId, e.hours]));
  // HR's manual deductions (negative entries) are used up the same way as approved CTO.
  const uses = [
    ...approvedCto.map((a) => ({ date: a.dates[0] ?? '', hours: ctoHours(a) })),
    ...entries.filter((e) => e.hours < 0).map((e) => ({ date: e.earnedOn, hours: -e.hours })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  for (const u of uses) {
    let need = u.hours;
    for (const e of earned) {
      if (need <= 0) break;
      if (e.earnedOn > u.date || addMonths(e.earnedOn, CREDIT_RULES.cocLapseMonths) <= u.date) continue;
      const take = Math.min(need, left.get(e.entryId) ?? 0);
      left.set(e.entryId, (left.get(e.entryId) ?? 0) - take);
      need -= take;
    }
  }
  return left;
}

/** Hours HR deducted by hand (CTO taken outside the app, corrections). */
const deductedHours = (entries: CocEntry[]) => entries.filter((e) => e.hours < 0).reduce((n, e) => n - e.hours, 0);

const days = (apps: Application[]) => apps.reduce((n, a) => n + a.workingDays, 0);
/** VL/SL credit taken: working days x workday hours / 8 (1.25 a day on a compressed week). */
const creditDays = (apps: Application[]) => apps.reduce((n, a) => n + a.creditDays, 0);

export interface TardinessEntry {
  entryId: string;
  employeeId: string;
  month: string;
  minutes: number;
  remarks: string;
}

function tardinessEntries(db: Db, employeeId: string): TardinessEntry[] {
  return db
    .readAll('Tardiness')
    .filter((r) => r.employee_id === employeeId && !r.deleted_at)
    .map((r) => ({ entryId: r.entry_id, employeeId: r.employee_id, month: r.month, minutes: Number(r.minutes) || 0, remarks: r.remarks }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.entryId.localeCompare(b.entryId));
}

/** Late and undertime in days of VL: hours / 8 + minutes / 8 / 60 (the office's calculator, CSC MC No. 16, s. 2010). */
export const tardinessDays = (minutes: number) => round(minutes / 60 / 8);
/** Hours of COC a CTO application uses: the hours the applicant chose, or whole days for older ones. */
export const ctoHours = (a: Application) => a.details.hours ?? a.workingDays * CREDIT_RULES.hoursPerDay;
const hoursOf = (apps: Application[]) => apps.reduce((n, a) => n + ctoHours(a), 0);

function line(code: CreditLine['code'], label: string, earned: number, used: number, onHold: number, note = ''): CreditLine {
  return { code, label, earned: round(earned), used: round(used), onHold: round(onHold), available: round(earned - used - onHold), note };
}

/** One person's credits table, as of `today`. */
export function creditsFor(db: Db, e: Employee, divisions: Map<string, Division>, today: string, allApps?: Application[]): CreditsDto {
  const apps = (allApps ?? db.readAll('Applications').map(toApplication)).filter((a) => a.applicantId === e.employeeId);
  const approved = apps.filter((a) => a.status === 'APPROVED');
  const held = apps.filter((a) => ON_HOLD.has(a.status));
  const year = today.slice(0, 4);
  const inYear = (a: Application) => (a.dates[0] ?? a.filedOn).slice(0, 4) === year;
  const of = (list: Application[], ...codes: string[]) => list.filter((a) => codes.includes(a.leaveType));
  const row = db.findOne('LeaveCredits', 'employee_id', e.employeeId);
  const asOf = row?.as_of ?? '';
  const vlBalance = Number(row?.vl_balance) || 0;
  const slBalance = Number(row?.sl_balance) || 0;
  const lines: CreditLine[] = [];

  // CTO: anyone can earn COC, regular and COS staff alike.
  const entries = cocEntries(db, e.employeeId);
  const left = cocRemaining(entries, of(approved, 'CTO'));
  const liveHours = entries.filter((x) => x.hours > 0 && addMonths(x.earnedOn, CREDIT_RULES.cocLapseMonths) > today).reduce((n, x) => n + (left.get(x.entryId) ?? 0), 0);
  const usedHours = hoursOf(of(approved, 'CTO')) + deductedHours(entries);
  const h = CREDIT_RULES.hoursPerDay;
  // "Earned" is what is still usable plus what was used, so earned − used = unexpired COC left.
  const ctoLine = line('CTO', 'Compensatory Time-Off (CTO)', (liveHours + usedHours) / h, usedHours / h, hoursOf(of(held, 'CTO')) / h, `${round(liveHours)} hours of unexpired COC left (${h} hours = 1 day). COCs lapse ${CREDIT_RULES.cocLapseMonths} months after they are earned.`);

  const wellnessLine = line('WELLNESS', 'Wellness Leave', CREDIT_RULES.wellnessDays, days(of(approved, 'WELLNESS').filter(inYear)), days(of(held, 'WELLNESS').filter(inYear)), `${CREDIT_RULES.wellnessDays} days for ${year}, not carried over`);

  if (e.employmentType === 'COS') {
    lines.push(
      ctoLine,
      wellnessLine,
    );
  } else {
    const months = asOf ? monthsBetween(asOf, today) : 0;
    const after = (a: Application) => !asOf || (a.dates[0] ?? '') > asOf;
    const noRecord = 'HR has not entered the balance from the leave card yet';
    // Late and undertime HR recorded for months after the leave card date come off VL.
    const asOfMonth = asOf.slice(0, 7);
    const lateDays = round(tardinessEntries(db, e.employeeId).filter((t) => !asOf || t.month > asOfMonth).reduce((n, t) => n + tardinessDays(t.minutes), 0));
    const compressedAny = e.workSchedule === 'COMPRESSED' || (loadScheduleChanges(db, e.employeeId).get(e.employeeId) ?? []).some((c) => c.schedule === 'COMPRESSED');
    const perDay = compressedAny ? ' On a compressed week each leave day takes 1.25 (half day 0.625).' : '';
    const earning = (bal: number) => (asOf ? `${bal} as of ${formatLongDate(asOf)}, plus ${CREDIT_RULES.monthlyAccrual} a month (${months} month${months === 1 ? '' : 's'})` : noRecord);
    lines.push(
      line('VL', 'Vacation Leave', asOf ? vlBalance + months * CREDIT_RULES.monthlyAccrual : 0, creditDays(of(approved, 'VL', 'FL').filter(after)) + lateDays, creditDays(of(held, 'VL', 'FL').filter(after)), `${earning(vlBalance)}. Includes forced leave${lateDays ? ` and ${lateDays} day${lateDays === 1 ? '' : 's'} for late and undertime` : ''}.${perDay}`),
      line('SL', 'Sick Leave', asOf ? slBalance + months * CREDIT_RULES.monthlyAccrual : 0, creditDays(of(approved, 'SL').filter(after)), creditDays(of(held, 'SL').filter(after)), `${earning(slBalance)}.${perDay}`),
      line('FL', 'Mandatory/Forced Leave', CREDIT_RULES.forcedLeaveDays, creditDays(of(approved, 'FL').filter(inYear)), creditDays(of(held, 'FL').filter(inYear)), `${CREDIT_RULES.forcedLeaveDays} days to take in ${year}, taken from vacation leave`),
      line('SPL', 'Special Privilege Leave', CREDIT_RULES.splDays, days(of(approved, 'SPL').filter(inYear)), days(of(held, 'SPL').filter(inYear)), `${CREDIT_RULES.splDays} days for ${year}, not carried over`),
    );
    if (e.soloParent) {
      lines.push(line('SOLO', 'Solo Parent Leave', CREDIT_RULES.soloParentDays, days(of(approved, 'SOLO').filter(inYear)), days(of(held, 'SOLO').filter(inYear)), `${CREDIT_RULES.soloParentDays} days for ${year} (RA 8972), not carried over`));
    }
    lines.push(wellnessLine, ctoLine);
  }
  return {
    employeeId: e.employeeId,
    employeeName: fullName(e),
    divisionName: divisions.get(e.divisionId)?.name ?? '',
    employmentType: e.employmentType,
    asOf,
    vlBalance,
    slBalance,
    lines,
  };
}

const today = (deps: Deps) => manilaDate(deps.nowMs());

export function myCredits(deps: Deps, c: Caller): CreditsDto {
  const db = deps.db.get();
  const e = loadEmployees(db).get(c.employee.employeeId) ?? c.employee;
  return creditsFor(db, e, loadDivisions(db), today(deps));
}

/** HR and the administrator see and change everyone's credits; the Supervising AO may look (for 7.A) but not change them. */
const canView = (c: Caller) => requireRole(c, 'HR', 'ADMIN', 'SUPERVISING_AO');
const canManage = (c: Caller) => requireRole(c, 'HR', 'ADMIN');

export function listCredits(deps: Deps, c: Caller): CreditsDto[] {
  canView(c);
  const db = deps.db.get();
  const divisions = loadDivisions(db);
  const apps = db.readAll('Applications').map(toApplication);
  const t = today(deps);
  return [...loadEmployees(db).values()]
    .filter((e) => e.isActive)
    .map((e) => creditsFor(db, e, divisions, t, apps))
    .sort((a, b) => a.divisionName.localeCompare(b.divisionName) || a.employeeName.localeCompare(b.employeeName));
}

export function saveCredits(deps: Deps, c: Caller, input: { employeeId: string; asOf: string; vlBalance: number; slBalance: number }): CreditsDto[] {
  canManage(c);
  deps.lock.run(() => {
    const db = deps.db.get();
    if (!db.findOne('Employees', 'employee_id', input.employeeId)) throw new AppError('NOT_FOUND', 'Employee not found.');
    const row = { employee_id: input.employeeId, as_of: input.asOf, vl_balance: String(input.vlBalance), sl_balance: String(input.slBalance), updated_by: c.employee.employeeId, updated_at: new Date(deps.nowMs()).toISOString() };
    if (db.findOne('LeaveCredits', 'employee_id', input.employeeId)) db.replace('LeaveCredits', input.employeeId, row);
    else db.append('LeaveCredits', row);
    audit(deps, c.employee.employeeId, c.email, 'SAVE_CREDITS', input.employeeId, input);
  });
  return listCredits(deps, c);
}

export function listCoc(deps: Deps, c: Caller, employeeId: string): CocDto[] {
  canView(c);
  const db = deps.db.get();
  const entries = cocEntries(db, employeeId);
  const approvedCto = db.readAll('Applications').map(toApplication).filter((a) => a.applicantId === employeeId && a.leaveType === 'CTO' && a.status === 'APPROVED');
  const left = cocRemaining(entries, approvedCto);
  const t = today(deps);
  return entries
    .map((e) => {
      if (e.hours < 0) return { ...e, kind: 'DEDUCTED' as const, hours: -e.hours, expiresOn: '', remainingHours: 0 };
      const expiresOn = addMonths(e.earnedOn, CREDIT_RULES.cocLapseMonths);
      return { ...e, kind: 'EARNED' as const, expiresOn, remainingHours: expiresOn > t ? round(left.get(e.entryId) ?? 0) : 0 };
    })
    .reverse();
}

/** HR adds COC earned (overtime) or deducts hours (CTO taken outside the app, corrections). */
export function saveCoc(deps: Deps, c: Caller, input: { employeeId: string; earnedOn: string; hours: number; reference: string; kind?: 'EARNED' | 'DEDUCTED' }): CocDto[] {
  canManage(c);
  deps.lock.run(() => {
    const db = deps.db.get();
    const e = db.findOne('Employees', 'employee_id', input.employeeId);
    if (!e) throw new AppError('NOT_FOUND', 'Employee not found.');
    const deduct = input.kind === 'DEDUCTED';
    if (input.earnedOn > today(deps)) {
      throw new AppError('VALIDATION', deduct ? 'The date is in the future.' : 'The COC date is in the future.', { fields: { earnedOn: deduct ? 'Use the date the CTO was taken' : 'Use the date the overtime was rendered' } });
    }
    if (deduct) {
      const emp = toEmployee(e);
      const cto = creditsFor(db, emp, loadDivisions(db), today(deps)).lines.find((l) => l.code === 'CTO');
      const leftHours = round(Math.max(0, cto?.available ?? 0) * CREDIT_RULES.hoursPerDay);
      if (input.hours > leftHours + 1e-9) {
        const msg = `Only ${leftHours} hours of CTO are left to deduct.`;
        throw new AppError('VALIDATION', msg, { fields: { hours: msg } });
      }
    }
    const entryId = deps.uuid();
    db.append('CocEntries', {
      entry_id: entryId,
      employee_id: input.employeeId,
      earned_on: input.earnedOn,
      hours: String(deduct ? -input.hours : input.hours),
      reference: input.reference,
      created_by: c.employee.employeeId,
      created_at: new Date(deps.nowMs()).toISOString(),
      deleted_at: '',
    });
    audit(deps, c.employee.employeeId, c.email, deduct ? 'DEDUCT_CTO' : 'ADD_COC', input.employeeId, { entryId, ...input });
  });
  return listCoc(deps, c, input.employeeId);
}

export function deleteCoc(deps: Deps, c: Caller, entryId: string): CocDto[] {
  canManage(c);
  const employeeId = deps.lock.run(() => {
    const db = deps.db.get();
    const r = db.findOne('CocEntries', 'entry_id', entryId);
    if (!r || r.deleted_at) throw new AppError('NOT_FOUND', 'COC entry not found.');
    db.replace('CocEntries', entryId, { ...r, deleted_at: new Date(deps.nowMs()).toISOString() });
    audit(deps, c.employee.employeeId, c.email, 'DELETE_COC', r.employee_id, { entryId, earnedOn: r.earned_on, hours: r.hours, reference: r.reference });
    return r.employee_id;
  });
  return listCoc(deps, c, employeeId);
}

// ---------------------------------------------------------------- late and undertime

export function listTardiness(deps: Deps, c: Caller, employeeId: string): (TardinessEntry & { days: number })[] {
  canView(c);
  return tardinessEntries(deps.db.get(), employeeId).map((t) => ({ ...t, days: tardinessDays(t.minutes) }));
}

/** HR records a month's total late and undertime for a person; it is deducted from VL. */
export function saveTardiness(deps: Deps, c: Caller, input: { employeeId: string; month: string; minutes: number; remarks?: string }) {
  canManage(c);
  deps.lock.run(() => {
    const db = deps.db.get();
    const e = db.findOne('Employees', 'employee_id', input.employeeId);
    if (!e) throw new AppError('NOT_FOUND', 'Employee not found.');
    if (toEmployee(e).employmentType === 'COS') throw new AppError('VALIDATION', 'Late and undertime are deducted from VL, which COS staff do not have.');
    if (input.month > today(deps).slice(0, 7)) throw new AppError('VALIDATION', 'That month has not come yet.', { fields: { month: 'Choose this month or an earlier one' } });
    const entryId = deps.uuid();
    db.append('Tardiness', {
      entry_id: entryId,
      employee_id: input.employeeId,
      month: input.month,
      minutes: String(input.minutes),
      remarks: input.remarks ?? '',
      created_by: c.employee.employeeId,
      created_at: new Date(deps.nowMs()).toISOString(),
      deleted_at: '',
    });
    audit(deps, c.employee.employeeId, c.email, 'ADD_TARDINESS', input.employeeId, { entryId, ...input, days: tardinessDays(input.minutes) });
  });
  return listTardiness(deps, c, input.employeeId);
}

export function deleteTardiness(deps: Deps, c: Caller, entryId: string) {
  canManage(c);
  const employeeId = deps.lock.run(() => {
    const db = deps.db.get();
    const r = db.findOne('Tardiness', 'entry_id', entryId);
    if (!r || r.deleted_at) throw new AppError('NOT_FOUND', 'Entry not found.');
    db.replace('Tardiness', entryId, { ...r, deleted_at: new Date(deps.nowMs()).toISOString() });
    audit(deps, c.employee.employeeId, c.email, 'DELETE_TARDINESS', r.employee_id, { entryId, month: r.month, minutes: r.minutes });
    return r.employee_id;
  });
  return listTardiness(deps, c, employeeId);
}
