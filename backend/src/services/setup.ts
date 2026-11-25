import { APP_NAME } from '@shared/constants';
import type { Deps } from '../platform/types';
import { audit } from './audit';
import { divisionRow, employeeRow, readSettings, toEmployee, writeSettings } from './model';

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
    let divisionId = db.readAll('Divisions')[0]?.division_id;
    if (!divisionId) {
      divisionId = deps.uuid();
      db.append('Divisions', divisionRow({ divisionId, code: 'ORD', name: 'Office of the Regional Director', chiefEmployeeId: '', isActive: true }));
    }
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
