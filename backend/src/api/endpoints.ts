/*
 * API entry points: parse input → identify caller → call a service → wrap the result.
 * Every input may carry `token` (the session token from code sign-in). The backend never trusts
 * the browser's own validation; each input is parsed again here.
 */
import type { ApiContract, ApiName, ApiResult, Me } from '@shared/api';
import { PRIVACY_NOTICE } from '@shared/privacy';
import * as S from '@shared/schemas';
import { z } from 'zod';
import type { Deps } from '../platform/types';
import * as admin from '../services/admin';
import * as apps from '../services/applications';
import { listAudit } from '../services/audit';
import * as credits from '../services/credits';
import { currentCaller, findActiveEmployeeByEmail, requestCode, requireCaller, requireRole, signOut, verifyCode, type Caller } from '../services/auth';
import { AppError, isAppError } from '../services/errors';
import { activeSignatures, employeeDto } from '../services/model';
import { form6FileName, form6Html } from '../services/printout';

type Out<K extends ApiName> = ApiContract[K][1];
export type Endpoints = { [K in ApiName]: (deps: Deps, input: unknown) => ApiResult<Out<K>> };

const tokenOf = (input: unknown): string | undefined => {
  const t = (input as { token?: unknown } | null)?.token;
  return typeof t === 'string' && t.length <= 200 ? t : undefined;
};
/** Set by the browser after Sign out: don't sign the person back in from their Google account. */
const skipGoogleOf = (input: unknown): boolean => (input as { signedOut?: unknown } | null)?.signedOut === true;

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const { token: _t, signedOut: _s, ...rest } = (input ?? {}) as Record<string, unknown>;
  const r = schema.safeParse(rest);
  if (!r.success) {
    const fields: Record<string, string> = {};
    for (const i of r.error.issues) fields[i.path.join('.') || '_'] ??= i.message;
    throw new AppError('VALIDATION', Object.values(fields)[0] ?? 'Check the form and try again.', { fields });
  }
  return r.data;
}

function wrap<K extends ApiName>(name: K, fn: (deps: Deps, input: unknown) => Out<K>) {
  return (deps: Deps, input: unknown): ApiResult<Out<K>> => {
    const requestId = deps.uuid();
    try {
      return { ok: true, data: fn(deps, input), requestId };
    } catch (e) {
      if (isAppError(e)) return { ok: false, error: { code: e.code, message: e.message, details: e.details }, requestId };
      deps.log('error', `${name} failed`, { requestId, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
      return { ok: false, error: { code: 'INTERNAL', message: `Something went wrong. Reference: ${requestId.slice(0, 8)}` }, requestId };
    }
  };
}

/** Signed-in endpoint. */
function authed<K extends ApiName>(name: K, fn: (deps: Deps, c: Caller, input: unknown) => Out<K>) {
  return wrap(name, (deps, input) => fn(deps, requireCaller(deps, tokenOf(input), skipGoogleOf(input)), input));
}

function buildMe(deps: Deps, c: Caller): Me {
  const ctx = apps.loadCtx(deps);
  const block = apps.filingBlock(ctx, c.employee);
  return {
    employee: employeeDto(c.employee, ctx.divisions),
    isOicToday: apps.oicOn(ctx, ctx.today).some((o) => o.employeeId === c.employee.employeeId),
    isOwner: c.isOwner,
    isSignatory: admin.isSignatory(deps, c),
    canFile: !block,
    cannotFileReason: block,
    inboxCount: apps.inbox(deps, c, ctx).length,
  };
}

const withApp = (deps: Deps, c: Caller, applicationId: string) => {
  const ctx = apps.loadCtx(deps);
  const { app, sigs } = apps.loadViewable(ctx, c, applicationId);
  return { ctx, app, sigs };
};

export const endpoints: Endpoints = {
  api_session: wrap('api_session', (deps, input) => {
    const privacy = { text: PRIVACY_NOTICE.text, approved: PRIVACY_NOTICE.approved, version: PRIVACY_NOTICE.version };
    if (!deps.db.isInitialized()) return { initialized: false, me: null, googleEmail: '', denied: false, environment: deps.environment, privacy };
    const skip = skipGoogleOf(input);
    const c = currentCaller(deps, tokenOf(input), skip);
    const googleEmail = deps.identity.activeEmail();
    const googleRegistered = !!googleEmail && !!findActiveEmployeeByEmail(deps, googleEmail);
    return { initialized: true, me: c ? buildMe(deps, c) : null, googleEmail, denied: !c && !!googleEmail && !(skip && googleRegistered), environment: deps.environment, privacy };
  }),
  api_requestCode: wrap('api_requestCode', (deps, input) => requestCode(deps, parse(S.requestCodeInput, input).email)),
  api_verifyCode: wrap('api_verifyCode', (deps, input) => {
    const v = parse(S.verifyCodeInput, input);
    const { token, employee } = verifyCode(deps, v.email, v.code);
    const c = currentCaller(deps, token);
    if (!c) throw new AppError('UNAUTHENTICATED', 'Sign-in failed. Try again.');
    return { token, me: buildMe(deps, { ...c, employee }) };
  }),
  api_signOut: wrap('api_signOut', (deps, input) => {
    signOut(deps, tokenOf(input));
    return { ok: true };
  }),
  api_bootstrap: authed('api_bootstrap', (deps) => {
    const ctx = apps.loadCtx(deps);
    return { settings: ctx.settings, holidays: admin.listHolidays(deps), today: ctx.today };
  }),
  api_myApplications: authed('api_myApplications', (deps, c) => apps.myApplications(deps, c)),
  api_fileLeave: authed('api_fileLeave', (deps, c, input) => {
    const v = parse(S.fileLeaveInput, input);
    return apps.fileLeave(deps, c, v.idempotencyKey, v.form);
  }),
  api_getApplication: authed('api_getApplication', (deps, c, input) => {
    const { ctx, app, sigs } = withApp(deps, c, parse(S.applicationRef, input).applicationId);
    return apps.detail(ctx, c, app, sigs);
  }),
  api_cancelApplication: authed('api_cancelApplication', (deps, c, input) => {
    const v = parse(S.cancelInput, input);
    return apps.cancel(deps, c, v.applicationId, v.reason);
  }),
  api_formHtml: authed('api_formHtml', (deps, c, input) => {
    const { ctx, app, sigs } = withApp(deps, c, parse(S.applicationRef, input).applicationId);
    return { html: form6Html(ctx, app, sigs), fileName: form6FileName(app) };
  }),
  api_formPdf: authed('api_formPdf', (deps, c, input) => {
    const { ctx, app, sigs } = withApp(deps, c, parse(S.applicationRef, input).applicationId);
    const fileName = form6FileName(app);
    return { base64: deps.pdf.fromHtml(form6Html(ctx, app, sigs), fileName), fileName };
  }),
  api_inbox: authed('api_inbox', (deps, c) => apps.inbox(deps, c)),
  api_sign: authed('api_sign', (deps, c, input) => apps.sign(deps, c, parse(S.signInput, input))),
  api_recordPaperSignature: authed('api_recordPaperSignature', (deps, c, input) => apps.recordPaper(deps, c, parse(S.recordPaperInput, input))),
  api_withdrawSignature: authed('api_withdrawSignature', (deps, c, input) => apps.withdraw(deps, c, parse(S.applicationRef, input).applicationId)),
  api_fileApplication: authed('api_fileApplication', (deps, c, input) => {
    const v = parse(S.fileApplicationInput, input);
    // The final PDF (with every signature recorded) is archived in the private Drive folder.
    return apps.fileApplication(deps, c, v.applicationId, v.remarks, (ctx, app) => {
      const name = form6FileName(app);
      const html = form6Html(ctx, app, activeSignatures(ctx.db, app.applicationId));
      return deps.files.save('pdf', name, deps.pdf.fromHtml(html, name), 'application/pdf');
    });
  }),
  api_listApplications: authed('api_listApplications', (deps, c, input) => apps.listAll(deps, c, parse(S.listApplicationsInput, input))),
  api_listEmployees: authed('api_listEmployees', (deps, c) => {
    // Signatories and the RD need the employee list for OIC naming; full records stay with HR/admin.
    if (c.roles.has('REGIONAL_DIRECTOR') && !c.roles.has('HR') && !c.roles.has('ADMIN')) {
      return admin.listEmployees(deps, { ...c, roles: new Set([...c.roles, 'HR']) }).filter((e) => e.isActive).map((e) => ({ ...e, email: '', salary: '' }));
    }
    return admin.listEmployees(deps, c);
  }),
  api_saveEmployee: authed('api_saveEmployee', (deps, c, input) => admin.saveEmployee(deps, c, parse(S.saveEmployeeInput, input))),
  api_listDivisions: authed('api_listDivisions', (deps) => admin.listDivisions(deps)),
  api_saveDivision: authed('api_saveDivision', (deps, c, input) => admin.saveDivision(deps, c, parse(S.saveDivisionInput, input))),
  api_listHolidays: authed('api_listHolidays', (deps) => admin.listHolidays(deps)),
  api_saveHoliday: authed('api_saveHoliday', (deps, c, input) => {
    const v = parse(S.saveHolidayInput, input);
    return admin.saveHoliday(deps, c, v.date, v.name);
  }),
  api_deleteHoliday: authed('api_deleteHoliday', (deps, c, input) => admin.deleteHoliday(deps, c, parse(S.deleteHolidayInput, input).date)),
  api_listOic: authed('api_listOic', (deps, c) => admin.listOic(deps, c)),
  api_saveOic: authed('api_saveOic', (deps, c, input) => admin.saveOic(deps, c, parse(S.saveOicInput, input))),
  api_deleteOic: authed('api_deleteOic', (deps, c, input) => admin.deleteOic(deps, c, parse(S.deleteOicInput, input).assignmentId)),
  api_getSettings: authed('api_getSettings', (deps, c) => admin.getSettings(deps, c)),
  api_saveSettings: authed('api_saveSettings', (deps, c, input) => admin.saveSettings(deps, c, parse(S.settingsInput, input))),
  api_myCredits: authed('api_myCredits', (deps, c) => credits.myCredits(deps, c)),
  api_listCredits: authed('api_listCredits', (deps, c) => credits.listCredits(deps, c)),
  api_saveCredits: authed('api_saveCredits', (deps, c, input) => credits.saveCredits(deps, c, parse(S.saveCreditsInput, input))),
  api_listCoc: authed('api_listCoc', (deps, c, input) => credits.listCoc(deps, c, parse(S.employeeRef, input).employeeId)),
  api_saveCoc: authed('api_saveCoc', (deps, c, input) => credits.saveCoc(deps, c, parse(S.saveCocInput, input))),
  api_deleteCoc: authed('api_deleteCoc', (deps, c, input) => credits.deleteCoc(deps, c, parse(S.deleteCocInput, input).entryId)),
  api_listTardiness: authed('api_listTardiness', (deps, c, input) => credits.listTardiness(deps, c, parse(S.employeeRef, input).employeeId)),
  api_saveTardiness: authed('api_saveTardiness', (deps, c, input) => credits.saveTardiness(deps, c, parse(S.saveTardinessInput, input))),
  api_deleteTardiness: authed('api_deleteTardiness', (deps, c, input) => credits.deleteTardiness(deps, c, parse(S.deleteTardinessInput, input).entryId)),
  api_uploadSignature: authed('api_uploadSignature', (deps, c, input) => admin.uploadSignature(deps, c, parse(S.uploadSignatureInput, input).pngBase64)),
  api_mySignature: authed('api_mySignature', (deps, c) => admin.mySignature(deps, c)),
  api_saveMyProfile: authed('api_saveMyProfile', (deps, c, input) => admin.saveMyProfile(deps, c, parse(S.saveMyProfileInput, input))),
  api_audit: authed('api_audit', (deps, c, input) => {
    requireRole(c, 'HR', 'ADMIN');
    const v = parse(S.auditInput, input);
    return listAudit(deps, v.entityId, v.limit);
  }),
};
