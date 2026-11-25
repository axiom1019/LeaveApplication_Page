/** CSC Form No. 6 (Revised 2020), section 6.A, in the order printed on the form. */
export const LEAVE_TYPES = [
  { code: 'VL', label: 'Vacation Leave', basis: 'Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'LOCATION' },
  { code: 'FL', label: 'Mandatory/Forced Leave', basis: 'Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'NONE' },
  { code: 'SL', label: 'Sick Leave', basis: 'Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'SICK' },
  { code: 'ML', label: 'Maternity Leave', basis: 'R.A. No. 11210 / IRR issued by CSC, DOLE and SSS', details: 'NONE' },
  { code: 'PL', label: 'Paternity Leave', basis: 'R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended', details: 'NONE' },
  { code: 'SPL', label: 'Special Privilege Leave', basis: 'Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'LOCATION' },
  { code: 'SOLO', label: 'Solo Parent Leave', basis: 'RA No. 8972 / CSC MC No. 8, s. 2004', details: 'NONE' },
  { code: 'STUDY', label: 'Study Leave', basis: 'Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'STUDY' },
  { code: 'VAWC', label: '10-Day VAWC Leave', basis: 'RA No. 9262 / CSC MC No. 15, s. 2005', details: 'NONE' },
  { code: 'REHAB', label: 'Rehabilitation Privilege', basis: 'Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292', details: 'NONE' },
  { code: 'SLBW', label: 'Special Leave Benefits for Women', basis: 'RA No. 9710 / CSC MC No. 25, s. 2010', details: 'ILLNESS' },
  { code: 'SEL', label: 'Special Emergency (Calamity) Leave', basis: 'CSC MC No. 2, s. 2012, as amended', details: 'NONE' },
  { code: 'ADOPT', label: 'Adoption Leave', basis: 'R.A. No. 8552', details: 'NONE' },
  { code: 'OTHERS', label: 'Others', basis: '', details: 'OTHER' },
] as const;

export type LeaveTypeCode = (typeof LEAVE_TYPES)[number]['code'];
export type DetailsKind = (typeof LEAVE_TYPES)[number]['details'];
export const LEAVE_TYPE_CODES = LEAVE_TYPES.map((t) => t.code) as [LeaveTypeCode, ...LeaveTypeCode[]];

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
