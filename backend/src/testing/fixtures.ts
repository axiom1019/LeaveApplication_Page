/* Sample data for tests and the local dev bridge. */
import { endpoints } from '../api/endpoints';
import { createMemoryDeps, type MemoryDeps } from '../platform/memory';
import { initializeDatabase } from '../services/setup';
import { toEmployee } from '../services/model';

export const PEOPLE = {
  owner: 'region10@dhsud.gov.ph',
  hr: 'hr@dhsud.gov.ph',
  chief: 'chief.tsd@dhsud.gov.ph',
  ao: 'sao@dhsud.gov.ph',
  rd: 'rd@dhsud.gov.ph',
  oic: 'ard@dhsud.gov.ph',
  staff: 'staff@dhsud.gov.ph',
  cos: 'cos.worker@gmail.com',
} as const;

function ok<T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}

/** A database with one division and the three signatories, HR, a govmail employee and a COS employee. */
export function seededDeps(opts: { nowMs?: number } = {}): MemoryDeps & { ids: Record<keyof typeof PEOPLE, string>; divisionId: string } {
  const deps = createMemoryDeps({ ownerEmail: PEOPLE.owner, activeEmail: PEOPLE.owner, nowMs: opts.nowMs });
  initializeDatabase(deps);
  const ord = ok(endpoints.api_listDivisions(deps, {}))[0]!;
  const tsd = ok(endpoints.api_saveDivision(deps, { code: 'TSD', name: 'Technical Services Division', isActive: true }));
  const add = (email: string, last: string, first: string, position: string, roles: string[], divisionId = tsd.divisionId, employmentType = 'REGULAR') =>
    ok(endpoints.api_saveEmployee(deps, { email, lastName: last, firstName: first, middleName: 'Santos', divisionId, position, salary: '45,000', employmentType, roles, isActive: true })).employeeId;
  const ids = {
    owner: toEmployee(deps.db.get().readAll('Employees')[0]!).employeeId,
    hr: add(PEOPLE.hr, 'Reyes', 'Hazel', 'Administrative Officer IV', ['HR'], ord.divisionId),
    chief: add(PEOPLE.chief, 'Dela Cruz', 'Juan', 'Chief, Technical Services Division', []),
    ao: add(PEOPLE.ao, 'Garcia', 'Ana', 'Supervising Administrative Officer', ['SUPERVISING_AO'], ord.divisionId),
    rd: add(PEOPLE.rd, 'Mendoza', 'Ramon', 'Regional Director', ['REGIONAL_DIRECTOR'], ord.divisionId),
    oic: add(PEOPLE.oic, 'Lim', 'Olivia', 'Assistant Regional Director', [], ord.divisionId),
    staff: add(PEOPLE.staff, 'Bautista', 'Carlo', 'Engineer II', []),
    cos: add(PEOPLE.cos, 'Torres', 'Mika', 'Project Development Assistant (COS)', [], tsd.divisionId, 'COS'),
  };
  ok(endpoints.api_saveDivision(deps, { divisionId: tsd.divisionId, code: 'TSD', name: 'Technical Services Division', chiefEmployeeId: ids.chief, isActive: true }));
  return Object.assign(deps, { ids, divisionId: tsd.divisionId });
}
