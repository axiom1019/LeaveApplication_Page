import { useState } from 'react';
import { dateRange, normalizeDates, weekday } from '@shared/dates';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Pick inclusive dates. Click a day to add or remove it; Shift-click (or use "Select range")
 * to add every day from the last one picked. Days off (weekends, or Fridays on a compressed week) and holidays are shown but not counted.
 */
export function DatePicker(props: { value: string[]; onChange: (v: string[]) => void; holidays: Map<string, string>; today: string; isWorkday?: (d: string) => boolean }) {
  const isOff = (d: string) => (props.isWorkday ? !props.isWorkday(d) : weekday(d) === 0 || weekday(d) === 6);
  const [month, setMonth] = useState(() => (props.value[0] ?? props.today).slice(0, 7));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const selected = new Set(props.value);

  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = `${month}-01`;
  const startDow = new Date(`${first}T00:00:00Z`).getUTCDay();
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };

  const click = (d: string, withShift: boolean) => {
    if ((withShift || rangeMode) && anchor) {
      const [a, b] = anchor < d ? [anchor, d] : [d, anchor];
      // A range adds working days only; weekends and holidays inside it stay out.
      const add = dateRange(a, b).filter((x) => !isOff(x) && !props.holidays.has(x));
      props.onChange(normalizeDates([...props.value, ...add]));
      setAnchor(null);
      setRangeMode(false);
      return;
    }
    if (selected.has(d)) props.onChange(props.value.filter((x) => x !== d));
    else props.onChange(normalizeDates([...props.value, d]));
    setAnchor(d);
  };

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <b aria-live="polite">
          {MONTHS[m - 1]} {y}
        </b>
        <button type="button" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <button key={`e${i}`} type="button" className="cal-day" disabled aria-hidden="true" tabIndex={-1} />;
          const hol = props.holidays.get(d);
          const cls = ['cal-day', isOff(d) ? 'off' : '', hol ? 'hol' : '', selected.has(d) ? 'sel' : '', d === props.today ? 'today' : ''].join(' ');
          return (
            <button
              key={d}
              type="button"
              className={cls}
              aria-pressed={selected.has(d)}
              title={hol ?? (isOff(d) ? 'Day off' : undefined)}
              aria-label={`${d}${hol ? `, holiday: ${hol}` : ''}`}
              onClick={(e) => click(d, e.shiftKey)}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i style={{ background: 'var(--navy)' }} />
          Picked
        </span>
        <span>
          <i style={{ background: 'var(--red-soft)', border: '1px solid #f3c2c2' }} />
          Holiday
        </span>
        <span>
          <i style={{ background: '#f1f5f9', border: '1px solid var(--line)' }} />
          Day off
        </span>
      </div>
      <div className="actions" style={{ marginTop: 8 }}>
        <button type="button" className="btn" disabled={!anchor} onClick={() => setRangeMode(true)} aria-pressed={rangeMode}>
          {rangeMode ? 'Now click the last day' : 'Select range from last picked day'}
        </button>
        {props.value.length > 0 && (
          <button type="button" className="btn" onClick={() => props.onChange([])}>
            Clear dates
          </button>
        )}
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>
        Click a day to pick it, or click a start day and Shift-click the end day to pick every working day in between.
      </p>
    </div>
  );
}
