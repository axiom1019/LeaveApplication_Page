import type { ApiName } from './api';

/** Every API function. build-backend.mjs reads this list to create the Apps Script entry points. */
export const API_NAMES = [
  'api_session',
  'api_requestCode',
  'api_verifyCode',
  'api_signOut',
  'api_bootstrap',
  'api_myApplications',
  'api_fileLeave',
  'api_getApplication',
  'api_cancelApplication',
  'api_formHtml',
  'api_formPdf',
  'api_inbox',
  'api_sign',
  'api_recordPaperSignature',
  'api_withdrawSignature',
  'api_fileApplication',
  'api_listApplications',
  'api_listEmployees',
  'api_saveEmployee',
  'api_listDivisions',
  'api_saveDivision',
  'api_listHolidays',
  'api_saveHoliday',
  'api_deleteHoliday',
  'api_listOic',
  'api_saveOic',
  'api_deleteOic',
  'api_getSettings',
  'api_saveSettings',
  'api_myCredits',
  'api_listCredits',
  'api_saveCredits',
  'api_listCoc',
  'api_saveCoc',
  'api_deleteCoc',
  'api_uploadSignature',
  'api_mySignature',
  'api_saveMyProfile',
  'api_audit',
] as const satisfies readonly ApiName[];

type Missing = Exclude<ApiName, (typeof API_NAMES)[number]>;
// Compile error here if a name in ApiContract is missing from the list above.
export const _allListed: Missing extends never ? true : Missing = true;
