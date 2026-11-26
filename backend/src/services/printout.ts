import { SECTIONS } from '@shared/constants';
import type { Application, Signature } from './model';
import { fullName } from './model';
import { eligibleSigners, type Ctx } from './applications';
import { CREDIT_RULES } from '@shared/leaveTypes';
import { renderForm6, type SectionView } from './form6';
import { toApplication } from './model';
import { renderWellnessForm } from './wellnessForm';

/**
 * Builds the printable form for an application with the signatures recorded so far: the region's
 * Wellness Leave form (FORM-ASHRDD-031) for wellness leave, CSC Form No. 6 for everything else.
 */
export function form6Html(ctx: Ctx, app: Application, sigs: Map<number, Signature>): string {
  const sections: Partial<Record<(typeof SECTIONS)[number], SectionView>> = {};
  app.flow.forEach((step, index) => {
    const sig = sigs.get(index) ?? null;
    let name = '';
    let title = '';
    let imageBase64: string | null = null;
    if (sig) {
      const signer = ctx.employees.get(sig.signerId);
      name = signer ? fullName(signer) : '';
      title = sig.signerTitle;
      if (sig.method === 'ESIGN' && signer?.signatureFileId) imageBase64 = ctx.deps.files.readBase64(signer.signatureFileId);
    } else {
      // Print the expected signatory's name when there is exactly one (the OIC is not pre-printed).
      const list = eligibleSigners(ctx, app, step).filter((x) => !x.title.startsWith('OIC'));
      if (list.length === 1 && list[0]) {
        name = fullName(list[0].employee);
        title = list[0].title;
      }
    }
    sections[step.section] = { section: step.section, name, title, signature: sig, imageBase64 };
  });
  const applicantSignatureBase64 = applicantSignature(ctx, app);
  if (app.leaveType === 'WELLNESS') return renderWellnessForm({ app, settings: ctx.settings, sections, remainingDays: wellnessLeft(ctx, app), applicantSignatureBase64 });
  return renderForm6({ app, settings: ctx.settings, sections, applicantSignatureBase64 });
}

/** The applicant's e-signature, if they saved one under My e-signature. */
function applicantSignature(ctx: Ctx, app: Application): string | null {
  const fileId = ctx.employees.get(app.applicantId)?.signatureFileId;
  if (!fileId) return null;
  try {
    return ctx.deps.files.readBase64(fileId);
  } catch {
    return null;
  }
}

/** Wellness leave days the applicant has left in that year once this application is counted. */
function wellnessLeft(ctx: Ctx, app: Application): number {
  const year = (app.dates[0] ?? app.filedOn).slice(0, 4);
  const used = ctx.db
    .readAll('Applications')
    .map(toApplication)
    .filter(
      (a) =>
        a.applicantId === app.applicantId &&
        a.leaveType === 'WELLNESS' &&
        ['PENDING', 'FOR_FILING', 'APPROVED'].includes(a.status) &&
        (a.dates[0] ?? a.filedOn).slice(0, 4) === year &&
        a.applicationId <= app.applicationId,
    )
    .reduce((n, a) => n + a.workingDays, 0);
  return Math.max(0, CREDIT_RULES.wellnessDays - used);
}

export const form6FileName = (app: Application) =>
  `${app.applicationId} ${app.leaveType === 'WELLNESS' ? 'Wellness Leave Application' : 'Application for Leave'} - ${app.lastName}.pdf`;
