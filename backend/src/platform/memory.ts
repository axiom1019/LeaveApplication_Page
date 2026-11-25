import { TABLES, TABLE_NAMES, type ColumnOf, type RowOf, type TableName } from '../repository/schema';
import { AppError } from '../services/errors';
import type { Db, DbProvider, Deps } from './types';

/** In-memory platform for unit tests and the local dev bridge. Never used in Apps Script. */
export class MemoryDb implements Db {
  readonly tables = new Map<TableName, Record<string, string>[]>();
  readAll<T extends TableName>(t: T): RowOf<T>[] {
    return (this.tables.get(t) ?? []).map((r) => ({ ...r })) as RowOf<T>[];
  }
  append<T extends TableName>(t: T, row: RowOf<T>): void {
    const rows = this.tables.get(t) ?? [];
    rows.push({ ...row });
    this.tables.set(t, rows);
  }
  replace<T extends TableName>(t: T, id: string, row: RowOf<T>): boolean {
    const rows = this.tables.get(t) ?? [];
    const i = rows.findIndex((r) => r[TABLES[t].id] === id);
    if (i < 0) return false;
    rows[i] = { ...row };
    return true;
  }
  findOne<T extends TableName>(t: T, column: ColumnOf<T>, value: string): RowOf<T> | undefined {
    const r = (this.tables.get(t) ?? []).find((x) => x[column] === value);
    return r ? ({ ...r } as RowOf<T>) : undefined;
  }
  deleteRows<T extends TableName>(t: T, shouldDelete: (row: RowOf<T>) => boolean): number {
    const rows = this.tables.get(t) ?? [];
    const keep = rows.filter((r) => !shouldDelete({ ...r } as RowOf<T>));
    this.tables.set(t, keep);
    return rows.length - keep.length;
  }
}

class MemoryDbProvider implements DbProvider {
  db: MemoryDb | null = null;
  isInitialized() {
    return this.db !== null;
  }
  get(): Db {
    if (!this.db) throw new AppError('NOT_INITIALIZED', 'The system has not been set up yet.');
    return this.db;
  }
  ensureSchema() {
    const created = !this.db;
    this.db ??= new MemoryDb();
    for (const t of TABLE_NAMES) if (!this.db.tables.has(t)) this.db.tables.set(t, []);
    return { url: 'memory://db', created };
  }
}

export type MemoryDeps = Deps & {
  db: MemoryDbProvider;
  sent: { to: string; subject: string; body: string }[];
  stored: Map<string, string>;
  setActiveEmail(email: string): void;
  setNow(ms: number): void;
  advance(ms: number): void;
};

/** Tiny non-cryptographic hash, good enough for tests and the browser dev bridge. */
function fakeSha256(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519);
  }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(16, '0');
}

export function createMemoryDeps(opts: { activeEmail?: string; ownerEmail?: string; nowMs?: number } = {}): MemoryDeps {
  let active = opts.activeEmail ?? '';
  let now = opts.nowMs ?? Date.UTC(2026, 11, 1, 1, 0, 0);
  let n = 0;
  const cache = new Map<string, { v: string; exp: number }>();
  const stored = new Map<string, string>();
  const sent: MemoryDeps['sent'] = [];
  return {
    environment: 'development',
    db: new MemoryDbProvider(),
    lock: { run: (fn) => fn() },
    cache: {
      get: (k) => {
        const e = cache.get(k);
        return e && e.exp > now ? e.v : null;
      },
      put: (k, v, ttl) => void cache.set(k, { v, exp: now + ttl * 1000 }),
      remove: (k) => void cache.delete(k),
    },
    identity: { activeEmail: () => active, ownerEmail: () => opts.ownerEmail ?? 'region10@dhsud.gov.ph' },
    mail: { send: (to, subject, body) => void sent.push({ to, subject, body }), remainingQuota: () => 1500 - sent.length },
    files: {
      save: (kind, name, base64) => {
        const id = `file-${kind}-${++n}`;
        stored.set(id, base64);
        return id;
      },
      readBase64: (id) => stored.get(id) ?? null,
      trash: (id) => void stored.delete(id),
    },
    pdf: { fromHtml: (html) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(html))) : Buffer.from(html).toString('base64')) },
    appUrl: () => 'https://example.invalid/leave',
    nowMs: () => now,
    uuid: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`,
    randomToken: () => `tok${(++n).toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    sha256: fakeSha256,
    log: () => {},
    sent,
    stored,
    setActiveEmail: (e) => {
      active = e;
    },
    setNow: (ms) => {
      now = ms;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}
