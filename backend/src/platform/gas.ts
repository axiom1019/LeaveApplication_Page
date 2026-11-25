/* Apps Script implementations of the platform interfaces. Only bundled into Code.js. */
import { APP_NAME, TIMEZONE } from '@shared/constants';
import { toSafeCell } from '../repository/cells';
import { TABLES, TABLE_NAMES, type ColumnOf, type RowOf, type TableName } from '../repository/schema';
import { AppError } from '../services/errors';
import type { Db, DbProvider, Deps, Files } from './types';

/** Written by scripts/assemble.mjs into Env.js. */
declare const EXTRA_ADMIN_EMAILS: string[] | undefined;

const DB_ID_KEY = 'DB_SPREADSHEET_ID';
const GROW_ROWS = 500;

/** One sheet with a header row; rows mapped by header name; every cell stored as text. */
export class SheetTable {
  private header: string[] | null = null;
  private rows: string[][] | null = null;
  /** Append position and sheet size, fetched once per execution (each sheet query is a round trip). */
  private nextRow: number | null = null;
  private maxRows: number | null = null;

  private sheetRef: GoogleAppsScript.Spreadsheet.Sheet | null = null;
  /** `sheet` may be a getter, so a table filled by a batch read never has to look its sheet up. */
  constructor(
    private readonly source: GoogleAppsScript.Spreadsheet.Sheet | (() => GoogleAppsScript.Spreadsheet.Sheet),
    private readonly idColumn: string,
    /** Schema columns; one missing from the sheet is added to the header when a write first sets it. */
    private readonly columns: readonly string[] = [],
  ) {}

  /**
   * Adds schema columns the sheet lacks when `row` gives them a value, so a column added in a
   * release reaches existing databases without rerunning setup. Writes run inside the script
   * lock, so two executions never add the same column. Reads tolerate the missing column ('').
   */
  private withColumnsFor(row: Record<string, string>, header: string[]): string[] {
    const missing = this.columns.filter((c) => !header.includes(c) && (row[c] ?? '') !== '');
    if (!missing.length) return header;
    const start = header.length + 1;
    const need = start + missing.length - 1;
    if (need > this.sheet.getMaxColumns()) this.sheet.insertColumnsAfter(this.sheet.getMaxColumns(), need - this.sheet.getMaxColumns());
    this.sheet.getRange(1, start, 1, missing.length).setNumberFormat('@').setValues([missing]).setFontWeight('bold');
    this.header = [...header, ...missing];
    return this.header;
  }

  private get sheet(): GoogleAppsScript.Spreadsheet.Sheet {
    return (this.sheetRef ??= typeof this.source === 'function' ? this.source() : this.source);
  }

  get isLoaded(): boolean {
    return this.rows !== null;
  }

  /** Fills the table from values read elsewhere (row 1 = header), unless it was already read. */
  preload(values: string[][]): void {
    if (this.rows) return;
    this.header = (values[0] ?? []).map((h) => h.trim());
    this.rows = values.slice(1);
  }

  private load(): { header: string[]; rows: string[][] } {
    if (!this.rows) {
      const lastRow = this.sheet.getLastRow();
      const lastCol = Math.max(this.sheet.getLastColumn(), 1);
      const values = lastRow === 0 ? [] : this.sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
      const header = (values[0] ?? []).map((h) => h.trim());
      const rows = values.slice(1);
      this.header = header;
      this.rows = rows;
      return { header, rows };
    }
    return { header: this.headerOnly(), rows: this.rows };
  }

  /** Header only (row 1); cheap, does not read data rows. */
  private headerOnly(): string[] {
    if (this.header) return this.header;
    const lastCol = Math.max(this.sheet.getLastColumn(), 1);
    this.header = (this.sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] ?? []).map((h) => h.trim());
    return this.header;
  }

  readAll(): Record<string, string>[] {
    const { header, rows } = this.load();
    return rows
      .filter((r) => r.some((c) => c !== ''))
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }

  private toArray(header: string[], row: Record<string, string>): string[] {
    return header.map((h) => toSafeCell(row[h] ?? ''));
  }

  /**
   * Appends without reading the data rows (append-only sheets like AuditLogs and IdempotencyKeys
   * grow without bound, so reading them on every write would slow every write down).
   */
  append(row: Record<string, string>): void {
    const header = this.withColumnsFor(row, this.headerOnly());
    // Only writes below this point, so Apps Script can batch them until the next read or flush.
    const target = this.rows ? this.rows.length + 2 : (this.nextRow ??= Math.max(this.sheet.getLastRow(), 1) + 1);
    this.maxRows ??= this.sheet.getMaxRows();
    if (target > this.maxRows) {
      this.sheet.insertRowsAfter(this.maxRows, GROW_ROWS);
      this.sheet.getRange(this.maxRows + 1, 1, GROW_ROWS, header.length).setNumberFormat('@');
      this.maxRows += GROW_ROWS;
    }
    this.sheet.getRange(target, 1, 1, header.length).setNumberFormat('@').setValues([this.toArray(header, row)]);
    if (this.rows) this.rows.push(header.map((h) => row[h] ?? ''));
    else this.nextRow = target + 1;
  }

  /**
   * Finds the first row whose `column` equals `value` exactly. When the table has not been read
   * yet, reads only that one column and then the matching row, instead of the whole sheet.
   * (A TextFinder was tried first and measured slower on staging: 473 ms vs 149 ms.)
   */
  findOne(column: string, value: string): Record<string, string> | undefined {
    if (this.rows) return this.readAll().find((r) => r[column] === value);
    if (!value) return undefined;
    const header = this.headerOnly();
    const col = header.indexOf(column);
    const lastRow = this.sheet.getLastRow();
    if (col < 0 || lastRow < 2) return undefined;
    const keys = this.sheet.getRange(2, col + 1, lastRow - 1, 1).getDisplayValues();
    const i = keys.findIndex((k) => k[0] === value);
    if (i < 0) return undefined;
    const values = this.sheet.getRange(i + 2, 1, 1, header.length).getDisplayValues()[0] ?? [];
    return Object.fromEntries(header.map((h, j) => [h, values[j] ?? '']));
  }

  replace(id: string, row: Record<string, string>): boolean {
    const { rows } = this.load();
    const header = this.withColumnsFor(row, this.headerOnly());
    const idIdx = header.indexOf(this.idColumn);
    const i = rows.findIndex((r) => r[idIdx] === id);
    if (idIdx < 0 || i < 0) return false;
    this.sheet.getRange(i + 2, 1, 1, header.length).setNumberFormat('@').setValues([this.toArray(header, row)]);
    rows[i] = header.map((h) => row[h] ?? '');
    return true;
  }

  /** Deletes matching rows bottom-up in contiguous blocks (row numbers stay valid while deleting). */
  deleteWhere(shouldDelete: (row: Record<string, string>) => boolean): number {
    const { header, rows } = this.load();
    const doomed: number[] = [];
    rows.forEach((r, i) => {
      if (r.some((c) => c !== '') && shouldDelete(Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])))) doomed.push(i + 2);
    });
    for (let k = doomed.length - 1; k >= 0; ) {
      let start = doomed[k] as number;
      let count = 1;
      while (k - count >= 0 && doomed[k - count] === start - 1) {
        start--;
        count++;
      }
      this.sheet.deleteRows(start, count);
      k -= count;
    }
    this.clearCache();
    return doomed.length;
  }

  clearCache(): void {
    this.header = null;
    this.rows = null;
    this.nextRow = null;
    this.maxRows = null;
  }
}

/**
 * Sheets read together in one Sheets API request (values.batchGet) the first time any of them is
 * read in an execution. Reading them one by one costs several round trips each (about 4.6 s for a
 * month of the calendar on staging); one batch is a single round trip. The append-only logs are
 * left out: they grow without bound and are written, not read, on normal requests.
 */
export const BATCH_TABLES: readonly TableName[] = TABLE_NAMES.filter((n) => n !== 'AuditLog');

/** One Sheets API request for several whole sheets, as display text (cells are stored as text). */
export function batchRead(spreadsheetId: string, names: readonly TableName[]): Map<TableName, string[][]> {
  if (typeof Sheets === 'undefined' || !Sheets?.Spreadsheets?.Values) throw new Error('Sheets advanced service is not enabled');
  const res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
    ranges: names.map((n) => `'${n}'`),
    valueRenderOption: 'FORMATTED_VALUE',
    majorDimension: 'ROWS',
  });
  const ranges = res.valueRanges ?? [];
  if (ranges.length !== names.length) throw new Error(`batchGet returned ${ranges.length} ranges for ${names.length} sheets`);
  const out = new Map<TableName, string[][]>();
  names.forEach((n, i) => out.set(n, ((ranges[i]?.values ?? []) as unknown[][]).map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))))));
  return out;
}

class SheetsDb implements Db {
  private readonly tables = new Map<TableName, SheetTable>();
  private ssRef: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;
  private batchTried = false;
  private wrote = false;
  constructor(private readonly id: string) {}

  private get ss(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    return (this.ssRef ??= SpreadsheetApp.openById(this.id));
  }

  private table(name: TableName): SheetTable {
    let t = this.tables.get(name);
    if (!t) {
      t = new SheetTable(() => {
        const sheet = this.ss.getSheetByName(name);
        if (!sheet) throw new AppError('NOT_INITIALIZED', `Sheet "${name}" is missing. Run database setup again.`);
        return sheet;
      }, TABLES[name].id, TABLES[name].columns);
      this.tables.set(name, t);
    }
    return t;
  }

  /** On the first read of a batch table, loads every batch table not yet read, in one request. */
  private prefetch(name: TableName): void {
    if (this.batchTried || !BATCH_TABLES.includes(name) || this.table(name).isLoaded) return;
    this.batchTried = true;
    try {
      if (this.wrote) SpreadsheetApp.flush(); // the API reads what is saved, so save this execution's writes first
      const wanted = BATCH_TABLES.filter((n) => !this.table(n).isLoaded);
      for (const [n, values] of batchRead(this.id, wanted)) this.table(n).preload(values);
    } catch (e) {
      // Fall back to reading sheet by sheet (slower, same result).
      console.warn(JSON.stringify({ message: 'Batch read failed; reading sheets one by one', error: e instanceof Error ? e.message : String(e) }));
    }
  }

  readAll<T extends TableName>(name: T): RowOf<T>[] {
    this.prefetch(name);
    return this.table(name).readAll() as RowOf<T>[];
  }
  append<T extends TableName>(name: T, row: RowOf<T>): void {
    this.wrote = true;
    this.table(name).append(row);
  }
  replace<T extends TableName>(name: T, id: string, row: RowOf<T>): boolean {
    this.wrote = true;
    return this.table(name).replace(id, row);
  }
  deleteRows<T extends TableName>(name: T, shouldDelete: (row: RowOf<T>) => boolean): number {
    this.wrote = true;
    return this.table(name).deleteWhere(shouldDelete as (row: Record<string, string>) => boolean);
  }
  findOne<T extends TableName>(name: T, column: ColumnOf<T>, value: string): RowOf<T> | undefined {
    return this.table(name).findOne(column, value) as RowOf<T> | undefined;
  }
  clearCache(): void {
    for (const t of this.tables.values()) t.clearCache();
    this.batchTried = false;
  }
}

class SheetsDbProvider implements DbProvider {
  private db: SheetsDb | null = null;
  private props = PropertiesService.getScriptProperties();

  isInitialized(): boolean {
    return !!this.props.getProperty(DB_ID_KEY);
  }
  get(): SheetsDb {
    if (!this.db) {
      const id = this.props.getProperty(DB_ID_KEY);
      if (!id) throw new AppError('NOT_INITIALIZED', 'The system has not been set up yet.');
      this.db = new SheetsDb(id);
    }
    return this.db;
  }
  /**
   * Called right after acquiring the lock: drops rows read so far and reopens the spreadsheet,
   * so code inside the lock sees what other executions wrote. (Defence in depth; the main rule
   * is that write paths do not read sheets before the lock — see B-006.)
   */
  reset(): void {
    this.db = null;
  }
  ensureSchema(title: string): { url: string; created: boolean } {
    const existingId = this.props.getProperty(DB_ID_KEY);
    const created = !existingId;
    const ss = existingId ? SpreadsheetApp.openById(existingId) : SpreadsheetApp.create(title);
    if (created) this.props.setProperty(DB_ID_KEY, ss.getId());
    ss.setSpreadsheetTimeZone(TIMEZONE);

    for (const name of TABLE_NAMES) {
      const cols = TABLES[name].columns as readonly string[];
      const sheet = ss.getSheetByName(name) ?? ss.insertSheet(name);
      const lastCol = sheet.getLastColumn();
      const header = lastCol === 0 ? [] : (sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] ?? []).map((h) => h.trim());
      const missing = cols.filter((c) => !header.includes(c));
      if (missing.length) {
        const start = header.length + 1;
        if (start + missing.length - 1 > sheet.getMaxColumns()) {
          sheet.insertColumnsAfter(sheet.getMaxColumns(), start + missing.length - 1 - sheet.getMaxColumns());
        }
        sheet.getRange(1, start, 1, missing.length).setNumberFormat('@').setValues([missing]).setFontWeight('bold');
      }
      const width = header.length + missing.length;
      sheet.getRange(1, 1, sheet.getMaxRows(), width).setNumberFormat('@');
      sheet.setFrozenRows(1);
    }
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
    SpreadsheetApp.flush();
    this.db = null;
    return { url: ss.getUrl(), created };
  }
}


const FOLDER_KEYS = { signature: 'SIGNATURE_FOLDER_ID', pdf: 'PDF_FOLDER_ID' } as const;
const FOLDER_NAMES = { signature: `${APP_NAME} - Specimen signatures (restricted)`, pdf: `${APP_NAME} - Filed forms (restricted)` } as const;

/**
 * Private Drive folders owned by the app account. They are never shared: the app reads them
 * as the owner, so staff can't open the files directly.
 */
export function ensureFolders(): void {
  const props = PropertiesService.getScriptProperties();
  for (const kind of ['signature', 'pdf'] as const) {
    const id = props.getProperty(FOLDER_KEYS[kind]);
    if (id) {
      try {
        DriveApp.getFolderById(id);
        continue;
      } catch {
        /* recreate below */
      }
    }
    const folder = DriveApp.createFolder(FOLDER_NAMES[kind]);
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
    props.setProperty(FOLDER_KEYS[kind], folder.getId());
  }
}

const gasFiles: Files = {
  save(kind, name, base64, mimeType) {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty(FOLDER_KEYS[kind]);
    if (!folderId) {
      ensureFolders();
      folderId = props.getProperty(FOLDER_KEYS[kind]);
    }
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, name);
    return DriveApp.getFolderById(folderId as string).createFile(blob).getId();
  },
  readBase64(fileId) {
    try {
      return Utilities.base64Encode(DriveApp.getFileById(fileId).getBlob().getBytes());
    } catch {
      return null;
    }
  },
  trash(fileId) {
    DriveApp.getFileById(fileId).setTrashed(true);
  },
};

export function createGasDeps(environment: string): Deps {
  const db = new SheetsDbProvider();
  const cache = CacheService.getScriptCache();
  return {
    environment,
    db,
    lock: {
      run<T>(fn: () => T): T {
        const lock = LockService.getScriptLock();
        if (!lock.tryLock(25_000)) throw new AppError('BUSY', 'The system is busy. Please try again in a moment.');
        try {
          SpreadsheetApp.flush();
          db.reset();
          return fn();
        } finally {
          SpreadsheetApp.flush();
          lock.releaseLock();
        }
      },
    },
    cache: {
      get: (k) => cache.get(k),
      put: (k, v, ttl) => cache.put(k, v, Math.min(ttl, 21_600)),
      remove: (k) => cache.remove(k),
    },
    identity: {
      activeEmail: () => (Session.getActiveUser().getEmail() || '').toLowerCase(),
      ownerEmail: () => Session.getEffectiveUser().getEmail(),
      extraAdminEmails: () => (typeof EXTRA_ADMIN_EMAILS === 'undefined' ? [] : EXTRA_ADMIN_EMAILS),
    },
    mail: {
      send: (to, subject, body) => MailApp.sendEmail({ to, subject: `${environment === 'production' ? '' : `[${environment.toUpperCase()}] `}${subject}`, body, name: `DHSUD R10 ${APP_NAME}` }),
      remainingQuota: () => MailApp.getRemainingDailyQuota(),
    },
    files: gasFiles,
    pdf: {
      fromHtml: (html, fileName) => Utilities.base64Encode(Utilities.newBlob(html, 'text/html', 'form.html').getAs('application/pdf').setName(fileName).getBytes()),
    },
    appUrl: () => {
      try {
        return ScriptApp.getService().getUrl();
      } catch {
        return '';
      }
    },
    nowMs: () => Date.now(),
    uuid: () => Utilities.getUuid(),
    randomToken: () => (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''),
    sha256: (s) =>
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
        .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
        .join(''),
    log: (level, message, data) => (level === 'error' ? console.error : console.log)(JSON.stringify({ message, data })),
  };
}
