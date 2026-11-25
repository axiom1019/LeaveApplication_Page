import type { ApiContract, ApiError, ApiName, ApiResult } from '@shared/api';

interface ScriptRun {
  withSuccessHandler(fn: (v: unknown) => void): ScriptRun;
  withFailureHandler(fn: (e: Error) => void): ScriptRun;
  [fn: string]: unknown;
}
declare global {
  interface Window {
    google?: { script: { run: ScriptRun } };
  }
}

export const isAppsScript = () => !!window.google?.script;

export class ApiCallError extends Error {
  readonly code: ApiError['code'];
  readonly details: unknown;
  constructor(error: ApiError) {
    super(error.message);
    this.code = error.code;
    this.details = error.details;
  }
  get fields(): Record<string, string> {
    return (this.details as { fields?: Record<string, string> } | undefined)?.fields ?? {};
  }
}

// ---- session token (code sign-in). Kept in localStorage when the browser allows it.
const TOKEN_KEY = 'leave.session';
let memToken: string | null = null;
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memToken;
  } catch {
    return memToken;
  }
}
export function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the token lives in memory until the page closes */
  }
}

type Transport = (name: ApiName, input: unknown) => Promise<ApiResult<unknown>>;

const appsScriptTransport: Transport = (name, input) =>
  new Promise((resolve, reject) => {
    const run = window.google!.script.run.withSuccessHandler((v) => resolve(v as ApiResult<unknown>)).withFailureHandler(reject);
    (run[name] as (i: unknown) => void)(input);
  });

let devTransport: Transport | null = null;
async function transport(): Promise<Transport> {
  if (isAppsScript()) return appsScriptTransport;
  if (import.meta.env.DEV) {
    devTransport ??= (await import('./devBridge')).devTransport;
    return devTransport;
  }
  throw new Error('Open this page from the Apps Script web app address.');
}

let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: () => void) => {
  onUnauthenticated = fn;
};

export async function api<K extends ApiName>(name: K, input?: ApiContract[K][0]): Promise<ApiContract[K][1]> {
  const t = await transport();
  const token = getToken();
  const res = await t(name, { ...(input ?? {}), ...(token ? { token } : {}) });
  if (!res.ok) {
    if (res.error.code === 'UNAUTHENTICATED' && name !== 'api_session') onUnauthenticated?.();
    throw new ApiCallError(res.error);
  }
  return res.data as ApiContract[K][1];
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
export const fieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiCallError ? e.fields : {});
export const newKey = () => crypto.randomUUID();
