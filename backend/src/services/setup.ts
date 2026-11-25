import { APP_NAME } from '@shared/constants';
import type { Deps } from '../platform/types';
import { audit } from './audit';
import { divisionRow, employeeRow, readSettings, toEmployee, writeSettings } from './model';

/** DHSUD Region 10: the Office of the Regional Director and its six divisions. */
export const DIVISIONS: readonly [string, string][] = [
  ['ORD', 'Office of the Regional Director'],
  ['AFD', 'Administrative and Finance Division'],
  ['HREDRD', 'Housing and Real Estate Development Regulation Division'],
  ['HOACDD', 'Homeowners Associations and Community Development Division'],
  ['ELUPDD', 'Environmental, Land Use and Urban Planning and Development Division'],
  ['PHSD', 'Public Housing and Settlements Division'],
  ['LEGAL', 'Legal Division'],
];

/**
 * Creates the spreadsheet and its sheets (or adds what is missing), saves default settings and
 * registers the owner account as administrator and HR so they can register everyone else.
 * Safe to run again.
 */
export function initializeDatabase(deps: Deps): { url: string; created: boolean } {
  const res = deps.db.ensureSchema(`${APP_NAME} DB (${deps.environment})`);
  deps.lock.run(() => {
    const db = deps.db.get();
    if (!db.readAll('Settings').length) writeSettings(deps, db, readSettings(db), 'setup');
    // Adds the regional office's divisions that are missing (by code); names can be changed under Setup.
    const codes = new Set(db.readAll('Divisions').map((r) => r.code.toUpperCase()));
    for (const [code, name] of DIVISIONS) {
      if (!codes.has(code)) db.append('Divisions', divisionRow({ divisionId: deps.uuid(), code, name, chiefEmployeeId: '', isActive: true }));
    }
    const divisionId = db.readAll('Divisions').find((r) => r.code.toUpperCase() === 'ORD')?.division_id ?? db.readAll('Divisions')[0]!.division_id;
    const owner = deps.identity.ownerEmail().toLowerCase();
    if (owner && !db.readAll('Employees').some((r) => toEmployee(r).email === owner)) {
      const now = new Date(deps.nowMs()).toISOString();
      const id = deps.uuid();
      db.append(
        'Employees',
        employeeRow({
          employeeId: id,
          email: owner,
          lastName: 'Administrator',
          firstName: 'System',
          middleName: '',
          divisionId,
          position: 'System Administrator',
          salary: '',
          employmentType: 'REGULAR',
          roles: ['ADMIN', 'HR'],
          signatureFileId: '',
          isActive: true,
          createdAt: now,
          updatedAt: now,
          version: 1,
        }),
      );
      audit(deps, id, owner, 'SETUP', 'database', { created: res.created });
    }
  });
  return res;
}
