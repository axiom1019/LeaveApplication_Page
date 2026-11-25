import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { DivisionDto, EmployeeDto } from '@shared/api';
import { ROLES, ROLE_LABELS, type Role } from '@shared/constants';
import { api, errorText, fieldErrors } from '../api/client';
import { Field, Loading, Modal, useLoad, useToast } from '../components/ui';
import { useSession } from '../session';

/** HR registers every user here: govmail, personal Google/email addresses for staff without govmail, and COS. */
export function PeoplePage() {
  const people = useLoad(() => api('api_listEmployees'));
  const divisions = useLoad(() => api('api_listDivisions'));
  const [edit, setEdit] = useState<EmployeeDto | 'new' | null>(null);
  const [q, setQ] = useState('');
  const shown = (people.data ?? []).filter((p) => !q || `${p.fullName} ${p.email} ${p.divisionName}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="page-head">
        <div>
          <h1>People</h1>
          <p>Only addresses registered here can sign in. Use the person's govmail, or the personal email they give for staff without govmail and COS staff.</p>
        </div>
        <button className="btn primary" onClick={() => setEdit('new')}>
          <Plus size={16} aria-hidden />
          Register a person
        </button>
      </div>
      <div className="filters">
        <input type="text" placeholder="Search name, email or division" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      <div className="card table-wrap">
        {people.data ? (
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Division · position</th>
                <th>Type</th>
                <th>Roles</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.employeeId} style={p.isActive ? undefined : { opacity: 0.55 }}>
                  <td>
                    <b>{p.fullName}</b>
                    {!p.isActive && <div className="small muted">Inactive</div>}
                  </td>
                  <td className="small">{p.email}</td>
                  <td className="small">
                    {p.divisionName}
                    <div className="muted">{p.position}</div>
                  </td>
                  <td className="small">{p.employmentType === 'COS' ? 'COS' : 'Regular'}</td>
                  <td className="small">{p.roles.map((r) => ROLE_LABELS[r]).join(', ') || '—'}</td>
                  <td>
                    <button className="btn" onClick={() => setEdit(p)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Loading error={people.error} />
        )}
      </div>
      {edit && divisions.data && (
        <EmployeeForm
          person={edit === 'new' ? null : edit}
          divisions={divisions.data}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            people.reload();
          }}
        />
      )}
    </>
  );
}

function EmployeeForm(props: { person: EmployeeDto | null; divisions: DivisionDto[]; onClose: () => void; onSaved: () => void }) {
  const { has } = useSession();
  const toast = useToast();
  const p = props.person;
  const [f, setF] = useState({
    email: p?.email ?? '',
    lastName: p?.lastName ?? '',
    firstName: p?.firstName ?? '',
    middleName: p?.middleName ?? '',
    divisionId: p?.divisionId ?? '',
    position: p?.position ?? '',
    salary: p?.salary ?? '',
    employmentType: p?.employmentType ?? 'REGULAR',
    roles: p?.roles ?? ([] as Role[]),
    isActive: p?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const isAdmin = has('ADMIN');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('api_saveEmployee', { ...f, employeeId: p?.employeeId, version: p?.version, middleName: f.middleName || undefined, salary: f.salary || undefined });
      toast(p ? 'Saved.' : `${f.firstName} ${f.lastName} can now sign in.`);
      props.onSaved();
    } catch (e) {
      setErrors(fieldErrors(e));
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const text = (k: keyof typeof f, label: string, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <input type="text" value={String(f[k])} onChange={(e) => set({ [k]: e.target.value })} />
    </Field>
  );

  return (
    <Modal
      title={p ? `Edit ${p.fullName}` : 'Register a person'}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="form-err">{err}</div>}
      <Field label="Email they sign in with" error={errors.email} hint="govmail (dhsud.gov.ph) signs in through Google. Any other address gets a sign-in code by email.">
        <input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <div className="cols-2">
        {text('lastName', 'Last name')}
        {text('firstName', 'First name')}
        {text('middleName', 'Middle name')}
        <Field label="Employment" error={errors.employmentType}>
          <select value={f.employmentType} onChange={(e) => set({ employmentType: e.target.value as 'REGULAR' | 'COS' })}>
            <option value="REGULAR">Regular</option>
            <option value="COS">Contract of service (COS)</option>
          </select>
        </Field>
        <Field label="Division" error={errors.divisionId}>
          <select value={f.divisionId} onChange={(e) => set({ divisionId: e.target.value })}>
            <option value="">Choose…</option>
            {props.divisions.map((d) => (
              <option key={d.divisionId} value={d.divisionId}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        {text('position', 'Position')}
        {text('salary', 'Salary', 'As printed on item 5 of the form')}
      </div>
      <div className="section-title">Roles</div>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Everyone can file their own leave. The Division Chief signs for the division they are set as chief of (Settings → Divisions).
      </p>
      <div className="type-grid">
        {ROLES.filter((r) => r !== 'DIVISION_CHIEF' && r !== 'ADMIN').map((r) => {
          const locked = r === 'HR' && !isAdmin;
          return (
            <label key={r} className="choice" style={locked ? { opacity: 0.6 } : undefined}>
              <input
                type="checkbox"
                disabled={locked}
                checked={f.roles.includes(r)}
                onChange={(e) => set({ roles: e.target.checked ? [...f.roles, r] : f.roles.filter((x) => x !== r) })}
              />
              <span>
                {ROLE_LABELS[r]}
                {locked && <small>Only the administrator can change this.</small>}
              </span>
            </label>
          );
        })}
      </div>
      <label className="choice" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} />
        <span>
          Active
          <small>Untick when the person leaves the office. They can no longer sign in, and their records stay.</small>
        </span>
      </label>
    </Modal>
  );
}
