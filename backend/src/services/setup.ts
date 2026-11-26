import { APP_NAME } from '@shared/constants';
import type { Deps } from '../platform/types';
import { audit } from './audit';
import { divisionRow, employeeRow, readSettings, toEmployee, writeSettings } from './model';

/**
 * DHSUD Region 10 offices. Five divisions with their chiefs, plus the Legal Unit, which has no chief, and the Office of
 * the Regional Director has none either, so leave from both goes past the Division Chief step.
 */
export const REGION_DIVISIONS = [
  { code: 'ORD', name: 'Office of the Regional Director', noChief: true },
  { code: 'AFD', name: 'Administrative and Finance Division', noChief: false },
  { code: 'HREDRD', name: 'Housing and Real Estate Development Regulation Division', noChief: false },
  { code: 'HOACDD', name: 'Homeowners Associations and Community Development Division', noChief: false },
  { code: 'ELUPDD', name: 'Environmental, Land Use and Urban Planning and Development Division', noChief: false },
  { code: 'PHSD', name: 'Public Housing and Settlements Division', noChief: false },
  { code: 'LEGAL', name: 'Legal Unit', noChief: true },
] as const;

/**
 * Creates the spreadsheet and its sheets (or adds what is missing), saves default settings and
 * registers the owner account (and any extra admin addresses) as administrator and HR so they can register everyone else.
 * Safe to run again.
 */
export function initializeDatabase(deps: Deps): { url: string; created: boolean } {
  const res = deps.db.ensureSchema(`${APP_NAME} DB (${deps.environment})`);
  deps.lock.run(() => {
    const db = deps.db.get();
    if (!db.readAll('Settings').length) writeSettings(deps, db, readSettings(db), 'setup');
    // Adds any of the Region 10 divisions that are missing, matched by code. HR picks the chiefs later.
    const codes = new Set(db.readAll('Divisions').map((r) => r.code.trim().toUpperCase()));
    for (const d of REGION_DIVISIONS) {
      if (codes.has(d.code)) continue;
      db.append('Divisions', divisionRow({ divisionId: deps.uuid(), code: d.code, name: d.name, chiefEmployeeId: '', noChief: d.noChief, isActive: true }));
    }
    const divisionId = db.readAll('Divisions').find((r) => r.code.trim().toUpperCase() === 'ORD')?.division_id ?? db.readAll('Divisions')[0]?.division_id ?? '';
    const owner = deps.identity.ownerEmail().toLowerCase();
    const admins = [owner, ...deps.identity.extraAdminEmails().map((e) => e.trim().toLowerCase())].filter((e, i, all) => e && all.indexOf(e) === i);
    for (const email of admins) {
      if (db.readAll('Employees').some((r) => toEmployee(r).email === email)) continue;
      const now = new Date(deps.nowMs()).toISOString();
      const id = deps.uuid();
      db.append(
        'Employees',
        employeeRow({
          employeeId: id,
          email,
          lastName: 'Administrator',
          firstName: 'System',
          middleName: '',
          divisionId,
          position: 'System Administrator',
          salary: '',
          employmentType: 'REGULAR',
          soloParent: false,
          roles: ['ADMIN', 'HR'],
          signatureFileId: '',
          isActive: true,
          createdAt: now,
          updatedAt: now,
          version: 1,
        }),
      );
      audit(deps, id, email, 'SETUP', 'database', { created: res.created });
    }
  });
  return res;
}
