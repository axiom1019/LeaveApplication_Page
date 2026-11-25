import { describe, expect, it } from 'vitest';
import { countWorkingDays, formatInclusiveDates, manilaDate } from './dates';

describe('dates', () => {
  it('formats inclusive dates compactly', () => {
    expect(formatInclusiveDates(['2026-12-01', '2026-12-02', '2026-12-03', '2026-12-05'])).toBe('Dec 1–3, 5, 2026');
    expect(formatInclusiveDates(['2026-11-30', '2026-12-01'])).toBe('Nov 30–Dec 1, 2026');
    expect(formatInclusiveDates(['2026-12-03', '2026-12-01'])).toBe('Dec 1, 3, 2026');
    expect(formatInclusiveDates(['2026-12-31', '2027-01-01'])).toBe('Dec 31, 2026 – Jan 1, 2027');
    expect(formatInclusiveDates(['2026-11-03', '2026-12-04'])).toBe('Nov 3, Dec 4, 2026');
  });
  it('counts working days', () => {
    expect(countWorkingDays(['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'], new Set())).toBe(2);
    expect(countWorkingDays(['2026-12-25'], new Set(['2026-12-25']))).toBe(0);
  });
  it('uses the Manila calendar day', () => {
    expect(manilaDate(Date.UTC(2026, 11, 1, 16, 30))).toBe('2026-12-02');
  });
});
