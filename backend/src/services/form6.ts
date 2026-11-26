/*
 * CSC Form No. 6 (Revised 2020), Application for Leave, as one HTML document.
 * The same HTML is printed by the browser (Print) and converted to PDF on the server, so it
 * sticks to tables, borders and fixed font sizes (the Apps Script converter ignores flexbox/grid).
 * Pure function: no platform calls, so it moves to a server as is.
 */
import type { SettingsDto } from '@shared/api';
import type { Section } from '@shared/constants';
import { formatInclusiveDates, formatLongDate, manilaDateTime } from '@shared/dates';
import { LEAVE_TYPES, othersText, LOCATION_CHOICES, OTHER_PURPOSE_CHOICES, SICK_CHOICES, STUDY_CHOICES } from '@shared/leaveTypes';
import type { Application, Signature } from './model';

export interface SectionView {
  section: Section;
  /** Name and title printed under the signature line. */
  name: string;
  title: string;
  signature: Signature | null;
  /** PNG base64 of the specimen signature, only for e-signatures. */
  imageBase64: string | null;
}

export interface Form6View {
  app: Application;
  settings: SettingsDto;
  sections: Partial<Record<Section, SectionView>>;
  /** Seal image (PNG base64) for the header, optional. */
  sealBase64?: string | null;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const box = (on: boolean) => `<span class="cb">${on ? 'X' : '&nbsp;'}</span>`;
const line = (v: string, width = '100%') => `<span class="ln" style="width:${width}">${v ? esc(v) : '&nbsp;'}</span>`;

export function signatureBlock(v: SectionView | undefined, caption: string): string {
  const sig = v?.signature ?? null;
  let mark = '&nbsp;';
  if (sig?.method === 'ESIGN' && v?.imageBase64) {
    mark = `<img class="sig" src="data:image/png;base64,${v.imageBase64}" alt="signature">`;
  } else if (sig?.method === 'PAPER') {
    mark = '<span class="note">(signed on the paper copy)</span>';
  }
  const esignNote =
    sig?.method === 'ESIGN' ? `<div class="note">Electronically signed ${esc(manilaDateTime(Date.parse(sig.signedAt)))} · Ref. ${esc(sig.applicationId)}</div>` : '';
  return `<div class="sigblock">
    <div class="sigmark">${mark}</div>
    <div class="signame">${v?.name ? esc(v.name.toUpperCase()) : '&nbsp;'}</div>
    <div class="sigcap">${v?.title ? esc(v.title) : esc(caption)}</div>
    ${esignNote}
  </div>`;
}

const CSS = `
  @page { size: 8.5in 13in; margin: 0.45in 0.5in; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #000; margin: 0; }
  .page { width: 7.5in; margin: 0 auto; }
  table { border-collapse: collapse; width: 100%; }
  td { vertical-align: top; padding: 3px 5px; }
  .bx td, td.bx { border: 1px solid #000; }
  .hdr td { border: none; padding: 0; }
  .small { font-size: 7.5pt; }
  .tiny { font-size: 6.8pt; color: #222; }
  .center { text-align: center; }
  .right { text-align: right; }
  .title { font-size: 15pt; font-weight: bold; letter-spacing: 1px; text-align: center; padding: 6px 0 8px; }
  .sect { font-weight: bold; text-align: center; background: #d9d9d9; border: 1px solid #000; padding: 3px; }
  .lbl { font-size: 8pt; font-weight: bold; }
  .val { font-size: 10pt; min-height: 14px; }
  .cb { display: inline-block; width: 10px; height: 10px; border: 1px solid #000; font-size: 8pt; line-height: 10px; text-align: center; font-weight: bold; margin-right: 4px; vertical-align: middle; }
  .ln { display: inline-block; border-bottom: 1px solid #000; min-height: 12px; vertical-align: bottom; }
  .opt { margin: 2px 0; }
  .sigblock { text-align: center; margin-top: 8px; }
  .sigmark { height: 38px; line-height: 38px; }
  .sig { max-height: 38px; max-width: 170px; vertical-align: bottom; }
  .signame { border-top: 1px solid #000; width: 75%; margin: 0 auto; font-weight: bold; padding-top: 2px; }
  .sigcap { font-size: 8pt; }
  .note { font-size: 7pt; color: #333; }
  .cred td { border: 1px solid #000; text-align: center; font-size: 8.5pt; padding: 2px; }
  .break { page-break-before: always; }
  .rec td, .rec th { border: 1px solid #000; padding: 4px; font-size: 9pt; text-align: left; vertical-align: top; }
  .rec th { background: #eee; }
`;

export function renderForm6(view: Form6View): string {
  const { app, settings, sections } = view;
  const d = app.details;
  const typeRows = LEAVE_TYPES.filter((t) => t.for === 'REGULAR' && t.code !== 'OTHERS')
    .map((t) => `<div class="opt">${box(app.leaveType === t.code)}${esc(t.label)} <span class="tiny">(${esc(t.basis)})</span></div>`)
    .join('');
  const othersLabel = othersText(app.leaveType, app.leaveTypeOther, app.details.hours);
  const others = othersLabel !== null;
  const a7 = sections['7A'];
  const b7 = sections['7B'];
  const c7 = sections['7C'];
  const cr = (a7?.signature?.data.credits ?? {}) as Record<string, string | undefined>;
  const recommendation = b7?.signature?.decision ?? '';
  const approval = c7?.signature?.decision ?? '';

  const seal = view.sealBase64 ? `<img src="data:image/png;base64,${view.sealBase64}" style="height:56px" alt="">` : '';
  const page1 = `
  <div class="page">
    <table class="hdr"><tr>
      <td class="small" style="width:33%"><i>Civil Service Form No. 6<br>Revised 2020</i></td>
      <td class="center" style="width:34%">${seal}</td>
      <td class="small right" style="width:33%"><b>ANNEX A</b><br><br><span class="tiny">Ref. ${esc(app.applicationId)}</span></td>
    </tr></table>
    <div class="center" style="margin-top:2px">Republic of the Philippines<br><b>${esc(settings.agencyName)}</b><br><span class="small">${esc(settings.agencyAddress)}</span></div>
    <div class="title">APPLICATION FOR LEAVE</div>

    <table class="bx">
      <tr>
        <td style="width:34%"><div class="lbl">1. OFFICE/DEPARTMENT</div><div class="val">${esc(app.office)}</div></td>
        <td colspan="2"><div class="lbl">2. NAME:&nbsp;&nbsp;(Last)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(First)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(Middle)</div>
          <div class="val">${esc(app.lastName)}, ${esc(app.firstName)} ${esc(app.middleName)}</div></td>
      </tr>
      <tr>
        <td><div class="lbl">3. DATE OF FILING</div><div class="val">${esc(formatLongDate(app.filedOn))}</div></td>
        <td style="width:40%"><div class="lbl">4. POSITION</div><div class="val">${esc(app.position)}</div></td>
        <td><div class="lbl">5. SALARY</div><div class="val">${esc(app.salary)}</div></td>
      </tr>
    </table>

    <div class="sect">6. DETAILS OF APPLICATION</div>
    <table class="bx">
      <tr>
        <td style="width:55%"><div class="lbl">6.A TYPE OF LEAVE TO BE AVAILED OF</div>
          ${typeRows}
          <div class="opt" style="margin-top:6px"><i>Others:</i> ${box(others)}${line(othersLabel ?? '', '75%')}</div>
        </td>
        <td><div class="lbl">6.B DETAILS OF LEAVE</div>
          <div class="small"><i>In case of Vacation/Special Privilege Leave:</i></div>
          <div class="opt">${box(d.location === 'PH')}${LOCATION_CHOICES.PH} ${line(d.location === 'PH' ? (d.locationText ?? '') : '', '45%')}</div>
          <div class="opt">${box(d.location === 'ABROAD')}${LOCATION_CHOICES.ABROAD} (Specify) ${line(d.location === 'ABROAD' ? (d.locationText ?? '') : '', '40%')}</div>
          <div class="small" style="margin-top:4px"><i>In case of Sick Leave:</i></div>
          <div class="opt">${box(d.sick === 'HOSPITAL')}${SICK_CHOICES.HOSPITAL} (Specify Illness) ${line(d.sick === 'HOSPITAL' ? (d.illness ?? '') : '', '30%')}</div>
          <div class="opt">${box(d.sick === 'OUTPATIENT')}${SICK_CHOICES.OUTPATIENT} (Specify Illness) ${line(d.sick === 'OUTPATIENT' ? (d.illness ?? '') : '', '28%')}</div>
          <div class="small" style="margin-top:4px"><i>In case of Special Leave Benefits for Women:</i></div>
          <div class="opt">(Specify Illness) ${line(app.leaveType === 'SLBW' ? (d.illness ?? '') : '', '60%')}</div>
          <div class="small" style="margin-top:4px"><i>In case of Study Leave:</i></div>
          <div class="opt">${box(d.study === 'MASTERS')}${STUDY_CHOICES.MASTERS}</div>
          <div class="opt">${box(d.study === 'BAR')}${STUDY_CHOICES.BAR}</div>
          <div class="small" style="margin-top:4px"><i>Other purpose:</i></div>
          <div class="opt">${box(d.otherPurpose === 'MONETIZATION')}${OTHER_PURPOSE_CHOICES.MONETIZATION}</div>
          <div class="opt">${box(d.otherPurpose === 'TERMINAL')}${OTHER_PURPOSE_CHOICES.TERMINAL}</div>
        </td>
      </tr>
      <tr>
        <td><div class="lbl">6.C NUMBER OF WORKING DAYS APPLIED FOR</div>
          <div class="val" style="margin:2px 0 6px 12px">${app.workingDays}</div>
          <div class="lbl">INCLUSIVE DATES</div>
          <div class="val" style="margin-left:12px">${esc(formatInclusiveDates(app.dates))}</div>
        </td>
        <td><div class="lbl">6.D COMMUTATION</div>
          <div class="opt">${box(app.commutation === 'NOT_REQUESTED')}Not Requested</div>
          <div class="opt">${box(app.commutation === 'REQUESTED')}Requested</div>
          <div class="sigblock"><div class="sigmark">&nbsp;</div>
            <div class="signame">${esc(`${app.firstName} ${app.middleName ? `${app.middleName.charAt(0)}. ` : ''}${app.lastName}`.toUpperCase())}</div>
            <div class="sigcap">(Signature of Applicant)</div></div>
        </td>
      </tr>
    </table>

    <div class="sect">7. DETAILS OF ACTION ON APPLICATION</div>
    <table class="bx">
      <tr>
        <td style="width:55%"><div class="lbl">7.A CERTIFICATION OF LEAVE CREDITS</div>
          <div class="center small" style="margin:3px 0">As of ${line(cr.asOf ? formatLongDate(cr.asOf) : '', '45%')}</div>
          <table class="cred">
            <tr><td style="width:34%">&nbsp;</td><td><b>Vacation Leave</b></td><td><b>Sick Leave</b></td></tr>
            <tr><td><i>Total Earned</i></td><td>${esc(cr.vlEarned ?? '')}</td><td>${esc(cr.slEarned ?? '')}</td></tr>
            <tr><td><i>Less this application</i></td><td>${esc(cr.vlLess ?? '')}</td><td>${esc(cr.slLess ?? '')}</td></tr>
            <tr><td><i>Balance</i></td><td>${esc(cr.vlBalance ?? '')}</td><td>${esc(cr.slBalance ?? '')}</td></tr>
          </table>
          ${signatureBlock(a7, '(Authorized Officer)')}
        </td>
        <td><div class="lbl">7.B RECOMMENDATION</div>
          <div class="opt">${box(recommendation === 'FOR_APPROVAL')}For approval</div>
          <div class="opt">${box(recommendation === 'FOR_DISAPPROVAL')}For disapproval due to ${line(recommendation === 'FOR_DISAPPROVAL' ? (b7?.signature?.data.reason ?? '') : '', '50%')}</div>
          <div class="opt">${line('', '95%')}</div>
          ${signatureBlock(b7, '(Authorized Officer)')}
        </td>
      </tr>
      <tr>
        <td><div class="lbl">7.C APPROVED FOR:</div>
          <div class="opt">${line(approval === 'APPROVED' ? (c7?.signature?.data.daysWithPay ?? '') : '', '22%')} days with pay</div>
          <div class="opt">${line(approval === 'APPROVED' ? (c7?.signature?.data.daysWithoutPay ?? '') : '', '22%')} days without pay</div>
          <div class="opt">${line(approval === 'APPROVED' ? (c7?.signature?.data.othersSpecify ?? '') : '', '22%')} others (Specify)</div>
        </td>
        <td><div class="lbl">7.D DISAPPROVED DUE TO:</div>
          <div class="opt">${line(approval === 'DISAPPROVED' ? (c7?.signature?.data.reason ?? '') : '', '95%')}</div>
          <div class="opt">${line('', '95%')}</div>
        </td>
      </tr>
      <tr><td colspan="2">${signatureBlock(c7, '(Authorized Official)')}</td></tr>
    </table>
    <div class="tiny" style="margin-top:4px">Generated by the DHSUD Region X Online Application for Leave · ${esc(app.applicationId)}</div>
  </div>`;

  const esigned = (Object.values(sections) as SectionView[]).filter((s) => s?.signature?.method === 'ESIGN');
  const record = esigned.length
    ? `<div class="page break">
        <div class="center"><b>${esc(settings.agencyName)}</b><br><span class="small">${esc(settings.agencyAddress)}</span></div>
        <div class="title">ELECTRONIC SIGNATURE RECORD</div>
        <p>Application for Leave <b>${esc(app.applicationId)}</b> of <b>${esc(`${app.firstName} ${app.lastName}`)}</b>, filed ${esc(formatLongDate(app.filedOn))}, inclusive dates ${esc(formatInclusiveDates(app.dates))}.</p>
        <p class="small">The signatories below signed their sections electronically in the Online Application for Leave while away from the office. Attach this record to the paper form.</p>
        <table class="rec">
          <tr><th>Section</th><th>Signatory</th><th>Action</th><th>Date and time (PHT)</th><th>Signature</th></tr>
          ${esigned
            .map((s) => {
              const sig = s.signature as Signature;
              const action = { CERTIFIED: 'Certified leave credits', FOR_APPROVAL: 'Recommended approval', FOR_DISAPPROVAL: 'Recommended disapproval', APPROVED: 'Approved', DISAPPROVED: 'Disapproved' }[sig.decision] ?? sig.decision;
              return `<tr><td>${esc(sig.section.replace(/^7/, '7.'))}</td><td>${esc(s.name)}<br><span class="small">${esc(s.title)}</span></td><td>${esc(action)}${sig.data.reason ? `<br><span class="small">${esc(sig.data.reason)}</span>` : ''}</td><td>${esc(manilaDateTime(Date.parse(sig.signedAt)))}</td><td>${s.imageBase64 ? `<img class="sig" src="data:image/png;base64,${s.imageBase64}" alt="">` : ''}</td></tr>`;
            })
            .join('')}
        </table>
        <p class="tiny" style="margin-top:10px">Each e-signature is logged with the signer's account, the time and the application reference in the system's audit log.</p>
      </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(app.applicationId)} Application for Leave</title><style>${CSS}</style></head><body>${page1}${record}</body></html>`;
}
