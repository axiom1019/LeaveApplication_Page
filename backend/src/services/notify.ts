import { STATUS_LABELS } from '@shared/constants';
import type { Deps } from '../platform/types';
import { isGovmail, type Application, type Employee } from './model';

/**
 * Email rules (proposal, "Who can sign in"):
 * - No email ever names the type of leave, the illness or other leave details.
 * - Personal addresses (staff without govmail, COS) get only the status and a link.
 * - govmail addresses may also see the applicant's name and the application number.
 * Sending never fails the action that triggered it; failures are logged.
 */
function send(deps: Deps, to: string, subject: string, body: string): void {
  if (!to) return;
  try {
    const quota = deps.mail.remainingQuota();
    if (quota !== null && quota < 1) {
      deps.log('error', 'Email skipped: daily quota used up', { subject });
      return;
    }
    const link = deps.appUrl();
    deps.mail.send(to, subject, `${body}\n\nOpen the Online Application for Leave: ${link}\n\nThis is an automatic message. Please do not reply.`);
  } catch (e) {
    deps.log('error', 'Email failed', { subject, error: e instanceof Error ? e.message : String(e) });
  }
}

export function notifyApplicant(deps: Deps, app: Application, applicant: Employee | undefined, waitingFor: string): void {
  if (!applicant) return;
  const status = app.status === 'PENDING' && waitingFor ? `${STATUS_LABELS.PENDING}: ${waitingFor}` : STATUS_LABELS[app.status];
  if (isGovmail(applicant.email)) {
    send(deps, applicant.email, `Leave application ${app.applicationId}: ${STATUS_LABELS[app.status]}`, `Your leave application ${app.applicationId} is now: ${status}.`);
  } else {
    send(deps, applicant.email, 'Your leave application has an update', `Your leave application status is now: ${STATUS_LABELS[app.status]}.`);
  }
}

export function notifySigners(deps: Deps, app: Application, signers: Employee[], applicantName: string): void {
  for (const s of signers) {
    if (isGovmail(s.email)) {
      send(deps, s.email, `For your signature: leave application ${app.applicationId}`, `The leave application ${app.applicationId} of ${applicantName} is waiting for your action.`);
    } else {
      send(deps, s.email, 'A leave application is waiting for your action', 'A leave application is waiting for your action.');
    }
  }
}

export function notifyHr(deps: Deps, app: Application, hr: Employee[], hrNotifyEmail: string): void {
  const to = hrNotifyEmail ? [hrNotifyEmail] : hr.map((e) => e.email);
  for (const email of to) {
    if (isGovmail(email)) send(deps, email, `For filing: leave application ${app.applicationId}`, `All signatories have acted on leave application ${app.applicationId}. It is ready for HR filing.`);
    else send(deps, email, 'A leave application is ready for filing', 'A leave application is ready for HR filing.');
  }
}
