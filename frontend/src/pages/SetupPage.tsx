import { useEffect, useState } from 'react';
import type { DivisionDto, EmployeeDto, SettingsDto } from '@shared/api';
import { ROLE_LABELS, SECTIONS, SECTION_LABELS, SIGNATORIES, type Section, type Signatory } from '@shared/constants';
import { formatLongDate } from '@shared/dates';
import { api, errorText, fieldErrors } from '../api/client';
import { Field, Loading, Modal, useLoad, useToast } from '../components/ui';
import { useSession } from '../session';

type Tab = 'divisions' | 'holidays' | 'oic' | 'credits' | 'settings' | 'audit';

export function SetupPage() {
  const { has, boot } = useSession();
  const hr = has('HR', 'ADMIN');
  const tabs: [Tab, string, boolean][] = [
    ['divisions', 'Divisions', hr],
    ['holidays', 'Holidays', hr],
    ['oic', 'OIC Regional Director', hr || has('REGIONAL_DIRECTOR')],
    ['credits', 'Leave credits', boot.settings.leaveCreditsMode === 'TRACKED' && (hr || has('SUPERVISING_AO'))],
    ['settings', 'Settings', hr],
    ['audit', 'Audit log', hr],
  ];
  const visible = tabs.filter((t) => t[2]);
  const [tab, setTab] = useState<Tab>(visible[0]?.[0] ?? 'oic');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Setup</h1>
          <p>Divisions and their chiefs, holidays, the OIC Regional Director, and how the system works.</p>
        </div>
      </div>
      <div className="subtabs" role="tablist">
        {visible.map(([k, label]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'divisions' && <Divisions />}
      {tab === 'holidays' && <Holidays />}
      {tab === 'oic' && <OicTab />}
      {tab === 'credits' && <Credits />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <Audit />}
    </>
  );
}

function useEmployees() {
  return useLoad<EmployeeDto[]>(() => api('api_listEmployees'));
}

function Divisions() {
  const list = useLoad(() => api('api_listDivisions'));
  const people = useEmployees();
  const [edit, setEdit] = useState<DivisionDto | 'new' | null>(null);
  return (
    <>
      <div className="card table-wrap">
        {list.data ? (
          <table className="grid">
            <thead>
              <tr>
                <th>Code</th>
                <th>Division</th>
                <th>Division Chief (signs for its staff)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <tr key={d.divisionId} style={d.isActive ? undefined : { opacity: 0.55 }}>
                  <td>{d.code}</td>
                  <td>{d.name}</td>
                  <td>{d.chiefName || <span className="muted">Not set</span>}</td>
                  <td>
                    <button className="btn" onClick={() => setEdit(d)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Loading error={list.error} />
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={() => setEdit('new')}>
          + Add division
        </button>
      </div>
      {edit && <DivisionForm d={edit === 'new' ? null : edit} people={people.data ?? []} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), list.reload())} />}
    </>
  );
}

function DivisionForm(props: { d: DivisionDto | null; people: EmployeeDto[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: props.d?.code ?? '', name: props.d?.name ?? '', chiefEmployeeId: props.d?.chiefEmployeeId ?? '', isActive: props.d?.isActive ?? true });
  const [err, setErr] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <Modal
      narrow
      title={props.d ? `Edit ${props.d.name}` : 'Add division'}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await api('api_saveDivision', { ...f, divisionId: props.d?.divisionId, chiefEmployeeId: f.chiefEmployeeId || undefined });
                props.onSaved();
              } catch (e) {
                setErr(errorText(e));
                setErrors(fieldErrors(e));
              }
            }}
          >
            Save
          </button>
        </>
      }
    >
      {err && <div className="form-err">{err}</div>}
      <Field label="Code" error={errors.code}>
        <input type="text" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
      </Field>
      <Field label="Name" error={errors.name}>
        <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Division Chief" hint="Signs the Division Chief section for this division's staff.">
        <select value={f.chiefEmployeeId} onChange={(e) => setF({ ...f, chiefEmployeeId: e.target.value })}>
          <option value="">Not set</option>
          {props.people
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.employeeId} value={p.employeeId}>
                {p.fullName} ({p.position})
              </option>
            ))}
        </select>
      </Field>
      <label className="choice">
        <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
        <span>Active</span>
      </label>
    </Modal>
  );
}

function Holidays() {
  const list = useLoad(() => api('api_listHolidays'));
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="card card-pad">
      <p className="muted small" style={{ marginBottom: 12 }}>
        Holidays are left out of the working-day count. Add regular and special non-working days, and local holidays in Cagayan de Oro, as proclaimed.
      </p>
      {err && <div className="form-err">{err}</div>}
      <form
        className="filters"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            list.setData(await api('api_saveHoliday', { date, name }));
            setDate('');
            setName('');
            setErr('');
          } catch (x) {
            setErr(errorText(x));
          }
        }}
      >
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" required />
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Holiday name" aria-label="Holiday name" required />
        <button className="btn primary" type="submit">
          Add
        </button>
      </form>
      {list.data ? (
        <table className="grid">
          <tbody>
            {list.data.map((h) => (
              <tr key={h.date}>
                <td className="nowrap">{formatLongDate(h.date)}</td>
                <td>{h.name}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn danger" onClick={async () => list.setData(await api('api_deleteHoliday', { date: h.date }))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!list.data.length && (
              <tr>
                <td className="muted">No holidays yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <Loading error={list.error} />
      )}
    </div>
  );
}

function OicTab() {
  const { has } = useSession();
  const canEdit = has('REGIONAL_DIRECTOR', 'ADMIN');
  const list = useLoad(() => api('api_listOic'));
  const people = useEmployees();
  const [f, setF] = useState({ employeeId: '', startDate: '', endDate: '', remarks: '' });
  const [err, setErr] = useState('');
  return (
    <div className="card card-pad">
      <p className="muted small" style={{ marginBottom: 12 }}>
        The person named here signs as OIC, Regional Director, only on the dates given. {canEdit ? '' : 'Only the Regional Director or the administrator can change this.'}
      </p>
      {err && <div className="form-err">{err}</div>}
      {canEdit && (
        <form
          className="filters"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              list.setData(await api('api_saveOic', { ...f, remarks: f.remarks || undefined }));
              setF({ employeeId: '', startDate: '', endDate: '', remarks: '' });
              setErr('');
            } catch (x) {
              setErr(errorText(x));
            }
          }}
        >
          <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} required aria-label="OIC">
            <option value="">Choose the OIC…</option>
            {(people.data ?? [])
              .filter((p) => p.isActive)
              .map((p) => (
                <option key={p.employeeId} value={p.employeeId}>
                  {p.fullName} ({p.position})
                </option>
              ))}
          </select>
          <input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required aria-label="From" />
          <input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required aria-label="To" />
          <input type="text" value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="Reference (e.g. Office Order No.)" aria-label="Remarks" />
          <button className="btn primary" type="submit">
            Assign
          </button>
        </form>
      )}
      {list.data ? (
        <table className="grid">
          <thead>
            <tr>
              <th>OIC</th>
              <th>From</th>
              <th>To</th>
              <th>Reference</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((o) => (
              <tr key={o.assignmentId}>
                <td>{o.employeeName}</td>
                <td className="nowrap">{formatLongDate(o.startDate)}</td>
                <td className="nowrap">{formatLongDate(o.endDate)}</td>
                <td className="small">{o.remarks}</td>
                <td style={{ textAlign: 'right' }}>
                  {canEdit && (
                    <button className="btn danger" onClick={async () => list.setData(await api('api_deleteOic', { assignmentId: o.assignmentId }))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Loading error={list.error} />
      )}
    </div>
  );
}

function Credits() {
  const list = useLoad(() => api('api_listCredits'));
  const people = useEmployees();
  const [f, setF] = useState({ employeeId: '', asOf: '', vl: '', sl: '' });
  const [err, setErr] = useState('');
  return (
    <div className="card card-pad">
      <p className="muted small" style={{ marginBottom: 12 }}>
        Balances here fill in section 7.A for the Supervising Administrative Officer to check. They are not deducted automatically; update them from the leave card.
      </p>
      {err && <div className="form-err">{err}</div>}
      <form
        className="filters"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            list.setData(await api('api_saveCredits', { employeeId: f.employeeId, asOf: f.asOf, vlBalance: Number(f.vl), slBalance: Number(f.sl) }));
            setF({ employeeId: '', asOf: '', vl: '', sl: '' });
            setErr('');
          } catch (x) {
            setErr(errorText(x));
          }
        }}
      >
        <select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} required aria-label="Employee">
          <option value="">Employee…</option>
          {(people.data ?? [])
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.employeeId} value={p.employeeId}>
                {p.fullName}
              </option>
            ))}
        </select>
        <input type="date" value={f.asOf} onChange={(e) => setF({ ...f, asOf: e.target.value })} required aria-label="As of" />
        <input type="number" step="0.001" min="0" value={f.vl} onChange={(e) => setF({ ...f, vl: e.target.value })} placeholder="VL balance" required aria-label="Vacation leave balance" />
        <input type="number" step="0.001" min="0" value={f.sl} onChange={(e) => setF({ ...f, sl: e.target.value })} placeholder="SL balance" required aria-label="Sick leave balance" />
        <button className="btn primary" type="submit">
          Save
        </button>
      </form>
      {list.data ? (
        <table className="grid">
          <thead>
            <tr>
              <th>Employee</th>
              <th>As of</th>
              <th>Vacation leave</th>
              <th>Sick leave</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.employeeId}>
                <td>{c.employeeName}</td>
                <td>{formatLongDate(c.asOf)}</td>
                <td>{c.vlBalance}</td>
                <td>{c.slBalance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Loading error={list.error} />
      )}
    </div>
  );
}

function SettingsTab() {
  const { has, refreshMe } = useSession();
  const toast = useToast();
  const isAdmin = has('ADMIN');
  const settings = useLoad(() => api('api_getSettings'));
  const divisions = useLoad(() => api('api_listDivisions'));
  const [f, setF] = useState<SettingsDto | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (settings.data) setF(settings.data);
  }, [settings.data]);
  if (!f) return <Loading error={settings.error} />;

  const setStep = (i: number, patch: Partial<{ signatory: Signatory; section: Section }>) => setF({ ...f, signatoryFlow: f.signatoryFlow.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <div className="card card-pad">
      {!isAdmin && <div className="notice info">Only the system administrator can change these settings.</div>}
      {err && <div className="form-err">{err}</div>}
      <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="section-title">Signatories (section 7)</div>
        <p className="small muted" style={{ marginBottom: 10 }}>
          The order the paper form travels in, and which part of section 7 each signatory signs. HR to confirm. A change applies to applications filed after it.
        </p>
        <div className="table-wrap">
          <table className="grid" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Signatory</th>
                <th>Signs section</th>
              </tr>
            </thead>
            <tbody>
              {f.signatoryFlow.map((s, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <select value={s.signatory} onChange={(e) => setStep(i, { signatory: e.target.value as Signatory })} aria-label={`Signatory ${i + 1}`}>
                      {SIGNATORIES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={s.section} onChange={(e) => setStep(i, { section: e.target.value as Section })} aria-label={`Section ${i + 1}`}>
                      {SECTIONS.map((x) => (
                        <option key={x} value={x}>
                          {SECTION_LABELS[x]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section-title">Leave credits (section 7.A)</div>
        <div className="choices" style={{ marginBottom: 16 }}>
          <label className="choice">
            <input type="radio" checked={f.leaveCreditsMode === 'LEAVE_CARD'} onChange={() => setF({ ...f, leaveCreditsMode: 'LEAVE_CARD' })} />
            <span>
              Kept on the HR leave card
              <small>The Supervising AO writes the credits on paper, or types them when e-signing.</small>
            </span>
          </label>
          <label className="choice">
            <input type="radio" checked={f.leaveCreditsMode === 'TRACKED'} onChange={() => setF({ ...f, leaveCreditsMode: 'TRACKED' })} />
            <span>
              Balances kept in this app
              <small>HR enters balances under Setup → Leave credits; they fill in 7.A for the Supervising AO to check.</small>
            </span>
          </label>
        </div>

        <div className="section-title">Pilot</div>
        <p className="small muted" style={{ marginBottom: 8 }}>
          Tick the divisions that may file online. Leave all unticked to open filing to every division.
        </p>
        <div className="type-grid" style={{ marginBottom: 16 }}>
          {(divisions.data ?? []).map((d) => (
            <label key={d.divisionId} className="choice">
              <input
                type="checkbox"
                checked={f.pilotDivisionIds.includes(d.divisionId)}
                onChange={(e) => setF({ ...f, pilotDivisionIds: e.target.checked ? [...f.pilotDivisionIds, d.divisionId] : f.pilotDivisionIds.filter((x) => x !== d.divisionId) })}
              />
              <span>{d.name}</span>
            </label>
          ))}
        </div>

        <div className="section-title">E-signature</div>
        <label className="choice" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={f.esignEnabled} onChange={(e) => setF({ ...f, esignEnabled: e.target.checked })} />
          <span>
            Allow signatories to e-sign when away from the office
            <small>Switch on only after management confirms in writing that e-signatures are accepted for leave forms.</small>
          </span>
        </label>

        <div className="section-title">Form header and notices</div>
        <div className="cols-2">
          <Field label="Agency name (form header)">
            <input type="text" value={f.agencyName} onChange={(e) => setF({ ...f, agencyName: e.target.value })} />
          </Field>
          <Field label="Agency address (form header)">
            <input type="text" value={f.agencyAddress} onChange={(e) => setF({ ...f, agencyAddress: e.target.value })} />
          </Field>
          <Field label="HR email for 'ready for filing' notices" hint="Leave blank to notify everyone with the HR role.">
            <input type="email" value={f.hrNotifyEmail} onChange={(e) => setF({ ...f, hrNotifyEmail: e.target.value })} />
          </Field>
        </div>
      </fieldset>
      {isAdmin && (
        <button
          className="btn primary"
          onClick={async () => {
            try {
              setF(await api('api_saveSettings', f));
              setErr('');
              toast('Settings saved.');
              refreshMe();
            } catch (e) {
              setErr(errorText(e));
            }
          }}
        >
          Save settings
        </button>
      )}
    </div>
  );
}

function Audit() {
  const list = useLoad(() => api('api_audit', { limit: 200 }));
  return (
    <div className="card table-wrap">
      {list.data ? (
        <table className="grid">
          <thead>
            <tr>
              <th>When (PHT)</th>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((a, i) => (
              <tr key={i}>
                <td className="nowrap small">{a.at}</td>
                <td className="small">{a.actor}</td>
                <td className="small">{a.action}</td>
                <td className="small">{a.entityId.startsWith('LA-') ? a.entityId : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Loading error={list.error} />
      )}
    </div>
  );
}
