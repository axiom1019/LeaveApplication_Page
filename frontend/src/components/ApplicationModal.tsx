import { useState } from 'react';
import type { ApplicationDetail, EmployeeDto, StepDto } from '@shared/api';
import { SECTION_LABELS, type Section } from '@shared/constants';
import { formatLongDate } from '@shared/dates';
import { LOCATION_CHOICES, OTHER_PURPOSE_CHOICES, SICK_CHOICES, STUDY_CHOICES } from '@shared/leaveTypes';
import { api, errorText, fieldErrors } from '../api/client';
import { useSession } from '../session';
import { downloadBase64, printHtml } from './print';
import { Field, Loading, Modal, StatusPill, useLoad, useToast } from './ui';

const DECISION_TEXT: Record<string, string> = {
  CERTIFIED: 'Certified leave credits',
  FOR_APPROVAL: 'Recommended approval',
  FOR_DISAPPROVAL: 'Recommended disapproval',
  APPROVED: 'Approved',
  DISAPPROVED: 'Disapproved',
};

function detailsText(a: ApplicationDetail): string {
  const d = a.details;
  const parts: string[] = [];
  if (d.location) parts.push(`${LOCATION_CHOICES[d.location]}${d.locationText ? `: ${d.locationText}` : ''}`);
  if (d.sick) parts.push(SICK_CHOICES[d.sick]);
  if (d.illness) parts.push(`Illness: ${d.illness}`);
  if (d.study) parts.push(STUDY_CHOICES[d.study]);
  if (d.otherPurpose) parts.push(OTHER_PURPOSE_CHOICES[d.otherPurpose]);
  if (d.purpose) parts.push(`Purpose: ${d.purpose}`);
  return parts.join(' · ') || '—';
}

function StepItem({ s }: { s: StepDto }) {
  const sig = s.signature;
  return (
    <li>
      <span className={`dot ${s.state}`} aria-hidden="true">
        {s.state === 'DONE' ? '✓' : s.index + 1}
      </span>
      <div>
        <b>{s.label}</b>
        {sig ? (
          <div className="small">
            {DECISION_TEXT[sig.decision] ?? sig.decision}
            {sig.reason ? `: ${sig.reason}` : ''}
            <div className="muted">
              {sig.signerName || 'Signatory'}
              {sig.signerTitle ? `, ${sig.signerTitle}` : ''} · {sig.method === 'ESIGN' ? 'E-signed' : 'Signed on paper'} · {sig.signedAt}
              {sig.recordedByName ? ` · recorded by ${sig.recordedByName}` : ''}
            </div>
          </div>
        ) : (
          <div className="small muted">
            {s.state === 'CURRENT' ? 'Waiting for: ' : s.state === 'SKIPPED' ? 'Not needed. ' : 'Next: '}
            {s.state !== 'SKIPPED' && s.assignee}
          </div>
        )}
      </div>
    </li>
  );
}

export function ApplicationModal(props: { applicationId: string; onClose: () => void; onChanged?: () => void; justFiled?: boolean }) {
  const toast = useToast();
  const { refreshMe } = useSession();
  const { data: app, error, setData } = useLoad(() => api('api_getApplication', { applicationId: props.applicationId }), [props.applicationId]);
  const [busy, setBusy] = useState('');
  const [signing, setSigning] = useState<'self' | 'hr' | null>(null);
  const [filing, setFiling] = useState(false);
  const [actionError, setActionError] = useState('');

  const changed = (a: ApplicationDetail, msg: string) => {
    setData(a);
    toast(msg);
    props.onChanged?.();
    refreshMe();
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setActionError('');
    try {
      await fn();
    } catch (e) {
      setActionError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  if (!app) {
    return (
      <Modal title="Application" onClose={props.onClose}>
        <Loading error={error} />
      </Modal>
    );
  }

  const current = app.steps.find((s) => s.state === 'CURRENT');

  return (
    <>
      <Modal
        title={`Leave application ${app.applicationId}`}
        subtitle={`${app.applicantName} · filed ${formatLongDate(app.filedOn)}`}
        onClose={props.onClose}
        footer={
          <>
            {app.can.cancel && (
              <button
                className="btn danger"
                disabled={!!busy}
                onClick={() =>
                  run('cancel', async () => {
                    if (!window.confirm('Cancel this application? This cannot be undone.')) return;
                    changed(await api('api_cancelApplication', { applicationId: app.applicationId }), 'Application cancelled.');
                  })
                }
              >
                Cancel application
              </button>
            )}
            {app.can.withdraw && (
              <button
                className="btn danger"
                disabled={!!busy}
                onClick={() => run('withdraw', async () => changed(await api('api_withdrawSignature', { applicationId: app.applicationId }), 'Your signature was withdrawn.'))}
              >
                Withdraw my signature
              </button>
            )}
            <button className="btn" disabled={!!busy} onClick={() => run('print', async () => printHtml((await api('api_formHtml', { applicationId: app.applicationId })).html))}>
              {busy === 'print' ? 'Preparing…' : 'Print form'}
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                run('pdf', async () => {
                  const pdf = await api('api_formPdf', { applicationId: app.applicationId });
                  downloadBase64(pdf.base64, pdf.fileName);
                })
              }
            >
              {busy === 'pdf' ? 'Making PDF…' : 'Download PDF'}
            </button>
            {app.can.recordPaper && !app.can.sign && (
              <button className="btn" disabled={!!busy} onClick={() => setSigning('hr')}>
                Record paper signature
              </button>
            )}
            {app.can.sign && (
              <button className="btn primary" disabled={!!busy} onClick={() => setSigning('self')}>
                Sign {current ? current.section.replace(/^7/, '7.') : ''}
              </button>
            )}
            {app.can.file && (
              <button className="btn primary" disabled={!!busy} onClick={() => setFiling(true)}>
                File (HR)
              </button>
            )}
          </>
        }
      >
        {props.justFiled && (
          <div className="notice ok">
            Filed. Print the form, sign it as the applicant, and pass it on for signatures. Signatories who are away can sign from this app.
          </div>
        )}
        {app.can.sign && <div className="notice info">This application is waiting for your action on {current ? SECTION_LABELS[current.section] : 'your section'}.</div>}
        {actionError && <div className="form-err" role="alert">{actionError}</div>}
        <div className="detail-grid">
          <div>
            <div style={{ marginBottom: 12 }}>
              <StatusPill status={app.status} />
              {app.waitingFor && <span className="small muted"> · {app.waitingFor}</span>}
            </div>
            <dl className="kv">
              <dt>Office</dt>
              <dd>{app.office}</dd>
              <dt>Position · salary</dt>
              <dd>
                {app.position}
                {app.salary ? ` · ${app.salary}` : ''}
              </dd>
              <dt>6.A Type of leave</dt>
              <dd>{app.leaveTypeLabel}</dd>
              <dt>6.B Details</dt>
              <dd>{detailsText(app)}</dd>
              <dt>6.C Inclusive dates</dt>
              <dd>
                {app.inclusiveDates}
                <div className="small muted">
                  {app.workingDays} working day{app.workingDays === 1 ? '' : 's'}
                </div>
              </dd>
              <dt>6.D Commutation</dt>
              <dd>{app.commutation === 'REQUESTED' ? 'Requested' : 'Not requested'}</dd>
              {app.hrRemarks && (
                <>
                  <dt>HR remarks</dt>
                  <dd>{app.hrRemarks}</dd>
                </>
              )}
              {app.cancelReason && (
                <>
                  <dt>Cancel reason</dt>
                  <dd>{app.cancelReason}</dd>
                </>
              )}
            </dl>
          </div>
          <div>
            <h3 style={{ marginBottom: 4 }}>Signatures</h3>
            <ol className="steps">
              {app.steps.map((s) => (
                <StepItem key={s.index} s={s} />
              ))}
            </ol>
          </div>
        </div>
      </Modal>
      {signing && current && (
        <SignDialog app={app} step={current} mode={signing} onClose={() => setSigning(null)} onDone={(a, msg) => (setSigning(null), changed(a, msg))} />
      )}
      {filing && <FileDialog app={app} onClose={() => setFiling(false)} onDone={(a) => (setFiling(false), changed(a, `Filed as ${a.statusLabel.toLowerCase()}.`))} />}
    </>
  );
}

function SignDialog(props: { app: ApplicationDetail; step: StepDto; mode: 'self' | 'hr'; onClose: () => void; onDone: (a: ApplicationDetail, msg: string) => void }) {
  const { app, step, mode } = props;
  const section = step.section as Section;
  const pre = app.creditsPrefill ?? {};
  const [decision, setDecision] = useState(section === '7A' ? 'CERTIFIED' : section === '7B' ? 'FOR_APPROVAL' : 'APPROVED');
  const [reason, setReason] = useState('');
  const [credits, setCredits] = useState<Record<string, string>>({
    asOf: pre.asOf ?? '',
    vlEarned: pre.vlEarned ?? '',
    vlLess: pre.vlLess ?? '',
    vlBalance: pre.vlBalance ?? '',
    slEarned: pre.slEarned ?? '',
    slLess: pre.slLess ?? '',
    slBalance: pre.slBalance ?? '',
  });
  const [daysWithPay, setDaysWithPay] = useState(String(app.workingDays));
  const [daysWithoutPay, setDaysWithoutPay] = useState('');
  const [othersSpecify, setOthersSpecify] = useState('');
  const [method, setMethod] = useState<'PAPER' | 'ESIGN'>(app.can.esign ? 'ESIGN' : 'PAPER');
  const [signer, setSigner] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const people = useLoad<EmployeeDto[]>(() => (mode === 'hr' ? api('api_listEmployees') : Promise.resolve([])), [mode]);

  const submit = async () => {
    setBusy(true);
    setErr('');
    const base = {
      applicationId: app.applicationId,
      version: app.version,
      decision: decision as 'CERTIFIED',
      reason: reason || undefined,
      credits: section === '7A' ? Object.fromEntries(Object.entries(credits).filter(([, v]) => v !== '')) : undefined,
      daysWithPay: section === '7C' && decision === 'APPROVED' ? daysWithPay : undefined,
      daysWithoutPay: section === '7C' && decision === 'APPROVED' ? daysWithoutPay || undefined : undefined,
      othersSpecify: section === '7C' && decision === 'APPROVED' ? othersSpecify || undefined : undefined,
    };
    try {
      const a =
        mode === 'hr'
          ? await api('api_recordPaperSignature', { ...base, signerEmployeeId: signer || undefined })
          : await api('api_sign', { ...base, method });
      props.onDone(a, mode === 'hr' ? 'Paper signature recorded.' : method === 'ESIGN' ? 'E-signed. The next signatory has been notified.' : 'Recorded as signed on paper.');
    } catch (e) {
      setErrors(fieldErrors(e));
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const credit = (k: string, label: string) => (
    <Field label={label}>
      <input type="text" inputMode="decimal" value={credits[k] ?? ''} onChange={(e) => setCredits((c) => ({ ...c, [k]: e.target.value }))} maxLength={20} />
    </Field>
  );

  return (
    <Modal
      narrow
      title={mode === 'hr' ? 'Record a paper signature' : `Sign ${SECTION_LABELS[section]}`}
      subtitle={`${app.applicationId} · ${app.applicantName} · ${app.inclusiveDates}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose} disabled={busy}>
            Back
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : mode === 'hr' ? 'Record signature' : method === 'ESIGN' ? 'E-sign now' : 'Mark as signed on paper'}
          </button>
        </>
      }
    >
      {err && <div className="form-err" role="alert">{err}</div>}
      {mode === 'hr' && (
        <Field label="Who signed the paper form" error={errors.signerEmployeeId} hint={`Leave as is if it was ${step.assignee}.`}>
          <select value={signer} onChange={(e) => setSigner(e.target.value)}>
            <option value="">The assigned signatory</option>
            {(people.data ?? [])
              .filter((p) => p.isActive && p.employeeId !== app.applicantId)
              .map((p) => (
                <option key={p.employeeId} value={p.employeeId}>
                  {p.fullName} ({p.position})
                </option>
              ))}
          </select>
        </Field>
      )}

      {section === '7A' && (app.leaveType === 'CTO' || app.leaveType === 'WELLNESS') && (
        <p className="small muted" style={{ marginBottom: 12 }}>
          {app.leaveType === 'WELLNESS'
            ? 'You certify the remaining wellness leave credits. The printed form fills them in from the Leave credits page.'
            : 'Check the CTO left on the Leave credits page before certifying.'}
        </p>
      )}
      {section === '7A' && app.leaveType !== 'CTO' && app.leaveType !== 'WELLNESS' && (
        <>
          <Field label="As of">
            <input type="date" value={credits.asOf ?? ''} onChange={(e) => setCredits((c) => ({ ...c, asOf: e.target.value }))} />
          </Field>
          <div className="cols-2">
            {credit('vlEarned', 'Vacation leave: total earned')}
            {credit('slEarned', 'Sick leave: total earned')}
            {credit('vlLess', 'Vacation leave: less this application')}
            {credit('slLess', 'Sick leave: less this application')}
            {credit('vlBalance', 'Vacation leave: balance')}
            {credit('slBalance', 'Sick leave: balance')}
          </div>
          <p className="small muted">{app.creditsPrefill ? 'Filled in from the leave credits on record. Check before signing.' : 'Optional when the credits are written on the paper form.'}</p>
        </>
      )}
      {section === '7B' && (
        <div className="choices" style={{ marginBottom: 12 }}>
          <label className="choice">
            <input type="radio" checked={decision === 'FOR_APPROVAL'} onChange={() => setDecision('FOR_APPROVAL')} />
            <span>For approval</span>
          </label>
          <label className="choice">
            <input type="radio" checked={decision === 'FOR_DISAPPROVAL'} onChange={() => setDecision('FOR_DISAPPROVAL')} />
            <span>For disapproval</span>
          </label>
        </div>
      )}
      {section === '7C' && (
        <>
          <div className="choices" style={{ marginBottom: 12 }}>
            <label className="choice">
              <input type="radio" checked={decision === 'APPROVED'} onChange={() => setDecision('APPROVED')} />
              <span>7.C Approved</span>
            </label>
            <label className="choice">
              <input type="radio" checked={decision === 'DISAPPROVED'} onChange={() => setDecision('DISAPPROVED')} />
              <span>7.D Disapproved</span>
            </label>
          </div>
          {decision === 'APPROVED' && (
            <div className="cols-2">
              <Field label="Days with pay">
                <input type="text" value={daysWithPay} onChange={(e) => setDaysWithPay(e.target.value)} maxLength={20} />
              </Field>
              <Field label="Days without pay">
                <input type="text" value={daysWithoutPay} onChange={(e) => setDaysWithoutPay(e.target.value)} maxLength={20} />
              </Field>
              <Field label="Others (specify)">
                <input type="text" value={othersSpecify} onChange={(e) => setOthersSpecify(e.target.value)} maxLength={120} />
              </Field>
            </div>
          )}
        </>
      )}
      {(decision === 'FOR_DISAPPROVAL' || decision === 'DISAPPROVED') && (
        <Field label={decision === 'DISAPPROVED' ? '7.D Disapproved due to' : 'For disapproval due to'} error={errors.reason}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        </Field>
      )}

      {mode === 'self' && (
        <>
          <div className="section-title" style={{ marginTop: 6 }}>
            How are you signing?
          </div>
          <div className="choices">
            <label className="choice">
              <input type="radio" checked={method === 'PAPER'} onChange={() => setMethod('PAPER')} />
              <span>
                I signed the paper form
                <small>The decision above is recorded so the applicant can follow it.</small>
              </span>
            </label>
            <label className="choice" style={app.can.esign ? undefined : { opacity: 0.6 }}>
              <input type="radio" checked={method === 'ESIGN'} disabled={!app.can.esign} onChange={() => setMethod('ESIGN')} />
              <span>
                E-sign (I am away from the office)
                <small>
                  {app.can.esign
                    ? 'Your specimen signature, name, date and time are placed on your section of the PDF. You can withdraw it until the next signatory acts.'
                    : 'Not available: e-signing is switched off, or you have not uploaded your specimen signature yet (My signature).'}
                </small>
              </span>
            </label>
          </div>
        </>
      )}
    </Modal>
  );
}

function FileDialog(props: { app: ApplicationDetail; onClose: () => void; onDone: (a: ApplicationDetail) => void }) {
  const [remarks, setRemarks] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const final = props.app.steps.find((s) => s.section === '7C')?.signature?.decision;
  return (
    <Modal
      narrow
      title="File this application"
      subtitle={`${props.app.applicationId} · ${props.app.applicantName}`}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose} disabled={busy}>
            Back
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                props.onDone(await api('api_fileApplication', { applicationId: props.app.applicationId, remarks: remarks || undefined }));
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Filing…' : `File as ${final === 'DISAPPROVED' ? 'disapproved' : 'approved'}`}
          </button>
        </>
      }
    >
      {err && <div className="form-err">{err}</div>}
      <p style={{ marginBottom: 12 }}>
        Confirm that the signed paper copy is complete and filed. The final status follows the 7.C/7.D decision, and a PDF copy is kept in the restricted Drive folder.
      </p>
      <Field label="Remarks (optional)">
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={300} />
      </Field>
    </Modal>
  );
}
