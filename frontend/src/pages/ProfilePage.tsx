import { useState } from 'react';
import { ROLE_LABELS } from '@shared/constants';
import { api, errorText, fieldErrors } from '../api/client';
import { Field, useToast } from '../components/ui';
import { useSession } from '../session';

/** Everyone's own record. Name, position and salary are editable when the administrator allows it. */
export function ProfilePage() {
  const { me, boot, refreshMe } = useSession();
  const e = me.employee;
  const toast = useToast();
  const canEdit = boot.settings.profileSelfEdit;
  const initial = { lastName: e.lastName, firstName: e.firstName, middleName: e.middleName, position: e.position, salary: e.salary };
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const changed = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => f[k] !== initial[k]);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const save = async () => {
    setBusy(true);
    setErr('');
    setErrors({});
    try {
      await api('api_saveMyProfile', { version: e.version, ...f });
      toast('Your profile is saved.');
      refreshMe();
    } catch (x) {
      setErrors(fieldErrors(x));
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  };

  const input = (k: keyof typeof f, label: string, hint?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <input type="text" value={f[k]} onChange={(ev) => set({ [k]: ev.target.value })} disabled={!canEdit} aria-invalid={!!errors[k] || undefined} />
    </Field>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p>These details print on your leave form (CSC Form No. 6, items 1 to 5).</p>
        </div>
      </div>
      {!canEdit && <div className="notice">Editing your own profile is switched off. Ask HR to correct anything that is wrong.</div>}
      {err && (
        <div className="form-err" role="alert">
          {err}
        </div>
      )}
      <div className="card card-pad">
        <div className="section-title">Name</div>
        <div className="cols-2">
          {input('lastName', 'Last name')}
          {input('firstName', 'First name')}
          {input('middleName', 'Middle name')}
        </div>
        <div className="section-title">Position</div>
        <div className="cols-2">
          {input('position', 'Position')}
          {input('salary', 'Salary', 'As it should print on the form, for example 45,000')}
        </div>
        {canEdit && (
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" disabled={!changed || busy} onClick={() => (setF(initial), setErrors({}), setErr(''))}>
              Undo changes
            </button>
            <button className="btn primary" disabled={!changed || busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="section-title">Kept by HR</div>
        <dl className="kv">
          <dt>Email</dt>
          <dd>{e.email}</dd>
          <dt>Office/division</dt>
          <dd>{e.divisionName || '—'}</dd>
          <dt>Employment</dt>
          <dd>{e.employmentType === 'COS' ? 'Contract of service (COS)' : 'Regular'}</dd>
          <dt>Roles</dt>
          <dd>{e.roles.length ? e.roles.map((r) => ROLE_LABELS[r]).join(', ') : 'Employee'}</dd>
        </dl>
        <p className="small muted" style={{ marginTop: 12 }}>
          Ask HR to change these.
        </p>
      </div>
    </>
  );
}
