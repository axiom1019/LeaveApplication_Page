import { useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { CocDto, CreditsDto } from '@shared/api';
import { formatLongDate } from '@shared/dates';
import { api, errorText, fieldErrors } from '../api/client';
import { CreditsTable, creditsCaption } from '../components/CreditsTable';
import { Field, Loading, Modal, useLoad } from '../components/ui';
import { useSession } from '../session';

const avail = (c: CreditsDto, code: string) => c.lines.find((l) => l.code === code)?.available;
const cell = (n: number | undefined) =>
  n === undefined ? '' : <span className={n <= 0 ? 'neg' : undefined}>{Number.isInteger(n) ? n : n.toFixed(3).replace(/0+$/, '')}</span>;

/** HR and administrators see and change every active employee's leave credits; the Supervising AO only looks. */
export function CreditsPage() {
  const list = useLoad(() => api('api_listCredits'));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<CreditsDto | null>(null);
  const rows = (list.data ?? []).filter((c) => !q || `${c.employeeName} ${c.divisionName}`.toLowerCase().includes(q.toLowerCase()));
  const regular = rows.filter((c) => c.employmentType !== 'COS');
  const cos = rows.filter((c) => c.employmentType === 'COS');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Leave credits</h1>
          <p>
            Available leave for every staff member, in working days. Enter each regular employee's balance from the leave card once; the app adds 1.25 days of
            VL and SL a month and deducts approved leave. Record approved COCs (overtime) for anyone, regular or COS, to give them CTO.
          </p>
        </div>
      </div>
      <div className="filters">
        <input type="text" placeholder="Search name or division" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </div>
      {!list.data ? (
        <Loading error={list.error} />
      ) : (
        <>
          <div className="section-title">Regular staff</div>
          <div className="card table-wrap" style={{ marginBottom: 24 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Vacation</th>
                  <th className="num">Sick</th>
                  <th className="num">Forced</th>
                  <th className="num">Special privilege</th>
                  <th className="num">CTO</th>
                  <th>Leave card as of</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {regular.map((c) => (
                  <tr key={c.employeeId}>
                    <td>
                      <b>{c.employeeName}</b>
                      <div className="small muted">{c.divisionName}</div>
                    </td>
                    <td className="num">{c.asOf ? cell(avail(c, 'VL')) : <span className="muted">—</span>}</td>
                    <td className="num">{c.asOf ? cell(avail(c, 'SL')) : <span className="muted">—</span>}</td>
                    <td className="num">{cell(avail(c, 'FL'))}</td>
                    <td className="num">{cell(avail(c, 'SPL'))}</td>
                    <td className="num">{cell(avail(c, 'CTO'))}</td>
                    <td className="small">{c.asOf ? formatLongDate(c.asOf) : <span className="badge-warn">Not entered</span>}</td>
                    <td>
                      <button className="btn" onClick={() => setOpen(c)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="section-title">Contract of service (COS)</div>
          <div className="card table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">CTO</th>
                  <th className="num">Wellness</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No COS staff registered.
                    </td>
                  </tr>
                )}
                {cos.map((c) => (
                  <tr key={c.employeeId}>
                    <td>
                      <b>{c.employeeName}</b>
                      <div className="small muted">{c.divisionName}</div>
                    </td>
                    <td className="num">{cell(avail(c, 'CTO'))}</td>
                    <td className="num">{cell(avail(c, 'WELLNESS'))}</td>
                    <td>
                      <button className="btn" onClick={() => setOpen(c)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {open && (
        <CreditsDialog
          credits={open}
          onClose={() => setOpen(null)}
          onChanged={(all) => {
            if (all) list.setData(all);
            else list.reload();
          }}
        />
      )}
    </>
  );
}

function CreditsDialog(props: { credits: CreditsDto; onClose: () => void; onChanged: (all?: CreditsDto[]) => void }) {
  const canEdit = useSession().has('HR', 'ADMIN');
  const [c, setC] = useState(props.credits);
  const refresh = async () => {
    const all = await api('api_listCredits');
    props.onChanged(all);
    const mine = all.find((x) => x.employeeId === c.employeeId);
    if (mine) setC(mine);
  };
  return (
    <Modal
      title={c.employeeName}
      subtitle={`${c.divisionName} · ${c.employmentType === 'COS' ? 'Contract of service' : 'Regular'}`}
      onClose={props.onClose}
      footer={
        <button className="btn" onClick={props.onClose}>
          Close
        </button>
      }
    >
      <div className="card" style={{ marginBottom: 20 }}>
        <CreditsTable credits={c} />
      </div>
      <p className="small muted" style={{ marginTop: -8, marginBottom: 20 }}>
        {creditsCaption(c)}
      </p>
      {c.employmentType !== 'COS' &&
        (canEdit ? <BalanceForm credits={c} onSaved={refresh} /> : <p className="small muted">Only HR and the administrator can change balances.</p>)}
      <div style={{ marginTop: c.employmentType === 'COS' ? 0 : 24 }}>
        <CocLedger employeeId={c.employeeId} onChanged={refresh} canEdit={canEdit} />
      </div>
    </Modal>
  );
}

function BalanceForm(props: { credits: CreditsDto; onSaved: () => Promise<void> }) {
  const c = props.credits;
  const [f, setF] = useState({ asOf: c.asOf, vl: c.asOf ? String(c.vlBalance) : '', sl: c.asOf ? String(c.slBalance) : '' });
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(false);
        try {
          await api('api_saveCredits', { employeeId: c.employeeId, asOf: f.asOf, vlBalance: Number(f.vl), slBalance: Number(f.sl) });
          await props.onSaved();
          setErr('');
          setSaved(true);
        } catch (x) {
          setErr(errorText(x));
        }
      }}
    >
      <div className="section-title">Balance from the leave card</div>
      {err && <div className="form-err">{err}</div>}
      {saved && <div className="notice ok">Saved.</div>}
      <div className="cols-3">
        <Field label="As of" hint="Usually the last day of a month: the last entry on the leave card.">
          <input type="date" value={f.asOf} onChange={(e) => setF({ ...f, asOf: e.target.value })} required />
        </Field>
        <Field label="Vacation leave balance">
          <input type="number" step="0.001" min="0" value={f.vl} onChange={(e) => setF({ ...f, vl: e.target.value })} required />
        </Field>
        <Field label="Sick leave balance">
          <input type="number" step="0.001" min="0" value={f.sl} onChange={(e) => setF({ ...f, sl: e.target.value })} required />
        </Field>
      </div>
      <button className="btn primary" type="submit">
        Save balance
      </button>
    </form>
  );
}

function CocLedger(props: { employeeId: string; onChanged: () => Promise<void>; canEdit: boolean }) {
  const list = useLoad<CocDto[]>(() => api('api_listCoc', { employeeId: props.employeeId }), [props.employeeId]);
  const [kind, setKind] = useState<'EARNED' | 'DEDUCTED'>('EARNED');
  const [f, setF] = useState({ earnedOn: '', hours: '', reference: '' });
  const [err, setErr] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const deduct = kind === 'DEDUCTED';
  return (
    <>
      <div className="section-title">CTO credits (COC)</div>
      {err && <div className="form-err">{err}</div>}
      {props.canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              list.setData(await api('api_saveCoc', { employeeId: props.employeeId, earnedOn: f.earnedOn, hours: Number(f.hours), reference: f.reference, kind }));
              setF({ earnedOn: '', hours: '', reference: '' });
              setErr('');
              setErrors({});
              await props.onChanged();
            } catch (x) {
              setErr(errorText(x));
              setErrors(fieldErrors(x));
            }
          }}
        >
          <div className="type-grid" style={{ marginBottom: 12 }}>
            <label className="choice">
              <input type="radio" name="coc-kind" checked={!deduct} onChange={() => setKind('EARNED')} />
              <span>
                Add COC earned
                <small>Approved overtime: adds CTO hours that lapse after a year.</small>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="coc-kind" checked={deduct} onChange={() => setKind('DEDUCTED')} />
              <span>
                Deduct hours
                <small>CTO taken outside the app, or a correction. Uses the oldest COC first.</small>
              </span>
            </label>
          </div>
          <div className="cols-3">
            <Field label={deduct ? 'Date' : 'Date earned'} error={errors.earnedOn}>
              <input type="date" value={f.earnedOn} onChange={(e) => setF({ ...f, earnedOn: e.target.value })} required />
            </Field>
            <Field label={deduct ? 'Hours to deduct' : 'Hours earned'} error={errors.hours} hint="8 hours = 1 day of CTO">
              <input type="number" step="0.5" min="0.5" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} required />
            </Field>
            <Field label={deduct ? 'Reason' : 'Reference'} error={errors.reference} hint={deduct ? 'For example: CTO on paper, Dec 2' : 'Overtime authority or COC certificate'}>
              <input type="text" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={200} required />
            </Field>
          </div>
          <button className={deduct ? 'btn' : 'btn primary'} type="submit" style={{ marginBottom: 16 }}>
            {deduct ? <Minus size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
            {deduct ? 'Deduct hours' : 'Add COC'}
          </button>
        </form>
      )}
      {list.data ? (
        list.data.length === 0 ? (
          <p className="small muted">No COC recorded yet.</p>
        ) : (
          <div className="card table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th className="num">Hours</th>
                  <th className="num">Left</th>
                  <th>Lapses</th>
                  <th>Reference or reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((x) => (
                  <tr key={x.entryId}>
                    <td className="small">{formatLongDate(x.earnedOn)}</td>
                    <td className="small">{x.kind === 'DEDUCTED' ? 'Deducted' : 'Earned'}</td>
                    <td className="num">{x.kind === 'DEDUCTED' ? `−${x.hours}` : x.hours}</td>
                    <td className="num">{x.kind === 'DEDUCTED' ? '' : x.remainingHours}</td>
                    <td className="small">{x.expiresOn ? formatLongDate(x.expiresOn) : ''}</td>
                    <td className="small">{x.reference}</td>
                    <td>
                      {props.canEdit && (
                        <button
                          className="btn"
                          aria-label={x.kind === 'DEDUCTED' ? 'Remove this deduction' : 'Remove this COC'}
                          onClick={async () => {
                            try {
                              list.setData(await api('api_deleteCoc', { entryId: x.entryId }));
                              await props.onChanged();
                            } catch (e2) {
                              setErr(errorText(e2));
                            }
                          }}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Loading error={list.error} />
      )}
    </>
  );
}
