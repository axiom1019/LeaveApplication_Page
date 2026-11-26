import type { DivisionDto, EmployeeDto, OicDto, SettingsDto } from '@shared/api';
import type { Role } from '@shared/constants';
import type { SaveEmployeeInput, SaveMyProfileInput, SettingsInput } from '@shared/schemas';
import type { Deps } from '../platform/types';
import { audit } from './audit';
import { requireRole, type Caller } from './auth';
import { AppError } from './errors';
import {
  divisionRow,
  employeeDto,
  employeeRow,
  fullName,
  loadDivisions,
  loadEmployees,
  readSettings,
  toEmployee,
  toOic,
  writeSettings,
  type Division,
  type Employee,
} from './model';

const now = (deps: Deps) => new Date(deps.nowMs()).toISOString();

// ---------------------------------------------------------------- employees (HR registers users)

export function listEmployees(deps: Deps, c: Caller): EmployeeDto[] {
  requireRole(c, 'HR', 'ADMIN');
  const db = deps.db.get();
  const divisions = loadDivisions(db);
  return [...loadEmployees(db).values()].map((e) => employeeDto(e, divisions)).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

/** Short list for signatories and HR pickers (name + id), visible to HR, admin and the RD. */
export function saveEmployee(deps: Deps, c: Caller, input: SaveEmployeeInput): EmployeeDto {
  requireRole(c, 'HR', 'ADMIN');
  // Only an administrator can grant or remove the HR role; nobody grants ADMIN here.
  return deps.lock.run(() => {
    const db = deps.db.get();
    const divisions = loadDivisions(db);
    if (!divisions.has(input.divisionId)) throw new AppError('VALIDATION', 'Choose a division.', { fields: { divisionId: 'Choose a division' } });
    const all = db.readAll('Employees').map(toEmployee);
    const email = input.email.toLowerCase();
    const dupe = all.find((e) => e.email === email && e.employeeId !== input.employeeId);
    if (dupe) throw new AppError('CONFLICT', `${email} is already registered to ${fullName(dupe)}.`, { fields: { email: 'Already registered' } });

    const prev = input.employeeId ? all.find((e) => e.employeeId === input.employeeId) : undefined;
    if (input.employeeId && !prev) throw new AppError('NOT_FOUND', 'Employee not found.');
    if (prev && input.version !== undefined && prev.version !== input.version) throw new AppError('STALE_VERSION', 'Someone else changed this record. Reload and try again.');

    // The administrator role is not given or removed here: setup gives it to the owner account and
    // the addresses in admins.local.json. Whoever has it keeps it.
    const roles: Role[] = [...new Set(input.roles.filter((r) => r !== 'ADMIN'))];
    if (prev?.roles.includes('ADMIN')) roles.push('ADMIN');
    if (!c.roles.has('ADMIN') && roles.includes('HR') !== !!prev?.roles.includes('HR')) {
      throw new AppError('FORBIDDEN', 'Only the system administrator can give or remove the HR role.');
    }

    const e: Employee = {
      employeeId: prev?.employeeId ?? deps.uuid(),
      email,
      lastName: input.lastName,
      firstName: input.firstName,
      middleName: input.middleName ?? '',
      divisionId: input.divisionId,
      position: input.position,
      salary: input.salary ?? '',
      employmentType: input.employmentType,
      soloParent: input.employmentType === 'COS' ? false : !!input.soloParent,
      roles,
      signatureFileId: prev?.signatureFileId ?? '',
      isActive: input.isActive,
      createdAt: prev?.createdAt ?? now(deps),
      updatedAt: now(deps),
      version: (prev?.version ?? 0) + 1,
    };
    if (prev) db.replace('Employees', e.employeeId, employeeRow(e));
    else db.append('Employees', employeeRow(e));
    audit(deps, c.employee.employeeId, c.email, prev ? 'UPDATE_EMPLOYEE' : 'REGISTER_EMPLOYEE', e.employeeId, {
      email: e.email,
      roles: e.roles,
      isActive: e.isActive,
      soloParent: e.soloParent,
      before: prev ? { email: prev.email, roles: prev.roles, isActive: prev.isActive, soloParent: prev.soloParent } : null,
    });
    return employeeDto(e, divisions);
  });
}

/** Staff correct their own name, position and salary, when the administrator allows it (Settings). */
export function saveMyProfile(deps: Deps, c: Caller, input: SaveMyProfileInput): EmployeeDto {
  return deps.lock.run(() => {
    const db = deps.db.get();
    if (!readSettings(db).profileSelfEdit) throw new AppError('FORBIDDEN', 'Editing your own profile is switched off. Ask HR to correct your record.');
    const row = db.findOne('Employees', 'employee_id', c.employee.employeeId);
    if (!row) throw new AppError('NOT_FOUND', 'Employee not found.');
    const prev = toEmployee(row);
    if (prev.version !== input.version) throw new AppError('STALE_VERSION', 'Your record was changed in the meantime. Reload and try again.');
    const e: Employee = {
      ...prev,
      lastName: input.lastName,
      firstName: input.firstName,
      middleName: input.middleName ?? '',
      position: input.position,
      salary: input.salary ?? '',
      updatedAt: now(deps),
      version: prev.version + 1,
    };
    db.replace('Employees', e.employeeId, employeeRow(e));
    const pick = (x: Employee) => ({ lastName: x.lastName, firstName: x.firstName, middleName: x.middleName, position: x.position, salary: x.salary });
    audit(deps, c.employee.employeeId, c.email, 'UPDATE_OWN_PROFILE', e.employeeId, { before: pick(prev), after: pick(e) });
    return employeeDto(e, loadDivisions(db));
  });
}

// ---------------------------------------------------------------- divisions

function divisionDto(d: Division, employees: Map<string, Employee>): DivisionDto {
  const chief = employees.get(d.chiefEmployeeId);
  return { ...d, chiefName: chief ? fullName(chief) : '' };
}

export function listDivisions(deps: Deps): DivisionDto[] {
  const db = deps.db.get();
  const employees = loadEmployees(db);
  return [...loadDivisions(db).values()].map((d) => divisionDto(d, employees)).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveDivision(deps: Deps, c: Caller, input: { divisionId?: string; name: string; code: string; chiefEmployeeId?: string; noChief?: boolean; isActive: boolean }): DivisionDto {
  requireRole(c, 'HR', 'ADMIN');
  return deps.lock.run(() => {
    const db = deps.db.get();
    const employees = loadEmployees(db);
    const divisions = loadDivisions(db);
    if (input.chiefEmployeeId && !employees.get(input.chiefEmployeeId)?.isActive) throw new AppError('VALIDATION', 'Choose an active employee as chief.');
    const prev = input.divisionId ? divisions.get(input.divisionId) : undefined;
    if (input.divisionId && !prev) throw new AppError('NOT_FOUND', 'Division not found.');
    const d: Division = {
      divisionId: prev?.divisionId ?? deps.uuid(),
      code: input.code,
      name: input.name,
      chiefEmployeeId: input.noChief ? '' : (input.chiefEmployeeId ?? ''),
      noChief: !!input.noChief,
      isActive: input.isActive,
    };
    if (prev) db.replace('Divisions', d.divisionId, divisionRow(d));
    else db.append('Divisions', divisionRow(d));
    audit(deps, c.employee.employeeId, c.email, prev ? 'UPDATE_DIVISION' : 'CREATE_DIVISION', d.divisionId, { ...d, before: prev ?? null });
    return divisionDto(d, employees);
  });
}

// ---------------------------------------------------------------- holidays

export function listHolidays(deps: Deps): { date: string; name: string }[] {
  return deps.db
    .get()
    .readAll('Holidays')
    .map((h) => ({ date: h.date, name: h.name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function saveHoliday(deps: Deps, c: Caller, date: string, name: string) {
  requireRole(c, 'HR', 'ADMIN');
  deps.lock.run(() => {
    const db = deps.db.get();
    if (db.findOne('Holidays', 'date', date)) db.replace('Holidays', date, { date, name });
    else db.append('Holidays', { date, name });
    audit(deps, c.employee.employeeId, c.email, 'SAVE_HOLIDAY', date, { name });
  });
  return listHolidays(deps);
}

export function deleteHoliday(deps: Deps, c: Caller, date: string) {
  requireRole(c, 'HR', 'ADMIN');
  deps.lock.run(() => {
    deps.db.get().deleteRows('Holidays', (r) => r.date === date);
    audit(deps, c.employee.employeeId, c.email, 'DELETE_HOLIDAY', date, {});
  });
  return listHolidays(deps);
}

// ---------------------------------------------------------------- OIC Regional Director

const canManageOic = (c: Caller) => c.roles.has('REGIONAL_DIRECTOR') || c.roles.has('ADMIN');

export function listOic(deps: Deps, c: Caller): OicDto[] {
  if (!canManageOic(c) && !c.roles.has('HR')) throw new AppError('FORBIDDEN', 'You do not have access to this.');
  const db = deps.db.get();
  const employees = loadEmployees(db);
  return db
    .readAll('OicAssignments')
    .map(toOic)
    .filter((o) => !o.deletedAt)
    .map((o) => {
      const e = employees.get(o.employeeId);
      const by = employees.get(o.createdBy);
      return { assignmentId: o.assignmentId, employeeId: o.employeeId, employeeName: e ? fullName(e) : '(unknown)', startDate: o.startDate, endDate: o.endDate, remarks: o.remarks, createdBy: by ? fullName(by) : '' };
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function saveOic(deps: Deps, c: Caller, input: { employeeId: string; startDate: string; endDate: string; remarks?: string }): OicDto[] {
  if (!canManageOic(c)) throw new AppError('FORBIDDEN', 'Only the Regional Director or the system administrator can name an OIC.');
  deps.lock.run(() => {
    const db = deps.db.get();
    const e = db.findOne('Employees', 'employee_id', input.employeeId);
    if (!e || !toEmployee(e).isActive) throw new AppError('VALIDATION', 'Choose an active employee.');
    const overlap = db
      .readAll('OicAssignments')
      .map(toOic)
      .find((o) => !o.deletedAt && o.startDate <= input.endDate && input.startDate <= o.endDate);
    if (overlap) throw new AppError('CONFLICT', `Another OIC is already assigned from ${overlap.startDate} to ${overlap.endDate}.`);
    const id = deps.uuid();
    db.append('OicAssignments', {
      assignment_id: id,
      employee_id: input.employeeId,
      start_date: input.startDate,
      end_date: input.endDate,
      remarks: input.remarks ?? '',
      created_by: c.employee.employeeId,
      created_at: now(deps),
      deleted_at: '',
    });
    audit(deps, c.employee.employeeId, c.email, 'ASSIGN_OIC', id, input);
  });
  return listOic(deps, c);
}

export function deleteOic(deps: Deps, c: Caller, assignmentId: string): OicDto[] {
  if (!canManageOic(c)) throw new AppError('FORBIDDEN', 'Only the Regional Director or the system administrator can change OIC assignments.');
  deps.lock.run(() => {
    const db = deps.db.get();
    const row = db.findOne('OicAssignments', 'assignment_id', assignmentId);
    if (!row) throw new AppError('NOT_FOUND', 'Assignment not found.');
    db.replace('OicAssignments', assignmentId, { ...row, deleted_at: now(deps) });
    audit(deps, c.employee.employeeId, c.email, 'REMOVE_OIC', assignmentId, {});
  });
  return listOic(deps, c);
}

// ---------------------------------------------------------------- settings

export function getSettings(deps: Deps, c: Caller): SettingsDto {
  requireRole(c, 'HR', 'ADMIN');
  return readSettings(deps.db.get());
}

export function saveSettings(deps: Deps, c: Caller, input: SettingsInput): SettingsDto {
  requireRole(c, 'ADMIN');
  return deps.lock.run(() => {
    const db = deps.db.get();
    const before = readSettings(db);
    writeSettings(deps, db, input, c.employee.employeeId);
    audit(deps, c.employee.employeeId, c.email, 'SAVE_SETTINGS', 'settings', { before, after: input });
    return readSettings(db);
  });
}

// ---------------------------------------------------------------- specimen signature

const SIGNERS = ['DIVISION_CHIEF', 'SUPERVISING_AO', 'REGIONAL_DIRECTOR'] as const;

/** Anyone uploads their own e-signature (specimen signature). */
export function uploadSignature(deps: Deps, c: Caller, pngBase64: string): { ok: true } {
  // Everyone may keep an e-signature: it prints as the applicant's signature on their own forms,
  // and signatories also use it when they e-sign.
  const db = deps.db.get();
  const fileId = deps.files.save('signature', `signature-${c.employee.employeeId}.png`, pngBase64, 'image/png');
  deps.lock.run(() => {
    const row = db.findOne('Employees', 'employee_id', c.employee.employeeId);
    if (!row) throw new AppError('NOT_FOUND', 'Employee not found.');
    const e = toEmployee(row);
    const old = e.signatureFileId;
    e.signatureFileId = fileId;
    e.updatedAt = now(deps);
    e.version++;
    db.replace('Employees', e.employeeId, employeeRow(e));
    if (old) {
      try {
        deps.files.trash(old);
      } catch {
        /* the old image stays in the private folder */
      }
    }
    audit(deps, c.employee.employeeId, c.email, 'UPLOAD_SIGNATURE', e.employeeId, {});
  });
  return { ok: true };
}

export function mySignature(deps: Deps, c: Caller): { pngBase64: string | null } {
  return { pngBase64: c.employee.signatureFileId ? deps.files.readBase64(c.employee.signatureFileId) : null };
}

/** Anyone who can sign something (used for the "My signature" menu and the HR paper-signature picker). */
export function isSignatory(deps: Deps, c: Caller): boolean {
  if (SIGNERS.some((r) => c.roles.has(r))) return true;
  const db = deps.db.get();
  return (
    [...loadDivisions(db).values()].some((d) => d.chiefEmployeeId === c.employee.employeeId) ||
    db.readAll('OicAssignments').some((r) => r.employee_id === c.employee.employeeId && !r.deleted_at)
  );
}
