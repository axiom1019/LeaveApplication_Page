/** CSC Form No. 6 (Revised 2020), section 6.A, in the order printed on the form. */
export const LEAVE_TYPES = [
  { code: 'VL', label: 'Vacation Leave', basis: 'Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'LOCATION', for: 'REGULAR' },
  { code: 'FL', label: 'Mandatory/Forced Leave', basis: 'Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'NONE', for: 'REGULAR' },
  { code: 'SL', label: 'Sick Leave', basis: 'Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'SICK', for: 'REGULAR' },
  { code: 'ML', label: 'Maternity Leave', basis: 'R.A. No. 11210 / IRR issued by CSC, DOLE and SSS', details: 'NONE', for: 'REGULAR' },
  { code: 'PL', label: 'Paternity Leave', basis: 'R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended', details: 'NONE', for: 'REGULAR' },
  { code: 'SPL', label: 'Special Privilege Leave', basis: 'Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'LOCATION', for: 'REGULAR' },
  { code: 'SOLO', label: 'Solo Parent Leave', basis: 'RA No. 8972 / CSC MC No. 8, s. 2004', details: 'NONE', for: 'REGULAR' },
  { code: 'STUDY', label: 'Study Leave', basis: 'Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'STUDY', for: 'REGULAR' },
  { code: 'VAWC', label: '10-Day VAWC Leave', basis: 'RA No. 9262 / CSC MC No. 15, s. 2005', details: 'NONE', for: 'REGULAR' },
  { code: 'REHAB', label: 'Rehabilitation Privilege', basis: 'Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'NONE', for: 'REGULAR' },
  { code: 'SLBW', label: 'Special Leave Benefits for Women', basis: 'RA No. 9710 / CSC MC No. 25, s. 2010', details: 'ILLNESS', for: 'REGULAR' },
  { code: 'SEL', label: 'Special Emergency (Calamity) Leave', basis: 'CSC MC No. 2, s. 2012, as amended', details: 'NONE', for: 'REGULAR' },
  { code: 'ADOPT', label: 'Adoption Leave', basis: 'R.A. No. 8552', details: 'NONE', for: 'REGULAR' },
  { code: 'OTHERS', label: 'Others', basis: '', details: 'OTHER', for: 'REGULAR' },
  // Contract of service workers are not covered by the CSC leave rules. DHSUD Region 10 gives them
  // these two; both print under 6.A "Others" with the name written in.
  { code: 'CTO', label: 'Compensatory Time-Off (CTO)', basis: '', details: 'NONE', for: 'COS' },
  { code: 'WELLNESS', label: 'Wellness Leave', basis: '', details: 'NONE', for: 'COS' },
] as const;

export type LeaveTypeCode = (typeof LEAVE_TYPES)[number]['code'];
export type DetailsKind = (typeof LEAVE_TYPES)[number]['details'];
export const LEAVE_TYPE_CODES = LEAVE_TYPES.map((t) => t.code) as [LeaveTypeCode, ...LeaveTypeCode[]];

export type EligibleFor = (typeof LEAVE_TYPES)[number]['for'];

/** The leave types a person may file: CSC leave for regular staff, CTO and Wellness for COS. */
export function leaveTypesFor(employmentType: string) {
  return LEAVE_TYPES.filter((t) => t.for === (employmentType === 'COS' ? 'COS' : 'REGULAR'));
}

/** Leave printed under 6.A "Others" on CSC Form No. 6, with this text written in. */
export function othersText(code: string, other: string): string | null {
  if (code === 'OTHERS') return other;
  if (code === 'CTO') return 'Compensatory Time-Off (CTO)';
  if (code === 'WELLNESS') return 'Wellness Leave';
  return null;
}

/**
 * Leave credit rules (suggested to Ace 2026-11-25; change here if the office rules differ).
 * Regular staff earn 1.25 days of VL and SL a month. Forced leave (5) is taken from VL. Special
 * privilege leave (3) and COS wellness leave (5) are per calendar year and do not carry over.
 * CTO comes from compensatory overtime credits (COC) in hours; 8 hours make a day, and COCs lapse
 * a year after they were earned, the oldest used first.
 */
export const CREDIT_RULES = {
  monthlyAccrual: 1.25,
  forcedLeaveDays: 5,
  splDays: 3,
  wellnessDays: 5,
  hoursPerDay: 8,
  cocLapseMonths: 12,
} as const;

export function leaveType(code: string) {
  const t = LEAVE_TYPES.find((x) => x.code === code);
  if (!t) throw new Error(`Unknown leave type ${code}`);
  return t;
}

/** 6.B choices. */
export const LOCATION_CHOICES = { PH: 'Within the Philippines', ABROAD: 'Abroad' } as const;
export const SICK_CHOICES = { HOSPITAL: 'In Hospital', OUTPATIENT: 'Out Patient' } as const;
export const STUDY_CHOICES = { MASTERS: "Completion of Master's Degree", BAR: 'BAR/Board Examination Review' } as const;
export const OTHER_PURPOSE_CHOICES = { MONETIZATION: 'Monetization of Leave Credits', TERMINAL: 'Terminal Leave' } as const;

/**
 * Leave types whose details (illness, VAWC) are sensitive personal information under the Data
 * Privacy Act. They never appear in emails, and lists shown to HR show them only when opened.
 */
export const SENSITIVE_TYPES: readonly LeaveTypeCode[] = ['SL', 'SLBW', 'VAWC', 'REHAB', 'ML'];
