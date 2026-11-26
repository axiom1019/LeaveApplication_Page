import type { ApplicationStatus, EmploymentType, WorkSchedule, ErrorCode, LeaveCreditsMode, Role, Section, SignMethod, Signatory } from './constants';
import type { LeaveTypeCode } from './leaveTypes';
import type { ScheduleChange } from './schedule';
import type { z } from 'zod';
import type * as S from './schemas';

export type ApiError = { code: ErrorCode; message: string; details?: unknown };
export type ApiResult<T> = { ok: true; data: T; requestId: string } | { ok: false; error: ApiError; requestId: string };

export interface EmployeeDto {
  employeeId: string;
  email: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  divisionId: string;
  divisionName: string;
  position: string;
  salary: string;
  employmentType: EmploymentType;
  soloParent: boolean;
  workSchedule: WorkSchedule;
  roles: Role[];
  isActive: boolean;
  hasSignature: boolean;
  version: number;
}

export interface DivisionDto {
  divisionId: string;
  code: string;
  name: string;
  chiefEmployeeId: string;
  chiefName: string;
  noChief: boolean;
  isActive: boolean;
}

export interface SettingsDto {
  agencyName: string;
  agencyAddress: string;
  signatoryFlow: { signatory: Signatory; section: Section }[];
  leaveCreditsMode: LeaveCreditsMode;
  pilotDivisionIds: string[];
  esignEnabled: boolean;
  hrNotifyEmail: string;
  /** Staff may correct their own name, position and salary under My profile. */
  profileSelfEdit: boolean;
}

export interface Me {
  employee: EmployeeDto;
  /** Roles plus the derived ones: OIC (assigned for today) and OWNER (deploying account). */
  isOicToday: boolean;
  /** The person's work schedule changes (their usual schedule is employee.workSchedule). */
  scheduleChanges: ScheduleChange[];
  isOwner: boolean;
  /** Signs something: has a signatory role, chairs a division, or has been named OIC. */
  isSignatory: boolean;
  canFile: boolean;
  cannotFileReason: string;
  inboxCount: number;
}

export interface SessionState {
  initialized: boolean;
  /** Signed in (govmail recognised automatically, or a valid session token). */
  me: Me | null;
  /** Google account the browser is signed in with, when Google shares it (govmail only). */
  googleEmail: string;
  /** Set when that Google account is not registered. */
  denied: boolean;
  environment: string;
  privacy: { text: string; approved: boolean; version: string };
}

export interface BootstrapDto {
  settings: SettingsDto;
  holidays: { date: string; name: string }[];
  today: string;
}

export interface ApplicationSummary {
  applicationId: string;
  filedOn: string;
  applicantId: string;
  applicantName: string;
  divisionName: string;
  leaveType: LeaveTypeCode;
  leaveTypeLabel: string;
  inclusiveDates: string;
  firstDate: string;
  workingDays: number;
  status: ApplicationStatus;
  statusLabel: string;
  /** Who it is waiting for, e.g. "Division Chief (Juan Dela Cruz)". Empty when not pending. */
  waitingFor: string;
}

export interface SignatureDto {
  signerName: string;
  signerTitle: string;
  method: SignMethod;
  decision: string;
  reason: string;
  credits: z.infer<typeof S.creditsCert> | null;
  daysWithPay: string;
  daysWithoutPay: string;
  othersSpecify: string;
  signedAt: string;
  recordedByName: string;
}

export interface StepDto {
  index: number;
  signatory: Signatory;
  section: Section;
  label: string;
  /** Who is expected to sign (name and title), or a note when nobody is assigned. */
  assignee: string;
  state: 'DONE' | 'CURRENT' | 'WAITING' | 'SKIPPED';
  signature: SignatureDto | null;
}

export interface ApplicationDetail extends ApplicationSummary {
  version: number;
  office: string;
  lastName: string;
  firstName: string;
  middleName: string;
  position: string;
  salary: string;
  leaveTypeOther: string;
  details: z.infer<typeof S.leaveDetails>;
  dates: string[];
  commutation: 'REQUESTED' | 'NOT_REQUESTED';
  steps: StepDto[];
  hrRemarks: string;
  cancelReason: string;
  /** Prefill for 7.A when leave credits are tracked in the app. */
  creditsPrefill: z.infer<typeof S.creditsCert> | null;
  can: {
    cancel: boolean;
    /** The caller can sign the current step themselves. */
    sign: boolean;
    esign: boolean;
    /** HR can record a hand signature already on paper for the current step. */
    recordPaper: boolean;
    withdraw: boolean;
    file: boolean;
  };
}

export interface OicDto {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  remarks: string;
  createdBy: string;
}

export type CreditCode = 'VL' | 'SL' | 'FL' | 'SPL' | 'SOLO' | 'CTO' | 'WELLNESS';

/** One row of a leave credits table. Figures are working days. */
export interface CreditLine {
  code: CreditCode;
  label: string;
  /** Balance on record plus monthly earnings (VL, SL), the yearly allowance (FL, SPL, Wellness), or unexpired COC (CTO). */
  earned: number;
  /** Approved leave already taken from it. */
  used: number;
  /** Leave filed and not yet decided or filed by HR. */
  onHold: number;
  available: number;
  note: string;
}

export interface CreditsDto {
  employeeId: string;
  employeeName: string;
  divisionName: string;
  employmentType: EmploymentType;
  /** Date of the VL/SL balance HR entered from the leave card; '' if none yet. */
  asOf: string;
  vlBalance: number;
  slBalance: number;
  lines: CreditLine[];
}

/** One person's work schedule for a week (HR's weekly schedule page). */
export interface WeekScheduleRow {
  employeeId: string;
  employeeName: string;
  divisionName: string;
  usual: WorkSchedule;
  schedule: WorkSchedule;
  /** True when this week's schedule was set for this very week (not carried over). */
  setThisWeek: boolean;
}

/** A month's late and undertime HR recorded, and the VL it takes. */
export interface TardinessDto {
  entryId: string;
  employeeId: string;
  month: string;
  minutes: number;
  remarks: string;
  days: number;
}

export interface CocDto {
  entryId: string;
  employeeId: string;
  earnedOn: string;
  hours: number;
  reference: string;
  expiresOn: string;
  remainingHours: number;
  /** EARNED: COC from overtime. DEDUCTED: hours HR took off by hand. */
  kind: 'EARNED' | 'DEDUCTED';
}

export interface AuditDto {
  at: string;
  actor: string;
  action: string;
  entityId: string;
  detail: string;
}

type In<T extends z.ZodType> = z.input<T>;
type Empty = Record<string, never>;

/** [input, output] per API function. The session token is added to every input by the client. */
export interface ApiContract {
  api_session: [Empty, SessionState];
  api_requestCode: [In<typeof S.requestCodeInput>, { sent: true }];
  api_verifyCode: [In<typeof S.verifyCodeInput>, { token: string; me: Me }];
  api_signOut: [Empty, { ok: true }];
  api_bootstrap: [Empty, BootstrapDto];
  api_myApplications: [Empty, ApplicationSummary[]];
  api_fileLeave: [In<typeof S.fileLeaveInput>, ApplicationDetail];
  api_getApplication: [In<typeof S.applicationRef>, ApplicationDetail];
  api_cancelApplication: [In<typeof S.cancelInput>, ApplicationDetail];
  api_formHtml: [In<typeof S.applicationRef>, { html: string; fileName: string }];
  api_formPdf: [In<typeof S.applicationRef>, { base64: string; fileName: string }];
  api_inbox: [Empty, ApplicationSummary[]];
  api_sign: [In<typeof S.signInput>, ApplicationDetail];
  api_recordPaperSignature: [In<typeof S.recordPaperInput>, ApplicationDetail];
  api_withdrawSignature: [In<typeof S.applicationRef>, ApplicationDetail];
  api_fileApplication: [In<typeof S.fileApplicationInput>, ApplicationDetail];
  api_listApplications: [In<typeof S.listApplicationsInput>, ApplicationSummary[]];
  api_listEmployees: [Empty, EmployeeDto[]];
  api_saveEmployee: [In<typeof S.saveEmployeeInput>, EmployeeDto];
  api_listDivisions: [Empty, DivisionDto[]];
  api_saveDivision: [In<typeof S.saveDivisionInput>, DivisionDto];
  api_listHolidays: [Empty, { date: string; name: string }[]];
  api_saveHoliday: [In<typeof S.saveHolidayInput>, { date: string; name: string }[]];
  api_deleteHoliday: [In<typeof S.deleteHolidayInput>, { date: string; name: string }[]];
  api_listOic: [Empty, OicDto[]];
  api_saveOic: [In<typeof S.saveOicInput>, OicDto[]];
  api_deleteOic: [In<typeof S.deleteOicInput>, OicDto[]];
  api_getSettings: [Empty, SettingsDto];
  api_saveSettings: [In<typeof S.settingsInput>, SettingsDto];
  api_myCredits: [Empty, CreditsDto];
  api_listCredits: [Empty, CreditsDto[]];
  api_saveCredits: [In<typeof S.saveCreditsInput>, CreditsDto[]];
  api_listCoc: [In<typeof S.employeeRef>, CocDto[]];
  api_saveCoc: [In<typeof S.saveCocInput>, CocDto[]];
  api_deleteCoc: [In<typeof S.deleteCocInput>, CocDto[]];
  api_weekSchedules: [In<typeof S.weekRef>, WeekScheduleRow[]];
  api_saveWeekSchedules: [In<typeof S.saveWeekSchedulesInput>, WeekScheduleRow[]];
  api_listTardiness: [In<typeof S.employeeRef>, TardinessDto[]];
  api_saveTardiness: [In<typeof S.saveTardinessInput>, TardinessDto[]];
  api_deleteTardiness: [In<typeof S.deleteTardinessInput>, TardinessDto[]];
  api_uploadSignature: [In<typeof S.uploadSignatureInput>, { ok: true }];
  api_mySignature: [Empty, { pngBase64: string | null }];
  api_saveMyProfile: [In<typeof S.saveMyProfileInput>, EmployeeDto];
  api_audit: [In<typeof S.auditInput>, AuditDto[]];
}
export type ApiName = keyof ApiContract;
