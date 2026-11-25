import type { ApplicationDetail, ApplicationSummary, SettingsDto, SignatureDto, StepDto } from '@shared/api';
import { ROLE_LABELS, SECTION_LABELS, STATUS_LABELS, type Section } from '@shared/constants';
import { countWorkingDays, formatInclusiveDates, manilaDate, manilaDateTime, normalizeDates } from '@shared/dates';
import { leaveType, leaveTypesFor } from '@shared/leaveTypes';
import { creditsFor } from './credits';
import type { LeaveForm, SignInput } from '@shared/schemas';
import { int } from '../repository/cells';
import type { Db, Deps } from '../platform/types';
import { audit } from './audit';
import type { Caller } from './auth';
import { AppError } from './errors';
import {
  activeSignatures,
  applicationRow,
  fullName,
  loadDivisions,
  loadEmployees,
  readSettings,
  signatureRow,
  toApplication,
  toOic,
  type Application,
  type Division,
  type Employee,
  type FlowStep,
  type Oic,
  type Signature,
} from './model';
import { notifyApplicant, notifyHr, notifySigners } from './notify';

/** Everything needed to work out who may act on an application, read once per request. */
export interface Ctx {
  deps: Deps;
  db: Db;
  employees: Map<string, Employee>;
  divisions: Map<string, Division>;
  settings: SettingsDto;
  oics: Oic[];
  holidays: Set<string>;
  today: string;
}

export function loadCtx(deps: Deps): Ctx {
  const db = deps.db.get();
  return {
    deps,
    db,
    employees: loadEmployees(db),
    divisions: loadDivisions(db),
    settings: readSettings(db),
    oics: db.readAll('OicAssignments').map(toOic).filter((o) => !o.deletedAt),
    holidays: new Set(db.readAll('Holidays').map((h) => h.date)),
    today: manilaDate(deps.nowMs()),
  };
}

const nowIso = (deps: Deps) => new Date(deps.nowMs()).toISOString();

// ---------------------------------------------------------------- who signs

export interface Eligible {
  employee: Employee;
  title: string;
}

/** OIC Regional Director assignments that cover `date`. */
export function oicOn(ctx: Ctx, date: string): Oic[] {
  return ctx.oics.filter((o) => o.startDate <= date && date <= o.endDate);
}

/**
 * People who may sign this step today. The applicant can never sign their own application.
 * Division Chief: the chief set on the applicant's division.
 * Supervising AO: anyone with that role.
 * Regional Director: anyone with that role, plus the OIC assigned for today.
 */
export function eligibleSigners(ctx: Ctx, app: Application, step: FlowStep): Eligible[] {
  const active = (id: string) => {
    const e = ctx.employees.get(id);
    return e?.isActive ? e : undefined;
  };
  const out: Eligible[] = [];
  if (step.signatory === 'DIVISION_CHIEF') {
    const chief = active(ctx.divisions.get(app.divisionId)?.chiefEmployeeId ?? '');
    if (chief) out.push({ employee: chief, title: chief.position || ROLE_LABELS.DIVISION_CHIEF });
  } else if (step.signatory === 'SUPERVISING_AO') {
    for (const e of ctx.employees.values()) if (e.isActive && e.roles.includes('SUPERVISING_AO')) out.push({ employee: e, title: e.position || ROLE_LABELS.SUPERVISING_AO });
  } else {
    for (const e of ctx.employees.values()) if (e.isActive && e.roles.includes('REGIONAL_DIRECTOR')) out.push({ employee: e, title: e.position || ROLE_LABELS.REGIONAL_DIRECTOR });
    for (const o of oicOn(ctx, ctx.today)) {
      const e = active(o.employeeId);
      if (e && !out.some((x) => x.employee.employeeId === e.employeeId)) out.push({ employee: e, title: `OIC, ${ROLE_LABELS.REGIONAL_DIRECTOR}` });
    }
  }
  return out.filter((x) => x.employee.employeeId !== app.applicantId);
}

function assigneeText(ctx: Ctx, app: Application, step: FlowStep): string {
  const list = eligibleSigners(ctx, app, step);
  if (!list.length) {
    return step.signatory === 'DIVISION_CHIEF' ? 'No Division Chief is set for this division (HR can record the paper signature)' : `No ${ROLE_LABELS[step.signatory]} is registered`;
  }
  return list.map((x) => `${fullName(x.employee)} (${x.title})`).join(' or ');
}

function waitingFor(ctx: Ctx, app: Application): string {
  if (app.status !== 'PENDING') return '';
  const step = app.flow[app.currentStep];
  if (!step) return '';
  const names = eligibleSigners(ctx, app, step).map((x) => fullName(x.employee));
  return `${ROLE_LABELS[step.signatory]}${names.length ? ` (${names.join(' or ')})` : ''}`;
}

// ---------------------------------------------------------------- access

const isHr = (c: Caller) => c.roles.has('HR') || c.roles.has('ADMIN');

function canView(ctx: Ctx, c: Caller, app: Application, sigs: Map<number, Signature>): boolean {
  if (app.applicantId === c.employee.employeeId || isHr(c)) return true;
  for (const s of sigs.values()) if (s.signerId === c.employee.employeeId) return true;
  const step = app.flow[app.currentStep];
  return app.status === 'PENDING' && !!step && eligibleSigners(ctx, app, step).some((x) => x.employee.employeeId === c.employee.employeeId);
}

export function getApplicationRecord(ctx: Ctx, applicationId: string): Application {
  const row = ctx.db.findOne('Applications', 'application_id', applicationId);
  if (!row) throw new AppError('NOT_FOUND', 'Application not found.');
  return toApplication(row);
}

export function loadViewable(ctx: Ctx, c: Caller, applicationId: string): { app: Application; sigs: Map<number, Signature> } {
  const app = getApplicationRecord(ctx, applicationId);
  const sigs = activeSignatures(ctx.db, app.applicationId);
  if (!canView(ctx, c, app, sigs)) throw new AppError('NOT_FOUND', 'Application not found.');
  return { app, sigs };
}

// ---------------------------------------------------------------- DTOs

export function summary(ctx: Ctx, app: Application): ApplicationSummary {
  const t = leaveType(app.leaveType);
  return {
    applicationId: app.applicationId,
    filedOn: app.filedOn,
    applicantId: app.applicantId,
    applicantName: fullName(app),
    divisionName: ctx.divisions.get(app.divisionId)?.name ?? app.office,
    leaveType: app.leaveType,
    leaveTypeLabel: app.leaveType === 'OTHERS' && app.leaveTypeOther ? `Others: ${app.leaveTypeOther}` : t.label,
    inclusiveDates: formatInclusiveDates(app.dates),
    firstDate: app.dates[0] ?? '',
    workingDays: app.workingDays,
    status: app.status,
    statusLabel: STATUS_LABELS[app.status],
    waitingFor: waitingFor(ctx, app),
  };
}

function signatureDto(ctx: Ctx, s: Signature): SignatureDto {
  const signer = ctx.employees.get(s.signerId);
  const recorder = s.recordedBy ? ctx.employees.get(s.recordedBy) : undefined;
  return {
    signerName: signer ? fullName(signer) : '',
    signerTitle: s.signerTitle,
    method: s.method,
    decision: s.decision,
    reason: s.data.reason ?? '',
    credits: (s.data.credits as SignatureDto['credits']) ?? null,
    daysWithPay: s.data.daysWithPay ?? '',
    daysWithoutPay: s.data.daysWithoutPay ?? '',
    othersSpecify: s.data.othersSpecify ?? '',
    signedAt: manilaDateTime(Date.parse(s.signedAt)),
    recordedByName: recorder ? fullName(recorder) : '',
  };
}

export function steps(ctx: Ctx, app: Application, sigs: Map<number, Signature>): StepDto[] {
  return app.flow.map((step, index) => {
    const sig = sigs.get(index);
    const state: StepDto['state'] = sig ? 'DONE' : app.status === 'CANCELLED' ? 'SKIPPED' : index === app.currentStep && app.status === 'PENDING' ? 'CURRENT' : 'WAITING';
    return {
      index,
      signatory: step.signatory,
      section: step.section,
      label: `${ROLE_LABELS[step.signatory]}: ${SECTION_LABELS[step.section]}`,
      assignee: sig ? '' : assigneeText(ctx, app, step),
      state,
      signature: sig ? signatureDto(ctx, sig) : null,
    };
  });
}

function creditsPrefill(ctx: Ctx, app: Application): ApplicationDetail['creditsPrefill'] {
  if (ctx.settings.leaveCreditsMode !== 'TRACKED') return null;
  const applicant = ctx.employees.get(app.applicantId);
  if (!applicant || applicant.employmentType === 'COS') return null;
  const cr = creditsFor(ctx.db, applicant, ctx.divisions, ctx.today);
  if (!cr.asOf) return null;
  // Balances before this application: earned less approved leave already taken.
  const before = (code: string) => {
    const l = cr.lines.find((x) => x.code === code);
    return l ? l.earned - l.used : 0;
  };
  const vl = before('VL');
  const sl = before('SL');
  const days = app.workingDays;
  // Forced leave is charged to vacation leave; special privilege leave has its own 3-day credit.
  const lessVl = app.leaveType === 'VL' || app.leaveType === 'FL' ? days : 0;
  const lessSl = app.leaveType === 'SL' ? days : 0;
  const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
  return {
    asOf: ctx.today,
    vlEarned: f(vl),
    vlLess: f(lessVl),
    vlBalance: f(vl - lessVl),
    slEarned: f(sl),
    slLess: f(lessSl),
    slBalance: f(sl - lessSl),
  };
}

export function detail(ctx: Ctx, c: Caller, app: Application, sigs: Map<number, Signature>): ApplicationDetail {
  const me = c.employee.employeeId;
  const step = app.flow[app.currentStep];
  const eligible = app.status === 'PENDING' && step ? eligibleSigners(ctx, app, step) : [];
  const canSign = eligible.some((x) => x.employee.employeeId === me);
  const last = sigs.get(app.currentStep - 1);
  return {
    ...summary(ctx, app),
    version: app.version,
    office: app.office,
    lastName: app.lastName,
    firstName: app.firstName,
    middleName: app.middleName,
    position: app.position,
    salary: app.salary,
    leaveTypeOther: app.leaveTypeOther,
    details: app.details,
    dates: app.dates,
    commutation: app.commutation,
    steps: steps(ctx, app, sigs),
    hrRemarks: app.hrRemarks,
    cancelReason: app.cancelReason,
    creditsPrefill: step?.section === '7A' && (canSign || isHr(c)) ? creditsPrefill(ctx, app) : null,
    can: {
      cancel: app.status === 'PENDING' && sigs.size === 0 && (app.applicantId === me || isHr(c)),
      sign: canSign,
      esign: canSign && ctx.settings.esignEnabled && !!c.employee.signatureFileId,
      recordPaper: app.status === 'PENDING' && isHr(c) && app.applicantId !== me,
      withdraw: (app.status === 'PENDING' || app.status === 'FOR_FILING') && !!last && last.signerId === me && !last.recordedBy,
      file: app.status === 'FOR_FILING' && isHr(c) && app.applicantId !== me,
    },
  };
}

// ---------------------------------------------------------------- filing

export function filingBlock(ctx: Ctx, e: Employee): string {
  if (!e.divisionId || !ctx.divisions.get(e.divisionId)?.isActive) return 'Your division is not set. Ask HR to update your record.';
  const pilot = ctx.settings.pilotDivisionIds;
  if (pilot.length && !pilot.includes(e.divisionId)) return 'Online filing is open only to the pilot division for now. Please file on paper.';
  return '';
}

const CLOSED = new Set(['CANCELLED', 'DISAPPROVED']);

/** Refuses leave types the person is not entitled to, and CTO, wellness or SPL beyond what is left. */
function checkCredits(ctx: Ctx, me: Employee, code: string, dates: string[], workingDays: number, all: Application[]) {
  if (!leaveTypesFor(me.employmentType).some((t) => t.code === code)) {
    const msg = me.employmentType === 'COS' ? 'Contract of service staff can file CTO or Wellness Leave only.' : 'CTO and Wellness Leave are for contract of service staff.';
    throw new AppError('VALIDATION', msg, { fields: { leaveType: msg } });
  }
  if (code !== 'CTO' && code !== 'WELLNESS' && code !== 'SPL') return;
  const leaveYear = (dates[0] ?? ctx.today).slice(0, 4);
  // Yearly allowances are counted for the year of the leave; CTO against COC unexpired today.
  const asOf = code === 'CTO' || leaveYear === ctx.today.slice(0, 4) ? ctx.today : `${leaveYear}-01-01`;
  const line = creditsFor(ctx.db, me, ctx.divisions, asOf, all).lines.find((l) => l.code === code);
  if (line && workingDays > line.available) {
    const left = Math.max(0, line.available);
    const msg = `You have ${left} day${left === 1 ? '' : 's'} of ${line.label} left${line.onHold ? `, after ${line.onHold} on hold in other applications` : ''}. This application needs ${workingDays}.`;
    throw new AppError('VALIDATION', msg, { fields: { dates: msg } });
  }
}

/**
 * The signing steps for a new application. A Division Chief's own leave, and leave from a division
 * that has no chief (Legal, the Office of the RD), skip the Division Chief step: the Regional
 * Director approves it directly (there is no Assistant Regional Director). The final approval step (7.C) is never skipped.
 */
export function flowFor(ctx: Ctx, applicant: Employee): FlowStep[] {
  const division = ctx.divisions.get(applicant.divisionId);
  const isChief = applicant.roles.includes('DIVISION_CHIEF') || [...ctx.divisions.values()].some((d) => d.isActive && d.chiefEmployeeId === applicant.employeeId);
  const skipChief = isChief || !!division?.noChief;
  return ctx.settings.signatoryFlow.filter((s) => !(skipChief && s.signatory === 'DIVISION_CHIEF' && s.section !== '7C'));
}

export function fileLeave(deps: Deps, c: Caller, idempotencyKey: string, form: LeaveForm): ApplicationDetail {
  return deps.lock.run(() => {
    const ctx = loadCtx(deps);
    const me = ctx.employees.get(c.employee.employeeId) ?? c.employee;
    const existing = ctx.db.readAll('Applications').map(toApplication);
    const replay = existing.find((a) => a.idempotencyKey === idempotencyKey && a.applicantId === me.employeeId);
    if (replay) return detail(ctx, c, replay, activeSignatures(ctx.db, replay.applicationId));

    const block = filingBlock(ctx, me);
    if (block) throw new AppError('FORBIDDEN', block);

    const dates = normalizeDates(form.dates);
    const workingDays = countWorkingDays(dates, ctx.holidays);
    if (workingDays === 0 && form.leaveType !== 'ML') {
      throw new AppError('VALIDATION', 'The dates you picked are all weekends or holidays.', { fields: { dates: 'Pick at least one working day' } });
    }
    const mine = new Set(dates);
    const clash = existing.find((a) => a.applicantId === me.employeeId && !CLOSED.has(a.status) && a.dates.some((d) => mine.has(d)));
    if (clash) {
      throw new AppError('CONFLICT', `You already have leave application ${clash.applicationId} covering some of these dates.`, { fields: { dates: 'Overlaps another application' } });
    }
    checkCredits(ctx, me, form.leaveType, dates, workingDays, existing);

    const year = ctx.today.slice(0, 4);
    const prefix = `LA-${year}-`;
    const seq = existing.filter((a) => a.applicationId.startsWith(prefix)).reduce((m, a) => Math.max(m, int(a.applicationId.slice(prefix.length))), 0) + 1;
    const division = ctx.divisions.get(me.divisionId);
    const details = { ...form.details };
    // Keep only the 6.B details that belong to the chosen type.
    const kind = leaveType(form.leaveType).details;
    const keep: Record<string, (keyof typeof details)[]> = {
      LOCATION: ['location', 'locationText'],
      SICK: ['sick', 'illness'],
      ILLNESS: ['illness'],
      STUDY: ['study'],
      OTHER: ['otherPurpose'],
      PURPOSE: ['purpose'],
      NONE: [],
    };
    for (const k of Object.keys(details) as (keyof typeof details)[]) if (!keep[kind]?.includes(k)) delete details[k];

    const app: Application = {
      applicationId: `${prefix}${String(seq).padStart(4, '0')}`,
      applicantId: me.employeeId,
      filedOn: ctx.today,
      filedAt: nowIso(deps),
      office: division?.name ?? '',
      divisionId: me.divisionId,
      lastName: me.lastName,
      firstName: me.firstName,
      middleName: me.middleName,
      position: me.position,
      salary: me.salary,
      leaveType: form.leaveType,
      leaveTypeOther: form.leaveType === 'OTHERS' ? (form.leaveTypeOther ?? '') : '',
      details,
      dates,
      workingDays,
      commutation: form.commutation,
      flow: flowFor(ctx, me),
      currentStep: 0,
      status: 'PENDING',
      hrRemarks: '',
      filedBy: '',
      closedAt: '',
      cancelReason: '',
      pdfFileId: '',
      idempotencyKey,
      updatedAt: nowIso(deps),
      version: 1,
    };
    ctx.db.append('Applications', applicationRow(app));
    audit(deps, me.employeeId, me.email, 'FILE_LEAVE', app.applicationId, { leaveType: app.leaveType, dates: app.dates, workingDays });
    const first = app.flow[0];
    if (first) notifySigners(deps, app, eligibleSigners(ctx, app, first).map((x) => x.employee), fullName(app));
    notifyApplicant(deps, app, me, waitingFor(ctx, app));
    return detail(ctx, c, app, new Map());
  });
}

export function myApplications(deps: Deps, c: Caller): ApplicationSummary[] {
  const ctx = loadCtx(deps);
  return ctx.db
    .readAll('Applications')
    .filter((r) => r.applicant_id === c.employee.employeeId)
    .map((r) => summary(ctx, toApplication(r)))
    .sort((a, b) => b.applicationId.localeCompare(a.applicationId));
}

export function inbox(deps: Deps, c: Caller, ctxIn?: Ctx): ApplicationSummary[] {
  const ctx = ctxIn ?? loadCtx(deps);
  const me = c.employee.employeeId;
  return ctx.db
    .readAll('Applications')
    .filter((r) => r.status === 'PENDING')
    .map(toApplication)
    .filter((a) => {
      const step = a.flow[a.currentStep];
      return !!step && eligibleSigners(ctx, a, step).some((x) => x.employee.employeeId === me);
    })
    .map((a) => summary(ctx, a))
    .sort((a, b) => a.applicationId.localeCompare(b.applicationId));
}

export function listAll(deps: Deps, c: Caller, f: { status?: string; query?: string; year?: number }): ApplicationSummary[] {
  if (!isHr(c)) throw new AppError('FORBIDDEN', 'Only HR can see all applications.');
  const ctx = loadCtx(deps);
  const q = (f.query ?? '').toLowerCase();
  return ctx.db
    .readAll('Applications')
    .map(toApplication)
    .filter((a) => (!f.status || a.status === f.status) && (!f.year || a.filedOn.startsWith(String(f.year))))
    .map((a) => summary(ctx, a))
    .filter((s) => !q || `${s.applicationId} ${s.applicantName} ${s.divisionName}`.toLowerCase().includes(q))
    .sort((a, b) => b.applicationId.localeCompare(a.applicationId));
}

// ---------------------------------------------------------------- actions

const DECISIONS: Record<Section, string[]> = {
  '7A': ['CERTIFIED'],
  '7B': ['FOR_APPROVAL', 'FOR_DISAPPROVAL'],
  '7C': ['APPROVED', 'DISAPPROVED'],
};

function checkDecision(section: Section, input: Omit<SignInput, 'method'>, method: 'PAPER' | 'ESIGN'): void {
  if (!DECISIONS[section].includes(input.decision)) throw new AppError('VALIDATION', 'That decision does not apply to this section.');
  const needsReason = input.decision === 'FOR_DISAPPROVAL' || input.decision === 'DISAPPROVED';
  // On paper the reason is written on the form; for an e-signature it must be typed here.
  if (needsReason && method === 'ESIGN' && !input.reason) {
    throw new AppError('VALIDATION', 'Give the reason for disapproval.', { fields: { reason: 'Required' } });
  }
}

function mutate(deps: Deps, c: Caller, applicationId: string, fn: (ctx: Ctx, app: Application, sigs: Map<number, Signature>) => void): ApplicationDetail {
  return deps.lock.run(() => {
    const ctx = loadCtx(deps);
    const app = getApplicationRecord(ctx, applicationId);
    const sigs = activeSignatures(ctx.db, applicationId);
    if (!canView(ctx, c, app, sigs)) throw new AppError('NOT_FOUND', 'Application not found.');
    fn(ctx, app, sigs);
    app.version++;
    app.updatedAt = nowIso(deps);
    ctx.db.replace('Applications', app.applicationId, applicationRow(app));
    return detail(ctx, c, app, activeSignatures(ctx.db, applicationId));
  });
}

function advance(ctx: Ctx, app: Application): void {
  app.currentStep++;
  const applicant = ctx.employees.get(app.applicantId);
  if (app.currentStep >= app.flow.length) {
    app.status = 'FOR_FILING';
    notifyApplicant(ctx.deps, app, applicant, '');
    notifyHr(ctx.deps, app, [...ctx.employees.values()].filter((e) => e.isActive && e.roles.includes('HR')), ctx.settings.hrNotifyEmail);
  } else {
    const next = app.flow[app.currentStep] as FlowStep;
    notifySigners(ctx.deps, app, eligibleSigners(ctx, app, next).map((x) => x.employee), fullName(app));
    notifyApplicant(ctx.deps, app, applicant, waitingFor(ctx, app));
  }
}

function writeSignature(ctx: Ctx, app: Application, step: FlowStep, signer: Eligible | { employee: Employee | null; title: string }, method: 'PAPER' | 'ESIGN', input: Omit<SignInput, 'method'>, recordedBy: string): Signature {
  const sig: Signature = {
    signatureId: ctx.deps.uuid(),
    applicationId: app.applicationId,
    stepIndex: app.currentStep,
    section: step.section,
    signatory: step.signatory,
    signerId: signer.employee?.employeeId ?? '',
    signerTitle: signer.title,
    method,
    decision: input.decision,
    data: {
      reason: input.reason || undefined,
      credits: step.section === '7A' ? input.credits : undefined,
      daysWithPay: step.section === '7C' ? input.daysWithPay : undefined,
      daysWithoutPay: step.section === '7C' ? input.daysWithoutPay : undefined,
      othersSpecify: step.section === '7C' ? input.othersSpecify : undefined,
    },
    signedAt: nowIso(ctx.deps),
    recordedBy,
    withdrawnAt: '',
  };
  ctx.db.append('Signatures', signatureRow(sig));
  return sig;
}

/** A signatory signs their own step: on paper (they mark it signed) or with their e-signature. */
export function sign(deps: Deps, c: Caller, input: SignInput): ApplicationDetail {
  return mutate(deps, c, input.applicationId, (ctx, app) => {
    if (app.status !== 'PENDING') throw new AppError('CONFLICT', 'This application is no longer waiting for signatures.');
    if (app.version !== input.version) throw new AppError('STALE_VERSION', 'The application changed while you were reviewing it. Please review it again.');
    const step = app.flow[app.currentStep];
    if (!step) throw new AppError('CONFLICT', 'Nothing to sign.');
    const me = eligibleSigners(ctx, app, step).find((x) => x.employee.employeeId === c.employee.employeeId);
    if (!me) throw new AppError('FORBIDDEN', 'Only the signatory named for this section can sign it.');
    if (input.method === 'ESIGN') {
      if (!ctx.settings.esignEnabled) throw new AppError('FORBIDDEN', 'E-signing is not switched on yet.');
      if (!me.employee.signatureFileId) throw new AppError('VALIDATION', 'Upload your specimen signature first (My signature).');
    }
    checkDecision(step.section, input, input.method);
    writeSignature(ctx, app, step, me, input.method, input, '');
    audit(deps, c.employee.employeeId, c.email, input.method === 'ESIGN' ? 'ESIGN' : 'SIGN_PAPER', app.applicationId, { step: app.currentStep, section: step.section, decision: input.decision, as: me.title });
    advance(ctx, app);
  });
}

/** HR records a hand signature that is already on the paper form. */
export function recordPaper(deps: Deps, c: Caller, input: Omit<SignInput, 'method'> & { signerEmployeeId?: string }): ApplicationDetail {
  if (!isHr(c)) throw new AppError('FORBIDDEN', 'Only HR can record paper signatures.');
  return mutate(deps, c, input.applicationId, (ctx, app) => {
    if (app.status !== 'PENDING') throw new AppError('CONFLICT', 'This application is no longer waiting for signatures.');
    if (app.version !== input.version) throw new AppError('STALE_VERSION', 'The application changed. Please review it again.');
    if (app.applicantId === c.employee.employeeId) throw new AppError('FORBIDDEN', 'You cannot record signatures on your own application.');
    const step = app.flow[app.currentStep];
    if (!step) throw new AppError('CONFLICT', 'Nothing to sign.');
    const eligible = eligibleSigners(ctx, app, step);
    let signer: Eligible | { employee: Employee | null; title: string };
    if (input.signerEmployeeId) {
      const e = ctx.employees.get(input.signerEmployeeId);
      if (!e || e.employeeId === app.applicantId) throw new AppError('VALIDATION', 'Choose who signed the form.', { fields: { signerEmployeeId: 'Choose who signed' } });
      signer = eligible.find((x) => x.employee.employeeId === e.employeeId) ?? { employee: e, title: e.position || ROLE_LABELS[step.signatory] };
    } else if (eligible.length === 1) {
      signer = eligible[0] as Eligible;
    } else {
      throw new AppError('VALIDATION', 'Choose who signed the form.', { fields: { signerEmployeeId: 'Choose who signed' } });
    }
    checkDecision(step.section, input, 'PAPER');
    writeSignature(ctx, app, step, signer, 'PAPER', input, c.employee.employeeId);
    audit(deps, c.employee.employeeId, c.email, 'RECORD_PAPER_SIGNATURE', app.applicationId, { step: app.currentStep, section: step.section, decision: input.decision, signer: signer.employee?.employeeId });
    advance(ctx, app);
  });
}

/** The signer takes back their own signature, only while the next signatory hasn't acted. */
export function withdraw(deps: Deps, c: Caller, applicationId: string): ApplicationDetail {
  return mutate(deps, c, applicationId, (ctx, app, sigs) => {
    if (app.status !== 'PENDING' && app.status !== 'FOR_FILING') throw new AppError('CONFLICT', 'This application is already closed.');
    const last = sigs.get(app.currentStep - 1);
    if (!last || last.signerId !== c.employee.employeeId || last.recordedBy) {
      throw new AppError('FORBIDDEN', 'Only the person who signed last can withdraw, and only before the next signatory acts.');
    }
    last.withdrawnAt = nowIso(deps);
    ctx.db.replace('Signatures', last.signatureId, signatureRow(last));
    app.currentStep--;
    app.status = 'PENDING';
    audit(deps, c.employee.employeeId, c.email, 'WITHDRAW_SIGNATURE', app.applicationId, { step: last.stepIndex, section: last.section });
  });
}

export function cancel(deps: Deps, c: Caller, applicationId: string, reason: string | undefined): ApplicationDetail {
  return mutate(deps, c, applicationId, (_ctx, app, sigs) => {
    if (app.applicantId !== c.employee.employeeId && !isHr(c)) throw new AppError('FORBIDDEN', 'Only the applicant or HR can cancel.');
    if (app.status !== 'PENDING' || sigs.size > 0) throw new AppError('CONFLICT', 'An application can be cancelled only before anyone signs it. Ask HR.');
    app.status = 'CANCELLED';
    app.cancelReason = reason ?? '';
    app.closedAt = nowIso(deps);
    audit(deps, c.employee.employeeId, c.email, 'CANCEL', app.applicationId, { reason });
  });
}

/** HR files the signed paper copy. The final status follows the 7.C/7.D decision. */
export function fileApplication(deps: Deps, c: Caller, applicationId: string, remarks: string | undefined, archive: (ctx: Ctx, app: Application) => string): ApplicationDetail {
  if (!isHr(c)) throw new AppError('FORBIDDEN', 'Only HR can file applications.');
  const result = mutate(deps, c, applicationId, (ctx, app, sigs) => {
    if (app.status !== 'FOR_FILING') throw new AppError('CONFLICT', 'Only fully signed applications can be filed.');
    if (app.applicantId === c.employee.employeeId) throw new AppError('FORBIDDEN', 'Another HR staff member must file your own application.');
    const finalStep = app.flow.findIndex((s) => s.section === '7C');
    const decision = sigs.get(finalStep)?.decision;
    app.status = decision === 'DISAPPROVED' ? 'DISAPPROVED' : 'APPROVED';
    app.hrRemarks = remarks ?? '';
    app.filedBy = c.employee.employeeId;
    app.closedAt = nowIso(deps);
    try {
      app.pdfFileId = archive(ctx, app);
    } catch (e) {
      deps.log('error', 'PDF archive failed', { applicationId, error: e instanceof Error ? e.message : String(e) });
    }
    audit(deps, c.employee.employeeId, c.email, 'FILE_BY_HR', app.applicationId, { status: app.status, remarks });
    notifyApplicant(deps, app, ctx.employees.get(app.applicantId), '');
  });
  return result;
}
