import type { AuditDto } from '@shared/api';
import { manilaDateTime } from '@shared/dates';
import type { Deps } from '../platform/types';

/**
 * Append-only log. Staff never get access to the spreadsheet (the app runs as the owner), and
 * nothing in the app edits or deletes AuditLog rows.
 */
export function audit(deps: Deps, actorId: string, actorEmail: string, action: string, entityId: string, detail: unknown): void {
  deps.db.get().append('AuditLog', {
    log_id: deps.uuid(),
    at: new Date(deps.nowMs()).toISOString(),
    actor_id: actorId,
    actor_email: actorEmail,
    action,
    entity_id: entityId,
    detail_json: JSON.stringify(detail ?? {}),
  });
}

export function listAudit(deps: Deps, entityId: string | undefined, limit = 200): AuditDto[] {
  return deps.db
    .get()
    .readAll('AuditLog')
    .filter((r) => !entityId || r.entity_id === entityId)
    .slice(-limit)
    .reverse()
    .map((r) => ({ at: manilaDateTime(Date.parse(r.at)), actor: r.actor_email, action: r.action, entityId: r.entity_id, detail: r.detail_json }));
}
