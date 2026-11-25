/*
 * The platform layer. Business rules in services/ use only these interfaces. Apps Script
 * implements them in gas.ts; tests and the local dev bridge use memory.ts. Moving to a server
 * means writing one more implementation (database, file storage, SMTP, HTML-to-PDF) and keeping
 * everything in services/ and shared/ as it is.
 */
import type { ColumnOf, RowOf, TableName } from '../repository/schema';

export interface Db {
  readAll<T extends TableName>(table: T): RowOf<T>[];
  append<T extends TableName>(table: T, row: RowOf<T>): void;
  /** Replaces the row whose id column equals `id`. Returns false if there is no such row. */
  replace<T extends TableName>(table: T, id: string, row: RowOf<T>): boolean;
  findOne<T extends TableName>(table: T, column: ColumnOf<T>, value: string): RowOf<T> | undefined;
  deleteRows<T extends TableName>(table: T, shouldDelete: (row: RowOf<T>) => boolean): number;
}

export interface DbProvider {
  isInitialized(): boolean;
  get(): Db;
  /** Creates the store if needed, plus any missing tables and columns. */
  ensureSchema(title: string): { url: string; created: boolean };
}

export interface Lock {
  /** Runs fn under one global lock. Throws AppError('BUSY') if it can't be acquired in time. */
  run<T>(fn: () => T): T;
}

export interface Cache {
  get(key: string): string | null;
  put(key: string, value: string, ttlSeconds: number): void;
  remove(key: string): void;
}

export interface Identity {
  /** Email of the Google account using the app, '' when Google withholds it (accounts outside the domain). */
  activeEmail(): string;
  /** Account the app runs as (the deployment owner). */
  ownerEmail(): string;
  /** More addresses setup registers as administrator and HR (from deploy/<env>/admins.local.json, kept out of git). */
  extraAdminEmails(): string[];
}

export interface Mail {
  send(to: string, subject: string, body: string): void;
  remainingQuota(): number | null;
}

/** Private file storage for specimen signatures and archived PDFs. */
export interface Files {
  save(kind: 'signature' | 'pdf', name: string, base64: string, mimeType: string): string;
  readBase64(fileId: string): string | null;
  trash(fileId: string): void;
}

export interface Pdf {
  /** Converts a complete HTML document to a PDF. */
  fromHtml(html: string, fileName: string): string;
}

export interface Deps {
  /** 'development' | 'staging' | 'production' */
  environment: string;
  db: DbProvider;
  lock: Lock;
  cache: Cache;
  identity: Identity;
  mail: Mail;
  files: Files;
  pdf: Pdf;
  /** Public address of the app, for email links. */
  appUrl(): string;
  nowMs(): number;
  uuid(): string;
  /** Unpredictable token for sessions (at least 128 bits). */
  randomToken(): string;
  sha256(s: string): string;
  log(level: 'info' | 'error', message: string, data?: unknown): void;
}
