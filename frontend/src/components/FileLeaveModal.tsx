import { useMemo, useRef, useState } from 'react';
import type { ApplicationDetail } from '@shared/api';
import { ROLE_LABELS } from '@shared/constants';
import { countWorkingDays, formatInclusiveDates, formatLongDate } from '@shared/dates';
import { leaveTypesFor, LOCATION_CHOICES, OTHER_PURPOSE_CHOICES, SICK_CHOICES, STUDY_CHOICES, leaveType, type LeaveTypeCode } from '@shared/leaveTypes';
import { leaveForm, type LeaveDetails } from '@shared/schemas';
import { api, errorText, fieldErrors, newKey } from '../api/client';
import { useSession } from '../session';
import { DatePicker } from './Calendar';
import { Field, Modal, useLoad } from './ui';

/** CSC Form No. 6 in one modal. Items 1–5 come from the person's record; 6.A–6.D are filled in here. */
export function FileLeaveModal(props: { onClose: () => void; onFiled: (app: ApplicationDetail) => void }) {
  const { me, boot, privacy } = useSession();
  const e = me.employee;
  const [type, setType] = useState<LeaveTypeCode | ''>('');
  const [other, setOther] = useState('');
  const [details, setDetails] = useState<LeaveDetails>({});
  const [dates, setDates] = useState<string[]>([]);
  const [commutation, setCommutation] = useState<'REQUESTED' | 'NOT_REQUESTED'>('NOT_REQUESTED');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());
  const credits = useLoad(() => api('api_myCredits'));
  const types = leaveTypesFor(e.employmentType);
  // Forced leave is charged to VL, so show both.
  const creditLines = (credits.data?.lines ?? []).filter((l) => l.code === type || (type === 'FL' && l.code === 'VL'));

  const holidays = useMemo(() => new Map(boot.holidays.map((h) => [h.date, h.name])), [boot.holidays]);
  const working = countWorkingDays(dates, new Set(holidays.keys()));
  const kind = type ? leaveType(type).details : 'NONE';
  const set = (patch: Partial<LeaveDetails>) => setDetails((d) => ({ ...d, ...patch }));

  const submit = async () => {
    setFormError('');
    const form = { leaveType: type as LeaveTypeCode, leaveTypeOther: other || undefined, details, dates, commutation };
    const local = leaveForm.safeParse(form);
    const errs: Record<string, string> = {};
    if (!type) errs.leaveType = 'Choose the type of leave';
    if (!local.success) for (const i of local.error.issues) errs[i.path.join('.')] ??= i.message;
    if (!agree) errs.agree = 'Please confirm you have read the privacy notice';
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError('Please check the highlighted items.');
      return;
    }
    setBusy(true);
    try {
      const app = await api('api_fileLeave', { idempotencyKey: key.current, form });
      props.onFiled(app);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="File leave"
      subtitle="Application for Leave (CSC Form No. 6, Revised 2020)"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Filing…' : 'File and prepare the form'}
          </button>
        </>
      }
    >
      {formError && <div className="form-err" role="alert">{formError}</div>}
      <div className="readonly-grid" aria-label="Items 1 to 5, from your record">
        <div>
          <span>1. Office/Department</span>
          <b>{e.divisionName}</b>
        </div>
        <div>
          <span>2. Name</span>
          <b>
            {e.lastName}, {e.firstName} {e.middleName}
          </b>
        </div>
        <div>
          <span>3. Date of filing</span>
          <b>{formatLongDate(boot.today)}</b>
        </div>
        <div>
          <span>4. Position · 5. Salary</span>
          <b>
            {e.position}
            {e.salary ? ` · ${e.salary}` : ''}
          </b>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: -10, marginBottom: 16 }}>
        {boot.settings.profileSelfEdit
          ? 'If any of these is wrong, correct it under My profile before filing (ask HR for the office/division).'
          : 'If any of these is wrong, ask HR to correct your record before filing.'}
      </p>

      <div className="section-title">6.A Type of leave</div>
      <div className="type-grid" role="radiogroup" aria-label="Type of leave">
        {types.map((t) => (
          <label key={t.code} className="choice">
            <input
              type="radio"
              name="leaveType"
              checked={type === t.code}
              onChange={() => {
                setType(t.code);
                setDetails({});
              }}
            />
            <span>
              {t.label}
              {t.basis && <small>{t.basis}</small>}
            </span>
          </label>
        ))}
      </div>
      {errors.leaveType && <div className="err small" style={{ color: 'var(--red)' }}>{errors.leaveType}</div>}
      {creditLines.map((l) => (
        <div key={l.code} className={`notice ${l.available > 0 ? 'info' : ''}`} style={{ marginTop: 10, marginBottom: 0 }}>
          <b>{l.label}:</b> {l.available} day{l.available === 1 ? '' : 's'} available
          {l.onHold ? `, after ${l.onHold} on hold in other applications` : ''}. <span className="muted">{l.note}</span>
        </div>
      ))}
      {type === 'OTHERS' && (
        <div style={{ marginTop: 10 }}>
          <Field label="Others (specify)" error={errors.leaveTypeOther}>
            <input type="text" value={other} onChange={(ev) => setOther(ev.target.value)} maxLength={120} />
          </Field>
        </div>
      )}

      {type && kind !== 'NONE' && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>
            6.B Details of leave
          </div>
          {kind === 'LOCATION' && (
            <>
              <div className="choices" style={{ marginBottom: 10 }}>
                {(Object.keys(LOCATION_CHOICES) as (keyof typeof LOCATION_CHOICES)[]).map((k) => (
                  <label key={k} className="choice">
                    <input type="radio" name="loc" checked={details.location === k} onChange={() => set({ location: k })} />
                    <span>{LOCATION_CHOICES[k]}</span>
                  </label>
                ))}
              </div>
              {errors['details.location'] && <div className="field"><div className="err">{errors['details.location']}</div></div>}
              <Field label={details.location === 'ABROAD' ? 'Country (specify)' : 'Where (optional)'} error={errors['details.locationText']}>
                <input type="text" value={details.locationText ?? ''} onChange={(ev) => set({ locationText: ev.target.value })} maxLength={200} />
              </Field>
            </>
          )}
          {kind === 'SICK' && (
            <>
              <div className="choices" style={{ marginBottom: 10 }}>
                {(Object.keys(SICK_CHOICES) as (keyof typeof SICK_CHOICES)[]).map((k) => (
                  <label key={k} className="choice">
                    <input type="radio" name="sick" checked={details.sick === k} onChange={() => set({ sick: k })} />
                    <span>{SICK_CHOICES[k]}</span>
                  </label>
                ))}
              </div>
              {errors['details.sick'] && <div className="field"><div className="err">{errors['details.sick']}</div></div>}
              <Field label="Illness (specify)" hint="Visible only to you, your signatories and HR. Never included in emails.">
                <input type="text" value={details.illness ?? ''} onChange={(ev) => set({ illness: ev.target.value })} maxLength={200} />
              </Field>
            </>
          )}
          {kind === 'ILLNESS' && (
            <Field label="Illness (specify)" hint="Visible only to you, your signatories and HR. Never included in emails.">
              <input type="text" value={details.illness ?? ''} onChange={(ev) => set({ illness: ev.target.value })} maxLength={200} />
            </Field>
          )}
          {kind === 'STUDY' && (
            <div className="choices">
              {(Object.keys(STUDY_CHOICES) as (keyof typeof STUDY_CHOICES)[]).map((k) => (
                <label key={k} className="choice">
                  <input type="radio" name="study" checked={details.study === k} onChange={() => set({ study: k })} />
                  <span>{STUDY_CHOICES[k]}</span>
                </label>
              ))}
              {errors['details.study'] && <div className="err small" style={{ color: 'var(--red)' }}>{errors['details.study']}</div>}
            </div>
          )}
          {kind === 'OTHER' && (
            <div className="choices">
              <span className="small muted">Other purpose (optional)</span>
              {(Object.keys(OTHER_PURPOSE_CHOICES) as (keyof typeof OTHER_PURPOSE_CHOICES)[]).map((k) => (
                <label key={k} className="choice">
                  <input type="checkbox" checked={details.otherPurpose === k} onChange={(ev) => set({ otherPurpose: ev.target.checked ? k : undefined })} />
                  <span>{OTHER_PURPOSE_CHOICES[k]}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-title" style={{ marginTop: 18 }}>
        6.C Inclusive dates
      </div>
      <DatePicker value={dates} onChange={setDates} holidays={holidays} today={boot.today} />
      <div className="days-summary" aria-live="polite">
        {dates.length ? (
          <>
            <b>{working}</b> working day{working === 1 ? '' : 's'} applied for · {formatInclusiveDates(dates)}
            {dates.length !== working && <div className="small muted">Weekends and holidays you picked are not counted.</div>}
          </>
        ) : (
          'No dates picked yet.'
        )}
      </div>
      {errors.dates && <div className="err small" style={{ color: 'var(--red)', marginTop: 4 }}>{errors.dates}</div>}

      <div className="section-title" style={{ marginTop: 18 }}>
        6.D Commutation
      </div>
      <div className="cols-2">
        <label className="choice">
          <input type="radio" name="comm" checked={commutation === 'NOT_REQUESTED'} onChange={() => setCommutation('NOT_REQUESTED')} />
          <span>Not requested</span>
        </label>
        <label className="choice">
          <input type="radio" name="comm" checked={commutation === 'REQUESTED'} onChange={() => setCommutation('REQUESTED')} />
          <span>Requested</span>
        </label>
      </div>

      <details style={{ marginTop: 18 }}>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>
          Privacy notice{privacy.approved ? '' : ' (draft, awaiting DPO approval)'}
        </summary>
        <div className="small muted" style={{ whiteSpace: 'pre-line', marginTop: 8 }}>
          {privacy.text}
        </div>
      </details>
      <label className="choice" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={agree} onChange={(ev) => setAgree(ev.target.checked)} />
        <span>I have read the privacy notice, and the details above are true.</span>
      </label>
      {errors.agree && <div className="err small" style={{ color: 'var(--red)' }}>{errors.agree}</div>}
      <p className="small muted" style={{ marginTop: 12 }}>
        After filing, print the form, sign it, and pass it to the {ROLE_LABELS[boot.settings.signatoryFlow[0]?.signatory ?? 'DIVISION_CHIEF']}. You can follow its status here.
      </p>
    </Modal>
  );
}
