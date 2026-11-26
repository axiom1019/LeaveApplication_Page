/* Rows ↔ typed records. All sheet access in services goes through here or db directly. */
import { GOVMAIL_DOMAIN, ROLES, type ApplicationStatus, type EmploymentType, type WorkSchedule, type LeaveCreditsMode, type Role, type Section, type SignMethod, type Signatory } from '@shared/constants';
import type { EmployeeDto, SettingsDto } from '@shared/api';
import type { LeaveDetails } from '@shared/schemas';
import type { LeaveTypeCode } from '@shared/leaveTypes';
import { bool, boolCell, int } from '../repository/cells';
import type { RowOf } from '../repository/schema';
import type { Db, Deps } from '../platform/types';

export interface Employee {
  employeeId: string;
  email: string;
  lastName: string;
  firstName: string;
  middleName: string;
  divisionId: string;
  position: string;
  salary: string;
  employmentType: EmploymentType;
  /** HR marked this person a solo parent: 7 days of solo parent leave a year (RA 8972). */
  soloParent: boolean;
  workSchedule: WorkSchedule;
  roles: Role[];
  signatureFileId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export const fullName = (e: Pick<Employee, 'firstName' | 'middleName' | 'lastName'>) =>
  [e.firstName, e.middleName ? `${e.middleName.charAt(0)}.` : '', e.lastName].filter(Boolean).join(' ');

export const isGovmail = (email: string) => email.toLowerCase().endsWith(`@${GOVMAIL_DOMAIN}`);

export function toEmployee(r: RowOf<'Employees'>): Employee {
  return {
    employeeId: r.employee_id,
    email: r.email.toLowerCase(),
    lastName: r.last_name,
    firstName: r.first_name,
    middleName: r.middle_name,
    divisionId: r.division_id,
    position: r.position,
    salary: r.salary,
    employmentType: (r.employment_type as EmploymentType) || 'REGULAR',
    soloParent: bool(r.solo_parent ?? ''),
    workSchedule: r.work_schedule === 'COMPRESSED' ? 'COMPRESSED' : 'STANDARD',
    roles: r.roles.split(',').map((s) => s.trim()).filter((s): s is Role => (ROLES as readonly string[]).includes(s)),
    signatureFileId: r.signature_file_id,
    isActive: bool(r.is_active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: int(r.version),
  };
}

export function employeeRow(e: Employee): RowOf<'Employees'> {
  return {
    employee_id: e.employeeId,
    email: e.email,
    last_name: e.lastName,
    first_name: e.firstName,
    middle_name: e.middleName,
    division_id: e.divisionId,
    position: e.position,
    salary: e.salary,
    employment_type: e.employmentType,
    solo_parent: boolCell(e.soloParent),
    work_schedule: e.workSchedule,
    roles: e.roles.join(','),
    signature_file_id: e.signatureFileId,
    is_active: boolCell(e.isActive),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    version: String(e.version),
  };
}

export interface Division {
  divisionId: string;
  code: string;
  name: string;
  chiefEmployeeId: string;
  /** The division has no Division Chief, so its staff's leave skips that step and goes to the next signatory. */
  noChief: boolean;
  isActive: boolean;
}
export const toDivision = (r: RowOf<'Divisions'>): Division => ({
  divisionId: r.division_id,
  code: r.code,
  name: r.name,
  chiefEmployeeId: r.chief_employee_id,
  noChief: bool(r.no_chief),
  isActive: bool(r.is_active),
});
export const divisionRow = (d: Division): RowOf<'Divisions'> => ({
  division_id: d.divisionId,
  code: d.code,
  name: d.name,
  chief_employee_id: d.chiefEmployeeId,
  no_chief: boolCell(d.noChief),
  is_active: boolCell(d.isActive),
});

export interface FlowStep {
  signatory: Signatory;
  section: Section;
}

export interface Application {
  applicationId: string;
  applicantId: string;
  filedOn: string;
  filedAt: string;
  office: string;
  divisionId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  position: string;
  salary: string;
  leaveType: LeaveTypeCode;
  leaveTypeOther: string;
  details: LeaveDetails;
  dates: string[];
  /** Working days applied for; half days count 0.5. */
  workingDays: number;
  /** Days of VL/SL credit the leave takes: working days x hours of the person's workday / 8 (1.25 on a compressed week). */
  creditDays: number;
  commutation: 'REQUESTED' | 'NOT_REQUESTED';
  /** The signatory order in force when the application was filed (later setting changes don't move it). */
  flow: FlowStep[];
  /** Index into flow of the step waiting for a signature; flow.length when all have signed. */
  currentStep: number;
  status: ApplicationStatus;
  hrRemarks: string;
  filedBy: string;
  closedAt: string;
  cancelReason: string;
  pdfFileId: string;
  idempotencyKey: string;
  updatedAt: string;
  version: number;
}

const json = <T>(s: string, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function toApplication(r: RowOf<'Applications'>): Application {
  return {
    applicationId: r.application_id,
    applicantId: r.applicant_id,
    filedOn: r.filed_on,
    filedAt: r.filed_at,
    office: r.office,
    divisionId: r.division_id,
    lastName: r.last_name,
    firstName: r.first_name,
    middleName: r.middle_name,
    position: r.position,
    salary: r.salary,
    leaveType: r.leave_type as LeaveTypeCode,
    leaveTypeOther: r.leave_type_other,
    details: json<LeaveDetails>(r.details_json, {}),
    dates: json<string[]>(r.dates_json, []),
    workingDays: Number(r.working_days) || 0,
    creditDays: r.credit_days ? Number(r.credit_days) || 0 : Number(r.working_days) || 0,
    commutation: r.commutation === 'REQUESTED' ? 'REQUESTED' : 'NOT_REQUESTED',
    flow: json<FlowStep[]>(r.flow_json, []),
    currentStep: int(r.current_step),
    status: r.status as ApplicationStatus,
    hrRemarks: r.hr_remarks,
    filedBy: r.filed_by,
    closedAt: r.closed_at,
    cancelReason: r.cancel_reason,
    pdfFileId: r.pdf_file_id,
    idempotencyKey: r.idempotency_key,
    updatedAt: r.updated_at,
    version: int(r.version),
  };
}

export function applicationRow(a: Application): RowOf<'Applications'> {
  return {
    application_id: a.applicationId,
    applicant_id: a.applicantId,
    filed_on: a.filedOn,
    filed_at: a.filedAt,
    office: a.office,
    division_id: a.divisionId,
    last_name: a.lastName,
    first_name: a.firstName,
    middle_name: a.middleName,
    position: a.position,
    salary: a.salary,
    leave_type: a.leaveType,
    leave_type_other: a.leaveTypeOther,
    details_json: JSON.stringify(a.details),
    dates_json: JSON.stringify(a.dates),
    working_days: String(a.workingDays),
    credit_days: String(a.creditDays),
    commutation: a.commutation,
    flow_json: JSON.stringify(a.flow),
    current_step: String(a.currentStep),
    status: a.status,
    hr_remarks: a.hrRemarks,
    filed_by: a.filedBy,
    closed_at: a.closedAt,
    cancel_reason: a.cancelReason,
    pdf_file_id: a.pdfFileId,
    idempotency_key: a.idempotencyKey,
    updated_at: a.updatedAt,
    version: String(a.version),
  };
}

export interface SignatureData {
  reason?: string;
  credits?: Record<string, string | undefined>;
  daysWithPay?: string;
  daysWithoutPay?: string;
  othersSpecify?: string;
}

export interface Signature {
  signatureId: string;
  applicationId: string;
  stepIndex: number;
  section: Section;
  signatory: Signatory;
  signerId: string;
  /** e.g. "Regional Director" or "OIC, Regional Director". */
  signerTitle: string;
  method: SignMethod;
  decision: string;
  data: SignatureData;
  signedAt: string;
  /** Employee id of HR staff who recorded a paper signature on the signer's behalf ('' if self). */
  recordedBy: string;
  withdrawnAt: string;
}

export const toSignature = (r: RowOf<'Signatures'>): Signature => ({
  signatureId: r.signature_id,
  applicationId: r.application_id,
  stepIndex: int(r.step_index),
  section: r.section as Section,
  signatory: r.signatory as Signatory,
  signerId: r.signer_id,
  signerTitle: r.signer_title,
  method: r.method as SignMethod,
  decision: r.decision,
  data: json<SignatureData>(r.data_json, {}),
  signedAt: r.signed_at,
  recordedBy: r.recorded_by,
  withdrawnAt: r.withdrawn_at,
});
export const signatureRow = (s: Signature): RowOf<'Signatures'> => ({
  signature_id: s.signatureId,
  application_id: s.applicationId,
  step_index: String(s.stepIndex),
  section: s.section,
  signatory: s.signatory,
  signer_id: s.signerId,
  signer_title: s.signerTitle,
  method: s.method,
  decision: s.decision,
  data_json: JSON.stringify(s.data),
  signed_at: s.signedAt,
  recorded_by: s.recordedBy,
  withdrawn_at: s.withdrawnAt,
});

/** Active signatures for an application, by step index. */
export function activeSignatures(db: Db, applicationId: string): Map<number, Signature> {
  const out = new Map<number, Signature>();
  for (const r of db.readAll('Signatures')) {
    if (r.application_id !== applicationId || r.withdrawn_at) continue;
    const s = toSignature(r);
    out.set(s.stepIndex, s);
  }
  return out;
}

export interface Oic {
  assignmentId: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  remarks: string;
  createdBy: string;
  createdAt: string;
  deletedAt: string;
}
export const toOic = (r: RowOf<'OicAssignments'>): Oic => ({
  assignmentId: r.assignment_id,
  employeeId: r.employee_id,
  startDate: r.start_date,
  endDate: r.end_date,
  remarks: r.remarks,
  createdBy: r.created_by,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
});

// ---- Settings ----

/** Defaults follow the proposal; HR still has to confirm the section mapping (proposal, "To confirm"). */
export const DEFAULT_SETTINGS: SettingsDto = {
  agencyName: 'Department of Human Settlements and Urban Development',
  agencyAddress: 'Regional Office X, Cagayan de Oro City',
  signatoryFlow: [
    { signatory: 'DIVISION_CHIEF', section: '7B' },
    { signatory: 'SUPERVISING_AO', section: '7A' },
    { signatory: 'REGIONAL_DIRECTOR', section: '7C' },
  ],
  leaveCreditsMode: 'LEAVE_CARD' as LeaveCreditsMode,
  pilotDivisionIds: [],
  esignEnabled: false,
  profileSelfEdit: true,
  hrNotifyEmail: '',
};

export function readSettings(db: Db): SettingsDto {
  const map = new Map(db.readAll('Settings').map((r) => [r.key, r.value]));
  const get = <K extends keyof SettingsDto>(k: K): SettingsDto[K] => {
    const v = map.get(k);
    if (v === undefined || v === '') return DEFAULT_SETTINGS[k];
    try {
      return JSON.parse(v) as SettingsDto[K];
    } catch {
      return DEFAULT_SETTINGS[k];
    }
  };
  return {
    agencyName: get('agencyName'),
    agencyAddress: get('agencyAddress'),
    signatoryFlow: get('signatoryFlow'),
    leaveCreditsMode: get('leaveCreditsMode'),
    pilotDivisionIds: get('pilotDivisionIds'),
    esignEnabled: get('esignEnabled'),
    profileSelfEdit: get('profileSelfEdit'),
    hrNotifyEmail: get('hrNotifyEmail'),
  };
}

export function writeSettings(deps: Deps, db: Db, s: SettingsDto, actorId: string): void {
  const now = new Date(deps.nowMs()).toISOString();
  const existing = new Set(db.readAll('Settings').map((r) => r.key));
  for (const [key, value] of Object.entries(s)) {
    const row = { key, value: JSON.stringify(value), updated_by: actorId, updated_at: now };
    if (existing.has(key)) db.replace('Settings', key, row);
    else db.append('Settings', row);
  }
}

export function employeeDto(e: Employee, divisions: Map<string, Division>): EmployeeDto {
  return {
    employeeId: e.employeeId,
    email: e.email,
    lastName: e.lastName,
    firstName: e.firstName,
    middleName: e.middleName,
    fullName: fullName(e),
    divisionId: e.divisionId,
    divisionName: divisions.get(e.divisionId)?.name ?? '',
    position: e.position,
    salary: e.salary,
    employmentType: e.employmentType,
    soloParent: e.soloParent,
    workSchedule: e.workSchedule,
    roles: e.roles,
    isActive: e.isActive,
    hasSignature: !!e.signatureFileId,
    version: e.version,
  };
}

export const loadEmployees = (db: Db) => new Map(db.readAll('Employees').map((r) => [r.employee_id, toEmployee(r)]));
export const loadDivisions = (db: Db) => new Map(db.readAll('Divisions').map((r) => [r.division_id, toDivision(r)]));
