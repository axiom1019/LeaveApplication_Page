import { describe, expect, it } from 'vitest';
import { leaveDays, mondayOf, scheduleOn } from './schedule';

describe('schedules over time', () => {
  const changes = [{ from: '2026-12-07', schedule: 'COMPRESSED' as const }, { from: '2026-12-14', schedule: 'STANDARD' as const }];
  it('uses the schedule in force on each date', () => {
    expect(scheduleOn('STANDARD', changes, '2026-12-04')).toBe('STANDARD');
    expect(scheduleOn('STANDARD', changes, '2026-12-10')).toBe('COMPRESSED');
    expect(scheduleOn('STANDARD', changes, '2026-12-18')).toBe('STANDARD');
    expect(mondayOf('2026-12-10')).toBe('2026-12-07');
    expect(mondayOf('2026-12-13')).toBe('2026-12-07');
  });
  it('counts a compressed week (Fri off, 1.25 a day) and a skeletal week (Fri on, 1 a day) in one leave', () => {
    // Thu 10 and Fri 11 (compressed week: Fri off), Thu 17 and Fri 18 (skeletal week).
    const r = leaveDays(['2026-12-10', '2026-12-11', '2026-12-17', '2026-12-18'], new Set(), 'STANDARD', changes, ['2026-12-18']);
    expect(r.workDates).toEqual(['2026-12-10', '2026-12-17', '2026-12-18']);
    expect(r.workingDays).toBe(2.5);
    expect(r.creditDays).toBe(2.75);
    expect(r.hours).toBe(22);
  });
});
