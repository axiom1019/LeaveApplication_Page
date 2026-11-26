import { useState } from 'react';
import type { WeekScheduleRow } from '@shared/api';
import { WORK_SCHEDULE_INFO, type WorkSchedule } from '@shared/constants';
import { addDays, formatLongDate } from '@shared/dates';
import { mondayOf } from '@shared/schedule';
import { api, errorText } from '../api/client';
import { Loading, useLoad, useToast } from '../components/ui';
import { useSession } from '../session';

const SHORT: Record<WorkSchedule, string> = { STANDARD: 'Skeletal (8 h, Mon–Fri)', COMPRESSED: 'Compressed (10 h, Mon–Thu)' };

/** HR sets who works skeletal or compressed, week by week. A change lasts until the next one. */
export function SchedulesPage() {
  const { boot } = useSession();
  const toast = useToast();
  const [week, setWeek] = useState(() => mondayOf(boot.today));
  const list = useLoad(() => api('api_weekSchedules', { week }), [week]);
  const [edits, setEdits] = useState<Record<string, WorkSchedule>>({});
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = (list.data ?? []).filter((r) => !q || `${r.employeeName} ${r.divisionName}`.toLowerCase().includes(q.toLowerCase()));
  const current = (r: WeekScheduleRow) => edits[r.employeeId] ?? r.schedule;
  const changed = (list.data ?? []).filter((r) => edits[r.employeeId] && edits[r.employeeId] !== r.schedule);
  const go = (n: number) => {
    setEdits({});
    setWeek(addDays(week, n * 7));
  };
  const setAll = (s: WorkSchedule) => setEdits(Object.fromEntries(rows.map((r) => [r.employeeId, s])));

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      list.setData(await api('api_saveWeekSchedules', { week, changes: changed.map((r) => ({ employeeId: r.employeeId, schedule: edits[r.employeeId]! })) }));
      setEdits({});
      toast(`Saved ${changed.length} schedule${changed.length === 1 ? '' : 's'} from ${formatLongDate(week)}.`);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Work schedules</h1>
          <p>
            Who works skeletal or compressed, week by week. A change starts on the Monday of the week shown and stays until you change it again. Leave days
            are counted by the schedule of their week: a compressed-week day takes 1.25 of VL/SL, and its Friday is a day off.
          </p>
        </div>
      </div>
      <div className="filters" style={{ alignItems: 'center' }}>
        <button className="btn" style={{ minWidth: 0 }} onClick={() => go(-1)} aria-label="Previous week">
          ‹
        </button>
        <b style={{ minWidth: 220, textAlign: 'center' }}>
          Week of {formatLongDate(week)} – {formatLongDate(addDays(week, 4))}
        </b>
        <button className="btn" style={{ minWidth: 0 }} onClick={() => go(1)} aria-label="Next week">
          ›
        </button>
        <input type="text" placeholder="Search name or division" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      {err && <div className="form-err">{err}</div>}
      {list.data ? (
        <>
          <div className="actions" style={{ marginBottom: 12 }}>
            <button className="btn" onClick={() => setAll('STANDARD')}>
              Set all shown to skeletal
            </button>
            <button className="btn" onClick={() => setAll('COMPRESSED')}>
              Set all shown to compressed
            </button>
          </div>
          <div className="card table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>This week</th>
                  <th>Usual</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td>
                      <b>{r.employeeName}</b>
                      <div className="small muted">{r.divisionName}</div>
                    </td>
                    <td>
                      <select
                        value={current(r)}
                        onChange={(e) => setEdits({ ...edits, [r.employeeId]: e.target.value as WorkSchedule })}
                        aria-label={`Schedule of ${r.employeeName} this week`}
                        style={{ maxWidth: 260 }}
                      >
                        {(Object.keys(WORK_SCHEDULE_INFO) as WorkSchedule[]).map((s) => (
                          <option key={s} value={s}>
                            {SHORT[s]}
                          </option>
                        ))}
                      </select>
                      {edits[r.employeeId] && edits[r.employeeId] !== r.schedule && <div className="small" style={{ color: 'var(--warn)' }}>Not saved yet</div>}
                    </td>
                    <td className="small muted">{SHORT[r.usual]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn" disabled={!changed.length || busy} onClick={() => setEdits({})}>
              Undo changes
            </button>
            <button className="btn primary" disabled={!changed.length || busy} onClick={() => void save()}>
              {busy ? 'Saving…' : `Save ${changed.length || ''} change${changed.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      ) : (
        <Loading error={list.error} />
      )}
    </>
  );
}
