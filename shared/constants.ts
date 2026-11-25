export const APP_NAME = 'Online Application for Leave';
export const TIMEZONE = 'Asia/Manila';
/** The Philippines has no daylight saving time, so Manila is always UTC+8. */
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION',
  'CONFLICT',
  'NOT_FOUND',
  'STALE_VERSION',
  'BUSY',
  'RATE_LIMITED',
  'NOT_INITIALIZED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Roles HR assigns. Every registered employee can also file their own leave. */
export const ROLES = ['DIVISION_CHIEF', 'SUPERVISING_AO', 'REGIONAL_DIRECTOR', 'HR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  DIVISION_CHIEF: 'Division Chief',
  SUPERVISING_AO: 'Supervising Administrative Officer',
  REGIONAL_DIRECTOR: 'Regional Director',
  HR: 'HR',
  ADMIN: 'System administrator',
};

/** The three signatories on every application. Which section each signs is a setting (see SignatoryFlow). */
export const SIGNATORIES = ['DIVISION_CHIEF', 'SUPERVISING_AO', 'REGIONAL_DIRECTOR'] as const;
export type Signatory = (typeof SIGNATORIES)[number];

/** CSC Form No. 6 section 7 parts. 7C covers both 7.C (approved for) and 7.D (disapproved due to). */
export const SECTIONS = ['7A', '7B', '7C'] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABELS: Record<Section, string> = {
  '7A': '7.A Certification of leave credits',
  '7B': '7.B Recommendation',
  '7C': '7.C/7.D Approval or disapproval',
};

export const EMPLOYMENT_TYPES = ['REGULAR', 'COS'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const APPLICATION_STATUSES = ['PENDING', 'FOR_FILING', 'APPROVED', 'DISAPPROVED', 'CANCELLED'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: 'For signature',
  FOR_FILING: 'Signed, for HR filing',
  APPROVED: 'Approved',
  DISAPPROVED: 'Disapproved',
  CANCELLED: 'Cancelled',
};

export const SIGN_METHODS = ['PAPER', 'ESIGN'] as const;
export type SignMethod = (typeof SIGN_METHODS)[number];

export const LEAVE_CREDITS_MODES = ['LEAVE_CARD', 'TRACKED'] as const;
export type LeaveCreditsMode = (typeof LEAVE_CREDITS_MODES)[number];

/** Default domain treated as govmail (DHSUD Google Workspace). */
export const GOVMAIL_DOMAIN = 'dhsud.gov.ph';

/** Apps Script CacheService keeps an entry 6 hours at most. */
export const SESSION_HOURS = 6;
export const CODE_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_MAX_SENDS_PER_HOUR = 5;
