import type { CreditsDto } from '@shared/api';
import { formatLongDate } from '@shared/dates';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

/** A person's leave credits, in working days. */
export function CreditsTable({ credits }: { credits: CreditsDto }) {
  return (
    <div className="table-wrap">
      <table className="grid stack credits">
        <thead>
          <tr>
            <th>Leave</th>
            <th className="num">Earned</th>
            <th className="num">Used</th>
            <th className="num">On hold</th>
            <th className="num">Available</th>
          </tr>
        </thead>
        <tbody>
          {credits.lines.map((l) => (
            <tr key={l.code}>
              <td>
                <div>{l.label}</div>
                <div className="cell-sub">{l.note}</div>
              </td>
              <td className="num" data-label="Earned">{fmt(l.earned)}</td>
              <td className="num" data-label="Used">{fmt(l.used)}</td>
              <td className="num" data-label="On hold">{fmt(l.onHold)}</td>
              <td className="num" data-label="Available">
                <b className={l.available <= 0 ? 'neg' : undefined}>{fmt(l.available)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function creditsCaption(c: CreditsDto): string {
  if (c.employmentType === 'COS') return 'CTO comes from the overtime credits (COC) HR records. Wellness leave is 5 days a year.';
  return c.asOf ? `From the leave card balance as of ${formatLongDate(c.asOf)}, plus monthly earnings, less approved leave.` : 'HR has not entered your balance from the leave card yet.';
}
