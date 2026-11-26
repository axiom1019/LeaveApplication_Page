/*
 * Work schedules over time. A person's schedule can change from one week to the next (skeletal
 * this week, compressed the next). HR records each change with the Monday it starts; until a
 * change, the person's usual schedule (set under People) applies. Each leave date is counted by
 * the schedule in force on that date.
 */
import { WORK_SCHEDULE_INFO, creditPerDay, type WorkSchedule } from './constants';
import { normalizeDates, weekday } from './dates';

export interface ScheduleChange {
  /** Monday the schedule starts. */
  from: string;
  schedule: WorkSchedule;
}

export function scheduleOn(usual: WorkSchedule, changes: readonly ScheduleChange[], date: string): WorkSchedule {
  let s = usual;
  let at = '';
  for (const c of changes) if (c.from <= date && c.from >= at) (s = c.schedule), (at = c.from);
  return s;
}

/** Monday of the week `date` falls in. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function isWorkday(usual: WorkSchedule, changes: readonly ScheduleChange[], date: string): boolean {
  return WORK_SCHEDULE_INFO[scheduleOn(usual, changes, date)].weekdays.includes(weekday(date));
}

/**
 * Days applied for under the schedule in force on each date: days off and holidays are left out,
 * half days count 0.5. creditDays is the VL/SL credit taken (1.25 a day on a compressed week),
 * hours the most CTO hours the days can hold.
 */
export function leaveDays(
  dates: readonly string[],
  holidays: ReadonlySet<string>,
  usual: WorkSchedule,
  changes: readonly ScheduleChange[],
  halfDays: readonly string[] = [],
): { workDates: string[]; workingDays: number; creditDays: number; hours: number; compressed: boolean } {
  const half = new Set(halfDays);
  const workDates = normalizeDates(dates).filter((d) => !holidays.has(d) && isWorkday(usual, changes, d));
  let workingDays = 0;
  let creditDays = 0;
  let hours = 0;
  let compressed = false;
  for (const d of workDates) {
    const s = scheduleOn(usual, changes, d);
    const part = half.has(d) ? 0.5 : 1;
    workingDays += part;
    creditDays += part * creditPerDay(s);
    hours += part * WORK_SCHEDULE_INFO[s].hours;
    if (s === 'COMPRESSED') compressed = true;
  }
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { workDates, workingDays: r(workingDays), creditDays: r(creditDays), hours: r(hours), compressed };
}
