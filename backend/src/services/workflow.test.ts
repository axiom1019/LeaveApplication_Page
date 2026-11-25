import { describe, expect, it } from 'vitest';
import type { ApiResult } from '@shared/api';
import { endpoints } from '../api/endpoints';
import { PEOPLE, seededDeps } from '../testing/fixtures';
import { initializeDatabase } from './setup';
import { createMemoryDeps } from '../platform/memory';

type Deps = ReturnType<typeof seededDeps>;

function ok<T>(r: ApiResult<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data;
}
function err<T>(r: ApiResult<T>) {
  if (r.ok) throw new Error('expected an error');
  return r.error;
}
const as = (deps: Deps, email: string) => deps.setActiveEmail(email);

let keyN = 0;
const key = () => `00000000-0000-4000-8000-${(++keyN).toString(16).padStart(12, '0').replace(/^0/, 'a')}`;

const vacation = (dates: string[]) => ({
  leaveType: 'VL' as const,
  details: { location: 'PH' as const, locationText: 'Bukidnon' },
  dates,
  commutation: 'NOT_REQUESTED' as const,
});

function fileAs(deps: Deps, email: string, form = vacation(['2026-12-07', '2026-12-08', '2026-12-09'])) {
  as(deps, email);
  return ok(endpoints.api_fileLeave(deps, { idempotencyKey: key(), form }));
}

function signAs(deps: Deps, email: string, applicationId: string, decision: string, extra: Record<string, unknown> = {}) {
  as(deps, email);
  const app = ok(endpoints.api_getApplication(deps, { applicationId }));
  return endpoints.api_sign(deps, { applicationId, version: app.version, method: 'PAPER', decision, ...extra });
}

describe('filing', () => {
  it('files a leave, counts working days without weekends and holidays, and numbers it', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.owner);
    ok(endpoints.api_saveHoliday(deps, { date: '2026-12-08', name: 'Feast of the Immaculate Conception' }));
    const app = fileAs(deps, PEOPLE.staff, vacation(['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08']));
    expect(app.applicationId).toBe('LA-2026-0001');
    expect(app.workingDays).toBe(2); // Fri 4 and Mon 7; Sat, Sun and the holiday are left out
    expect(app.inclusiveDates).toBe('Dec 4–8, 2026');
    expect(app.status).toBe('PENDING');
    expect(app.waitingFor).toContain('Juan S. Dela Cruz');
    expect(app.office).toBe('Technical Services Division');
  });

  it('returns the same application when a submission is retried', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.staff);
    const k = key();
    const a = ok(endpoints.api_fileLeave(deps, { idempotencyKey: k, form: vacation(['2026-12-07']) }));
    const b = ok(endpoints.api_fileLeave(deps, { idempotencyKey: k, form: vacation(['2026-12-07']) }));
    expect(b.applicationId).toBe(a.applicationId);
    expect(ok(endpoints.api_myApplications(deps, {}))).toHaveLength(1);
  });

  it('refuses dates that overlap an open application', () => {
    const deps = seededDeps();
    fileAs(deps, PEOPLE.staff, vacation(['2026-12-07', '2026-12-08']));
    as(deps, PEOPLE.staff);
    const e = err(endpoints.api_fileLeave(deps, { idempotencyKey: key(), form: vacation(['2026-12-08']) }));
    expect(e.code).toBe('CONFLICT');
  });

  it('validates the details the form needs for the chosen type', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.staff);
    const e = err(endpoints.api_fileLeave(deps, { idempotencyKey: key(), form: { leaveType: 'SL', details: {}, dates: ['2026-12-07'], commutation: 'NOT_REQUESTED' } }));
    expect(e.code).toBe('VALIDATION');
  });

  it('keeps only the 6.B details that belong to the type', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.staff);
    const app = ok(
      endpoints.api_fileLeave(deps, {
        idempotencyKey: key(),
        form: { leaveType: 'SL', details: { sick: 'OUTPATIENT', illness: 'Flu', location: 'ABROAD', locationText: 'Japan' }, dates: ['2026-12-07'], commutation: 'NOT_REQUESTED' },
      }),
    );
    expect(app.details).toEqual({ sick: 'OUTPATIENT', illness: 'Flu' });
  });

  it('limits filing to the pilot division when one is set', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.owner);
    const s = ok(endpoints.api_getSettings(deps, {}));
    const ord = ok(endpoints.api_listDivisions(deps, {})).find((d) => d.code === 'ORD')!;
    ok(endpoints.api_saveSettings(deps, { ...s, pilotDivisionIds: [ord.divisionId] }));
    as(deps, PEOPLE.staff);
    expect(err(endpoints.api_fileLeave(deps, { idempotencyKey: key(), form: vacation(['2026-12-07']) })).code).toBe('FORBIDDEN');
    const me = ok(endpoints.api_session(deps, {})).me!;
    expect(me.canFile).toBe(false);
  });
});

describe('sign-in', () => {
  it('recognises a registered govmail account and denies an unregistered one', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.staff);
    expect(ok(endpoints.api_session(deps, {})).me?.employee.email).toBe(PEOPLE.staff);
    as(deps, 'stranger@dhsud.gov.ph');
    const s = ok(endpoints.api_session(deps, {}));
    expect(s.me).toBeNull();
    expect(s.denied).toBe(true);
    expect(err(endpoints.api_myApplications(deps, {})).code).toBe('UNAUTHENTICATED');
  });

  it('signs in a COS employee on a personal address with an emailed code', () => {
    const deps = seededDeps();
    as(deps, ''); // Google withholds personal-account emails
    ok(endpoints.api_requestCode(deps, { email: 'COS.Worker@gmail.com' }));
    const mail = deps.sent.at(-1)!;
    expect(mail.to).toBe(PEOPLE.cos);
    const code = /\b(\d{6})\b/.exec(mail.subject)![1]!;
    expect(err(endpoints.api_verifyCode(deps, { email: PEOPLE.cos, code: code === '000000' ? '111111' : '000000' })).code).toBe('VALIDATION');
    const { token, me } = ok(endpoints.api_verifyCode(deps, { email: PEOPLE.cos, code }));
    expect(me.employee.employmentType).toBe('COS');
    expect(ok(endpoints.api_myApplications(deps, { token }))).toEqual([]);
    // A code works once.
    expect(err(endpoints.api_verifyCode(deps, { email: PEOPLE.cos, code })).code).toBe('VALIDATION');
    ok(endpoints.api_signOut(deps, { token }));
    expect(err(endpoints.api_myApplications(deps, { token })).code).toBe('UNAUTHENTICATED');
  });

  it('answers the same for an unregistered address and sends nothing', () => {
    const deps = seededDeps();
    as(deps, '');
    const before = deps.sent.length;
    expect(ok(endpoints.api_requestCode(deps, { email: 'nobody@gmail.com' }))).toEqual({ sent: true });
    expect(deps.sent.length).toBe(before);
  });

  it('locks out after five wrong codes', () => {
    const deps = seededDeps();
    as(deps, '');
    ok(endpoints.api_requestCode(deps, { email: PEOPLE.cos }));
    const code = /\b(\d{6})\b/.exec(deps.sent.at(-1)!.subject)![1]!;
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) err(endpoints.api_verifyCode(deps, { email: PEOPLE.cos, code: wrong }));
    expect(err(endpoints.api_verifyCode(deps, { email: PEOPLE.cos, code })).code).toBe('VALIDATION');
  });
});

describe('signatories', () => {
  it('runs the full flow: Division Chief, Supervising AO, RD, then HR files it', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.staff);

    // Out of turn: the RD can't sign before the Division Chief.
    as(deps, PEOPLE.rd);
    expect(err(endpoints.api_sign(deps, { applicationId, version: 1, method: 'PAPER', decision: 'APPROVED' })).code).toBe('NOT_FOUND');
    ok(signAs(deps, PEOPLE.chief, applicationId, 'FOR_APPROVAL'));
    ok(signAs(deps, PEOPLE.ao, applicationId, 'CERTIFIED', { credits: { asOf: '2026-11-30', vlEarned: '15', vlLess: '3', vlBalance: '12' } }));
    const done = ok(signAs(deps, PEOPLE.rd, applicationId, 'APPROVED', { daysWithPay: '3' }));
    expect(done.status).toBe('FOR_FILING');
    expect(done.can.withdraw).toBe(true);

    as(deps, PEOPLE.hr);
    const filed = ok(endpoints.api_fileApplication(deps, { applicationId }));
    expect(filed.status).toBe('APPROVED');
    expect([...deps.stored.keys()].some((k) => k.startsWith('file-pdf'))).toBe(true);

    const html = ok(endpoints.api_formHtml(deps, { applicationId })).html;
    expect(html).toContain('APPLICATION FOR LEAVE');
    expect(html).toContain('RAMON S. MENDOZA');
  });

  it("sends a Division Chief's own leave straight to the Supervising AO and the RD, with no 7.B", () => {
    const deps = seededDeps();
    const app = fileAs(deps, PEOPLE.chief);
    expect(app.steps.map((s) => s.section)).toEqual(['7A', '7C']);
    expect(app.waitingFor).toContain('Ana S. Garcia');
    expect(signAs(deps, PEOPLE.ao, app.applicationId, 'CERTIFIED').ok).toBe(true);
    const done = signAs(deps, PEOPLE.rd, app.applicationId, 'APPROVED');
    expect(done.ok).toBe(true);
    // Staff in the same division still go through their chief first.
    expect(fileAs(deps, PEOPLE.staff).steps.map((s) => s.section)).toEqual(['7B', '7A', '7C']);
  });

  it('ends as disapproved when the RD disapproves', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    ok(signAs(deps, PEOPLE.chief, applicationId, 'FOR_DISAPPROVAL', { reason: 'Deadline' }));
    ok(signAs(deps, PEOPLE.ao, applicationId, 'CERTIFIED'));
    ok(signAs(deps, PEOPLE.rd, applicationId, 'DISAPPROVED', { reason: 'Exigency of the service' }));
    as(deps, PEOPLE.hr);
    expect(ok(endpoints.api_fileApplication(deps, { applicationId })).status).toBe('DISAPPROVED');
  });

  it('refuses a decision that does not belong to the section', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    expect(err(signAs(deps, PEOPLE.chief, applicationId, 'APPROVED')).code).toBe('VALIDATION');
  });

  it('refuses a signature on a version the signer did not review', () => {
    const deps = seededDeps();
    const { applicationId, version } = fileAs(deps, PEOPLE.staff);
    as(deps, PEOPLE.chief);
    ok(endpoints.api_sign(deps, { applicationId, version, method: 'PAPER', decision: 'FOR_APPROVAL' }));
    as(deps, PEOPLE.ao);
    expect(err(endpoints.api_sign(deps, { applicationId, version, method: 'PAPER', decision: 'CERTIFIED' })).code).toBe('STALE_VERSION');
  });

  it("sends a Division Chief's own leave past the chief step, straight on to the AO and the RD", () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.chief);
    as(deps, PEOPLE.chief);
    const app = ok(endpoints.api_getApplication(deps, { applicationId }));
    expect(app.can.sign).toBe(false);
    expect(app.steps.map((s) => s.signatory)).toEqual(['SUPERVISING_AO', 'REGIONAL_DIRECTOR']);
    ok(signAs(deps, PEOPLE.ao, applicationId, 'CERTIFIED'));
    ok(signAs(deps, PEOPLE.rd, applicationId, 'APPROVED'));
    as(deps, PEOPLE.chief);
    expect(ok(endpoints.api_getApplication(deps, { applicationId })).status).toBe('FOR_FILING');
  });

  it('skips the chief step for a division with no chief, such as Legal', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.owner);
    const legal = ok(endpoints.api_listDivisions(deps, {})).find((d) => d.code === 'LEGAL')!;
    expect(legal.noChief).toBe(true);
    const staff = ok(endpoints.api_listEmployees(deps, {})).find((e) => e.email === PEOPLE.staff)!;
    ok(endpoints.api_saveEmployee(deps, { ...staff, divisionId: legal.divisionId, middleName: staff.middleName || undefined, salary: staff.salary || undefined }));
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    as(deps, PEOPLE.staff);
    expect(ok(endpoints.api_getApplication(deps, { applicationId })).steps.map((s) => s.signatory)).toEqual(['SUPERVISING_AO', 'REGIONAL_DIRECTOR']);
  });

  it('creates the six Region 10 divisions and the Office of the RD on setup', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.owner);
    const codes = ok(endpoints.api_listDivisions(deps, {})).map((d) => d.code);
    for (const c of ['ORD', 'AFD', 'HREDRD', 'HOACDD', 'ELUPDD', 'PHSD', 'LEGAL']) expect(codes).toContain(c);
  });

  it('never lets the applicant sign their own application', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.rd);
    ok(signAs(deps, PEOPLE.ao, applicationId, 'CERTIFIED'));
    as(deps, PEOPLE.rd);
    const app = ok(endpoints.api_getApplication(deps, { applicationId }));
    expect(app.steps.at(-1)!.signatory).toBe('REGIONAL_DIRECTOR');
    expect(app.can.sign).toBe(false);
  });

  it('lets a signer withdraw only until the next signatory acts', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    ok(signAs(deps, PEOPLE.chief, applicationId, 'FOR_APPROVAL'));
    as(deps, PEOPLE.chief);
    const back = ok(endpoints.api_withdrawSignature(deps, { applicationId }));
    expect(back.steps[0]!.state).toBe('CURRENT');
    ok(signAs(deps, PEOPLE.chief, applicationId, 'FOR_APPROVAL'));
    ok(signAs(deps, PEOPLE.ao, applicationId, 'CERTIFIED'));
    as(deps, PEOPLE.chief);
    expect(err(endpoints.api_withdrawSignature(deps, { applicationId })).code).toBe('FORBIDDEN');
  });

  it('lets the OIC sign only on the dates they are assigned', () => {
    const deps = seededDeps({ nowMs: Date.UTC(2026, 11, 1, 1) }); // Dec 1, 9 AM Manila
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    ok(signAs(deps, PEOPLE.chief, applicationId, 'FOR_APPROVAL'));
    ok(signAs(deps, PEOPLE.ao, applicationId, 'CERTIFIED'));
    as(deps, PEOPLE.hr);
    expect(err(endpoints.api_saveOic(deps, { employeeId: deps.ids.oic, startDate: '2026-12-01', endDate: '2026-12-03' })).code).toBe('FORBIDDEN');
    as(deps, PEOPLE.rd);
    ok(endpoints.api_saveOic(deps, { employeeId: deps.ids.oic, startDate: '2026-12-02', endDate: '2026-12-03' }));
    as(deps, PEOPLE.oic);
    expect(err(endpoints.api_getApplication(deps, { applicationId })).code).toBe('NOT_FOUND');
    deps.advance(24 * 3600 * 1000); // Dec 2
    as(deps, PEOPLE.oic);
    expect(ok(endpoints.api_session(deps, {})).me?.isOicToday).toBe(true);
    const signed = ok(signAs(deps, PEOPLE.oic, applicationId, 'APPROVED', { daysWithPay: '3' }));
    expect(signed.steps[2]!.signature?.signerTitle).toBe('OIC, Regional Director');
  });

  it('e-signs only when switched on and a specimen signature is on file, and adds the record page', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    as(deps, PEOPLE.chief);
    const v = ok(endpoints.api_getApplication(deps, { applicationId })).version;
    expect(err(endpoints.api_sign(deps, { applicationId, version: v, method: 'ESIGN', decision: 'FOR_APPROVAL' })).code).toBe('FORBIDDEN');
    as(deps, PEOPLE.owner);
    ok(endpoints.api_saveSettings(deps, { ...ok(endpoints.api_getSettings(deps, {})), esignEnabled: true }));
    as(deps, PEOPLE.chief);
    expect(err(endpoints.api_sign(deps, { applicationId, version: v, method: 'ESIGN', decision: 'FOR_APPROVAL' })).code).toBe('VALIDATION');
    ok(endpoints.api_uploadSignature(deps, { pngBase64: 'iVBORw0KGgo'.padEnd(200, 'A') }));
    const signed = ok(endpoints.api_sign(deps, { applicationId, version: v, method: 'ESIGN', decision: 'FOR_APPROVAL' }));
    expect(signed.steps[0]!.signature?.method).toBe('ESIGN');
    const html = ok(endpoints.api_formHtml(deps, { applicationId })).html;
    expect(html).toContain('ELECTRONIC SIGNATURE RECORD');
    expect(html).toContain('Electronically signed');
  });

  it('follows a changed signatory order for new applications only', () => {
    const deps = seededDeps();
    const first = fileAs(deps, PEOPLE.staff, vacation(['2026-12-07']));
    as(deps, PEOPLE.owner);
    const s = ok(endpoints.api_getSettings(deps, {}));
    ok(
      endpoints.api_saveSettings(deps, {
        ...s,
        signatoryFlow: [
          { signatory: 'SUPERVISING_AO', section: '7A' },
          { signatory: 'DIVISION_CHIEF', section: '7B' },
          { signatory: 'REGIONAL_DIRECTOR', section: '7C' },
        ],
      }),
    );
    const second = fileAs(deps, PEOPLE.staff, vacation(['2026-12-14']));
    expect(first.steps[0]!.signatory).toBe('DIVISION_CHIEF');
    expect(second.steps[0]!.signatory).toBe('SUPERVISING_AO');
    as(deps, PEOPLE.owner);
    expect(err(endpoints.api_saveSettings(deps, { ...s, signatoryFlow: [s.signatoryFlow[0], s.signatoryFlow[0], s.signatoryFlow[2]] })).code).toBe('VALIDATION');
  });

  it('shows signatories only what waits for them, and hides other applications', () => {
    const deps = seededDeps();
    const { applicationId } = fileAs(deps, PEOPLE.staff);
    as(deps, PEOPLE.ao);
    expect(ok(endpoints.api_inbox(deps, {}))).toHaveLength(0);
    expect(err(endpoints.api_getApplication(deps, { applicationId })).code).toBe('NOT_FOUND');
    as(deps, PEOPLE.chief);
    expect(ok(endpoints.api_inbox(deps, {})).map((a) => a.applicationId)).toEqual([applicationId]);
    as(deps, PEOPLE.cos);
    expect(err(endpoints.api_listApplications(deps, {})).code).toBe('FORBIDDEN');
  });

  it('lets the applicant cancel only before anyone signs', () => {
    const deps = seededDeps();
    const a = fileAs(deps, PEOPLE.staff, vacation(['2026-12-07']));
    as(deps, PEOPLE.staff);
    expect(ok(endpoints.api_cancelApplication(deps, { applicationId: a.applicationId })).status).toBe('CANCELLED');
    // The dates are free again.
    const b = fileAs(deps, PEOPLE.staff, vacation(['2026-12-07']));
    ok(signAs(deps, PEOPLE.chief, b.applicationId, 'FOR_APPROVAL'));
    as(deps, PEOPLE.staff);
    expect(err(endpoints.api_cancelApplication(deps, { applicationId: b.applicationId })).code).toBe('CONFLICT');
  });
});

describe('privacy in emails', () => {
  it('never puts the type of leave or illness in an email, and personal addresses get only status and link', () => {
    const deps = seededDeps();
    as(deps, '');
    ok(endpoints.api_requestCode(deps, { email: PEOPLE.cos }));
    const code = /\b(\d{6})\b/.exec(deps.sent.at(-1)!.subject)![1]!;
    const { token } = ok(endpoints.api_verifyCode(deps, { email: PEOPLE.cos, code }));
    const start = deps.sent.length;
    const app = ok(
      endpoints.api_fileLeave(deps, {
        token,
        idempotencyKey: key(),
        form: { leaveType: 'WELLNESS', details: {}, dates: ['2026-12-07'], commutation: 'NOT_REQUESTED' },
      }),
    );
    ok(signAs(deps, PEOPLE.chief, app.applicationId, 'FOR_APPROVAL'));
    const mails = deps.sent.slice(start);
    expect(mails.length).toBeGreaterThan(2);
    for (const m of mails) {
      const text = `${m.subject}\n${m.body}`;
      expect(text).not.toMatch(/sick|dengue|hospital|wellness/i);
    }
    const toCos = mails.filter((m) => m.to === PEOPLE.cos);
    expect(toCos.length).toBeGreaterThan(0);
    for (const m of toCos) {
      expect(m.body).not.toContain(app.applicationId);
      expect(m.body).not.toContain('Torres');
    }
  });
});

describe('setup', () => {
  it('creates the regional office divisions once, and running it again adds nothing', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.owner);
    const codes = () => ok(endpoints.api_listDivisions(deps, {})).map((d) => d.code).sort();
    expect(codes()).toEqual(['AFD', 'ELUPDD', 'HOACDD', 'HREDRD', 'LEGAL', 'ORD', 'PHSD', 'TSD']);
    initializeDatabase(deps);
    expect(codes()).toHaveLength(8);
  });

  it('registers the extra administrator addresses once, with the admin and HR roles', () => {
    const deps = createMemoryDeps({ ownerEmail: PEOPLE.owner, activeEmail: PEOPLE.owner, extraAdminEmails: [' Second.Admin@gmail.com ', PEOPLE.owner] });
    initializeDatabase(deps);
    initializeDatabase(deps);
    const people = ok(endpoints.api_listEmployees(deps, {}));
    expect(people.map((p) => p.email).sort()).toEqual(['region10@dhsud.gov.ph', 'second.admin@gmail.com']);
    expect(people.find((p) => p.email === 'second.admin@gmail.com')!.roles).toEqual(['ADMIN', 'HR']);
  });
});

describe('own profile', () => {
  it('lets staff correct their name, position and salary, but nothing HR keeps, and logs it', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.staff);
    const me = ok(endpoints.api_session(deps, {})).me!.employee;
    const input = { version: me.version, lastName: 'Bautista', firstName: 'Carlo', middleName: 'Reyes', position: 'Engineer III', salary: '51,000', roles: ['ADMIN'], divisionId: 'x' };
    const saved = ok(endpoints.api_saveMyProfile(deps, input));
    expect(saved.position).toBe('Engineer III');
    expect(saved.middleName).toBe('Reyes');
    expect(saved.roles).toEqual([]);
    expect(saved.divisionId).toBe(me.divisionId);
    // A second save with the old version is refused.
    expect(err(endpoints.api_saveMyProfile(deps, input)).code).toBe('STALE_VERSION');
    // The next application prints the new details.
    expect(fileAs(deps, PEOPLE.staff).position).toBe('Engineer III');
    as(deps, PEOPLE.owner);
    expect(ok(endpoints.api_audit(deps, { entityId: me.employeeId })).some((a) => a.action === 'UPDATE_OWN_PROFILE')).toBe(true);
  });

  it('refuses when the administrator switches it off', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.owner);
    const settings = ok(endpoints.api_getSettings(deps, {}));
    expect(settings.profileSelfEdit).toBe(true);
    ok(endpoints.api_saveSettings(deps, { ...settings, profileSelfEdit: false }));
    as(deps, PEOPLE.staff);
    const me = ok(endpoints.api_session(deps, {})).me!.employee;
    const e = err(endpoints.api_saveMyProfile(deps, { version: me.version, lastName: 'X', firstName: 'Y', position: 'Z' }));
    expect(e.code).toBe('FORBIDDEN');
  });
});

describe('HR registration', () => {
  it('only an administrator can grant the HR role, and an email is registered once', () => {
    const deps = seededDeps();
    as(deps, PEOPLE.hr);
    const staff = ok(endpoints.api_listEmployees(deps, {})).find((e) => e.email === PEOPLE.staff)!;
    const base = { employeeId: staff.employeeId, email: staff.email, lastName: staff.lastName, firstName: staff.firstName, divisionId: staff.divisionId, position: staff.position, employmentType: staff.employmentType, isActive: true };
    expect(err(endpoints.api_saveEmployee(deps, { ...base, roles: ['HR'] })).code).toBe('FORBIDDEN');
    // Nobody can be made an administrator here, and an administrator keeps the role.
    as(deps, PEOPLE.owner);
    expect(ok(endpoints.api_saveEmployee(deps, { ...base, roles: ['ADMIN'] })).roles).toEqual([]);
    const owner = ok(endpoints.api_listEmployees(deps, {})).find((e) => e.email === PEOPLE.owner)!;
    const ownerBase = { employeeId: owner.employeeId, email: owner.email, lastName: owner.lastName, firstName: owner.firstName, divisionId: owner.divisionId, position: owner.position, employmentType: owner.employmentType, isActive: true };
    expect(ok(endpoints.api_saveEmployee(deps, { ...ownerBase, roles: ['HR'] })).roles).toContain('ADMIN');
    as(deps, PEOPLE.hr);
    expect(err(endpoints.api_saveEmployee(deps, { ...base, employeeId: undefined, roles: [] })).code).toBe('CONFLICT');
    // Deactivated staff can no longer sign in.
    ok(endpoints.api_saveEmployee(deps, { ...base, roles: [], isActive: false }));
    as(deps, PEOPLE.staff);
    expect(ok(endpoints.api_session(deps, {})).denied).toBe(true);
  });
});
