/*
 * DHSUD Region 10 Wellness Leave Application Form for Contract of Service Workers
 * (FORM-ASHRDD-031, Revision 0, effective 01 July 2026), as one HTML document.
 * Same constraints as form6.ts: tables and fixed sizes only, because the Apps Script PDF
 * converter ignores flexbox and grid. Pure function.
 *
 * Signatures map onto the leave workflow: Recommending Approval (Immediate Supervisor) is the 7.B
 * step, Approved by (Office Head) the 7.C step, and the Certification of Leave Credits the 7.A step.
 */
import type { SettingsDto } from '@shared/api';
import type { Section } from '@shared/constants';
import { formatInclusiveDates, formatLongDate, manilaDateTime } from '@shared/dates';
import { esc, signatureBlock, type SectionView } from './form6';
import type { Application, Signature } from './model';
import { DHSUD_SEAL_PNG_BASE64 } from './seal';

export const WELLNESS_FORM = { docControlNo: 'FORM-ASHRDD-031', revisionNo: '0', effectivity: '01 July 2026' } as const;

export interface WellnessView {
  app: Application;
  settings: SettingsDto;
  sections: Partial<Record<Section, SectionView>>;
  /** Wellness leave days left after this application; printed once the credits are certified. */
  remainingDays: number | null;
}

const CSS = `
  @page { size: A4; margin: 0.6in 0.7in; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; margin: 0; }
  .page { width: 6.85in; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; }
  td { vertical-align: top; padding: 5px 7px; }
  .bx td { border: 1px solid #000; }
  .hdr td { border: 1px solid #000; vertical-align: middle; }
  .title { font-size: 12pt; font-weight: bold; text-align: center; line-height: 1.35; }
  .ctl { font-size: 8pt; line-height: 1.6; }
  .lbl { font-weight: bold; width: 38%; }
  .sect { font-weight: bold; text-align: center; background: #d9d9d9; }
  .applicant { text-align: center; padding-top: 30px; }
  .applicant .ln { display: inline-block; width: 55%; border-top: 1px solid #000; padding-top: 2px; font-weight: bold; }
  .cap { font-size: 8.5pt; }
  .sigblock { text-align: center; margin-top: 8px; }
  .sigmark { height: 40px; line-height: 40px; }
  .sig { max-height: 40px; max-width: 180px; vertical-align: bottom; }
  .signame { border-top: 1px solid #000; width: 80%; margin: 0 auto; font-weight: bold; padding-top: 2px; }
  .sigcap { font-size: 8.5pt; }
  .note { font-size: 7pt; color: #333; }
  .small { font-size: 8pt; }
  .tiny { font-size: 7pt; color: #222; }
  .center { text-align: center; }
  .break { page-break-before: always; }
  .rec td, .rec th { border: 1px solid #000; padding: 4px; font-size: 9pt; text-align: left; vertical-align: top; }
  .rec th { background: #eee; }
`;

const decided = (s: SectionView | undefined) => s?.signature?.decision ?? '';
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export function renderWellnessForm(view: WellnessView): string {
  const { app, settings, sections } = view;
  const a7 = sections['7A'];
  const b7 = sections['7B'];
  const c7 = sections['7C'];
  const purpose = app.details.purpose ?? '';
  const recommendation = decided(b7) === 'FOR_DISAPPROVAL' ? 'For disapproval' : '';
  const approval = decided(c7) === 'DISAPPROVED' ? `Disapproved${c7?.signature?.data.reason ? `: ${c7.signature.data.reason}` : ''}` : '';
  const remaining = a7?.signature && view.remainingDays !== null ? days(view.remainingDays) : '';

  const page = `
  <div class="page">
    <table class="hdr">
      <tr>
        <td style="width:18%" class="center"><img src="data:image/png;base64,${DHSUD_SEAL_PNG_BASE64}" style="height:72px" alt=""></td>
        <td style="width:50%" class="title">WELLNESS LEAVE<br>APPLICATION FORM<br>FOR CONTRACT OF SERVICE WORKERS</td>
        <td style="width:32%" class="ctl">Doc Control No.: <b>${WELLNESS_FORM.docControlNo}</b><br>Revision No: ${WELLNESS_FORM.revisionNo}<br>Effectivity Date: ${WELLNESS_FORM.effectivity}</td>
      </tr>
    </table>

    <table class="bx" style="margin-top:14px">
      <tr><td class="lbl">Name:</td><td>${esc(`${app.lastName}, ${app.firstName} ${app.middleName}`.trim())}</td></tr>
      <tr><td class="lbl">Office:</td><td>${esc(app.office)}</td></tr>
      <tr><td class="lbl">Position:</td><td>${esc(app.position)}</td></tr>
      <tr><td class="lbl">Date filed:</td><td>${esc(formatLongDate(app.filedOn))}</td></tr>
      <tr><td colspan="2" class="sect">DETAILS OF WELLNESS LEAVE</td></tr>
      <tr><td class="lbl">Number of Working days applied for:</td><td>${esc(days(app.workingDays))}</td></tr>
      <tr><td class="lbl">Inclusive Date/s:</td><td>${esc(formatInclusiveDates(app.dates))}</td></tr>
      <tr><td class="lbl">Purpose of Leave:</td><td style="height:48px">${esc(purpose)}</td></tr>
      <tr><td colspan="2" class="applicant">
        <span class="ln">${esc(`${app.firstName} ${app.middleName ? `${app.middleName[0]}. ` : ''}${app.lastName}`.toUpperCase())}</span><br>
        <span class="cap">Signature of Applicant</span>
      </td></tr>
    </table>

    <table class="bx" style="margin-top:14px">
      <tr>
        <td style="width:50%"><b>Recommending Approval:</b>${recommendation ? `<div class="small">${esc(recommendation)}</div>` : ''}
          ${signatureBlock(b7, 'Signature Above Printed Name')}
          <div class="center cap">(Immediate Supervisor)</div>
        </td>
        <td style="width:50%"><b>APPROVED BY:</b>${approval ? `<div class="small">${esc(approval)}</div>` : ''}
          ${signatureBlock(c7, 'Signature Above Printed Name')}
          <div class="center cap">(Office Head)</div>
        </td>
      </tr>
    </table>

    <table class="bx" style="margin-top:14px">
      <tr><td colspan="2" class="sect">Certification of Leave Credits<br><span style="font-weight:normal" class="small">(for HRDD / AFD use)</span></td></tr>
      <tr><td class="lbl">Remaining Wellness Leave Credits</td><td>${esc(remaining)}</td></tr>
      <tr><td class="lbl">Certified by:</td><td>${signatureBlock(a7, 'Signature Above Printed Name')}</td></tr>
    </table>
    <div class="tiny" style="margin-top:6px">Generated by the DHSUD Region X Online Application for Leave · ${esc(app.applicationId)}</div>
  </div>`;

  const esigned = (Object.values(sections) as SectionView[]).filter((s) => s?.signature?.method === 'ESIGN');
  const role: Record<string, string> = { '7A': 'Certification of leave credits', '7B': 'Recommending approval', '7C': 'Approval' };
  const record = esigned.length
    ? `<div class="page break">
        <div class="center"><b>${esc(settings.agencyName)}</b><br><span class="small">${esc(settings.agencyAddress)}</span></div>
        <div class="title" style="margin:10px 0">ELECTRONIC SIGNATURE RECORD</div>
        <p>Wellness Leave application <b>${esc(app.applicationId)}</b> of <b>${esc(`${app.firstName} ${app.lastName}`)}</b>, filed ${esc(formatLongDate(app.filedOn))}, inclusive dates ${esc(formatInclusiveDates(app.dates))}.</p>
        <table class="rec">
          <tr><th>Part</th><th>Signatory</th><th>Action</th><th>Date and time (PHT)</th><th>Signature</th></tr>
          ${esigned
            .map((s) => {
              const sig = s.signature as Signature;
              return `<tr><td>${esc(role[sig.section] ?? sig.section)}</td><td>${esc(s.name)}<br><span class="small">${esc(s.title)}</span></td><td>${esc(sig.decision)}</td><td>${esc(manilaDateTime(Date.parse(sig.signedAt)))}</td><td>${s.imageBase64 ? `<img class="sig" src="data:image/png;base64,${s.imageBase64}" alt="">` : ''}</td></tr>`;
            })
            .join('')}
        </table>
      </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(app.applicationId)} Wellness Leave Application</title><style>${CSS}</style></head><body>${page}${record}</body></html>`;
}
