import { SECTIONS } from '@shared/constants';
import type { Application, Signature } from './model';
import { fullName } from './model';
import { eligibleSigners, type Ctx } from './applications';
import { renderForm6, type SectionView } from './form6';

/** Builds the CSC Form No. 6 HTML for an application with the signatures recorded so far. */
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
  return renderForm6({ app, settings: ctx.settings, sections });
}

export const form6FileName = (app: Application) => `${app.applicationId} Application for Leave - ${app.lastName}.pdf`;
