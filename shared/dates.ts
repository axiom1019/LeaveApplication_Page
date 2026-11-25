import { MANILA_OFFSET_MS } from './constants';

/** Dates travel and are stored as 'YYYY-MM-DD' (Manila calendar days). Timestamps are ISO UTC. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Manila calendar date for an instant. */
export function manilaDate(ms: number): string {
  return new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD HH:mm' in Manila time. */
export function manilaDateTime(ms: number): string {
  const s = new Date(ms + MANILA_OFFSET_MS).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isWeekend = (iso: string) => {
  const w = weekday(iso);
  return w === 0 || w === 6;
};

/** Sorted, de-duplicated. */
export function normalizeDates(dates: readonly string[]): string[] {
  return [...new Set(dates)].sort();
}

/** Working days among the chosen dates: weekends and listed holidays are left out. */
export function countWorkingDays(dates: readonly string[], holidays: ReadonlySet<string>): number {
  return normalizeDates(dates).filter((d) => !isWeekend(d) && !holidays.has(d)).length;
}

/** Every calendar day from start to end inclusive. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

/**
 * Compact inclusive dates for the form, e.g. "Dec 1–3, 5, 2026" or "Dec 29, 2026 – Jan 2, 2027".
 * Consecutive calendar days (including weekends between them) are joined into one range.
 */
export function formatInclusiveDates(dates: readonly string[]): string {
  const list = normalizeDates(dates);
  if (!list.length) return '';
  const runs: [string, string][] = [];
  for (const d of list) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d;
    else runs.push([d, d]);
  }
  const parts = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { y: y as number, m: (m as number) - 1, d: d as number };
  };
  // Group runs by year, then by month inside a year.
  const byYear = new Map<number, [string, string][]>();
  for (const r of runs) {
    const y = parts(r[0]).y;
    if (parts(r[1]).y !== y) {
      // A run that crosses the year is written out in full.
      byYear.set(-runs.indexOf(r) - 1, [r]);
      continue;
    }
    byYear.set(y, [...(byYear.get(y) ?? []), r]);
  }
  const out: string[] = [];
  for (const [y, rs] of byYear) {
    if (y < 0) {
      const [a, b] = rs[0] as [string, string];
      const pa = parts(a);
      const pb = parts(b);
      out.push(`${MON[pa.m]} ${pa.d}, ${pa.y} – ${MON[pb.m]} ${pb.d}, ${pb.y}`);
      continue;
    }
    let text = '';
    let month = -1;
    for (const [a, b] of rs) {
      const pa = parts(a);
      const pb = parts(b);
      const sameMonth = pa.m === pb.m;
      let piece: string;
      if (pa.m !== month) {
        piece = `${MON[pa.m]} ${pa.d}`;
        month = pa.m;
      } else piece = `${pa.d}`;
      if (a !== b) {
        piece += sameMonth ? `–${pb.d}` : `–${MON[pb.m]} ${pb.d}`;
        month = pb.m;
      }
      text += text ? `, ${piece}` : piece;
    }
    out.push(`${text}, ${y}`);
  }
  return out.join('; ');
}
