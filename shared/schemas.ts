import { z } from 'zod';
import { EMPLOYMENT_TYPES, LEAVE_CREDITS_MODES, ROLES, SECTIONS, SIGNATORIES, SIGN_METHODS } from './constants';
import { isValidIsoDate } from './dates';
import { LEAVE_TYPE_CODES } from './leaveTypes';

const text = (max: number) => z.string().trim().max(max);
const isoDate = z.string().refine(isValidIsoDate, 'Use a valid date');
const id = z.string().trim().min(1).max(64);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address');

export const sessionInput = z.object({ token: z.string().max(200).optional() });
export const requestCodeInput = z.object({ email });
export const verifyCodeInput = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

export const leaveDetails = z.object({
  location: z.enum(['PH', 'ABROAD']).optional(),
  locationText: text(200).optional(),
  sick: z.enum(['HOSPITAL', 'OUTPATIENT']).optional(),
  illness: text(200).optional(),
  study: z.enum(['MASTERS', 'BAR']).optional(),
  otherPurpose: z.enum(['MONETIZATION', 'TERMINAL']).optional(),
});
export type LeaveDetails = z.infer<typeof leaveDetails>;

export const leaveForm = z
  .object({
    leaveType: z.enum(LEAVE_TYPE_CODES),
    leaveTypeOther: text(120).optional(),
    details: leaveDetails,
    dates: z.array(isoDate).min(1, 'Pick at least one date').max(366),
    commutation: z.enum(['REQUESTED', 'NOT_REQUESTED']),
  })
  .superRefine((v, ctx) => {
    if (v.leaveType === 'OTHERS' && !v.leaveTypeOther && !v.details.otherPurpose) {
      ctx.addIssue({ code: 'custom', path: ['leaveTypeOther'], message: 'Specify the leave, or choose monetization or terminal leave' });
    }
    if (v.leaveType === 'SL' && !v.details.sick) ctx.addIssue({ code: 'custom', path: ['details', 'sick'], message: 'Choose in hospital or out patient' });
    if ((v.leaveType === 'VL' || v.leaveType === 'SPL') && !v.details.location) {
      ctx.addIssue({ code: 'custom', path: ['details', 'location'], message: 'Choose within the Philippines or abroad' });
    }
    if (v.leaveType === 'VL' || v.leaveType === 'SPL') {
      if (v.details.location === 'ABROAD' && !v.details.locationText) {
        ctx.addIssue({ code: 'custom', path: ['details', 'locationText'], message: 'Specify the country' });
      }
    }
    if (v.leaveType === 'STUDY' && !v.details.study) ctx.addIssue({ code: 'custom', path: ['details', 'study'], message: 'Choose the purpose of the study leave' });
  });
export type LeaveForm = z.infer<typeof leaveForm>;

export const fileLeaveInput = z.object({ idempotencyKey: z.string().uuid(), form: leaveForm });
export const applicationRef = z.object({ applicationId: id });
export const cancelInput = z.object({ applicationId: id, reason: text(300).optional() });

export const creditsCert = z.object({
  asOf: z.union([isoDate, z.literal('')]).optional(),
  vlEarned: text(20).optional(),
  vlLess: text(20).optional(),
  vlBalance: text(20).optional(),
  slEarned: text(20).optional(),
  slLess: text(20).optional(),
  slBalance: text(20).optional(),
});

export const signInput = z.object({
  applicationId: id,
  method: z.enum(SIGN_METHODS),
  /** Version of the application the signer reviewed; refused if it changed since. */
  version: z.number().int().nonnegative(),
  decision: z.enum(['CERTIFIED', 'FOR_APPROVAL', 'FOR_DISAPPROVAL', 'APPROVED', 'DISAPPROVED']),
  reason: text(300).optional(),
  credits: creditsCert.optional(),
  daysWithPay: text(20).optional(),
  daysWithoutPay: text(20).optional(),
  othersSpecify: text(120).optional(),
});
export type SignInput = z.infer<typeof signInput>;

/** HR records a hand signature that is already on the paper form, for a signatory. */
export const recordPaperInput = signInput.omit({ method: true }).extend({
  /** Who signed the paper form. Defaults to the one person assigned to the step. */
  signerEmployeeId: z.string().max(64).optional(),
});

export const fileApplicationInput = z.object({ applicationId: id, remarks: text(300).optional() });
export const listApplicationsInput = z.object({
  status: z.string().max(20).optional(),
  query: text(80).optional(),
  year: z.number().int().min(2020).max(2100).optional(),
});

export const saveEmployeeInput = z.object({
  employeeId: z.string().max(64).optional(),
  version: z.number().int().nonnegative().optional(),
  email,
  lastName: text(80).min(1, 'Required'),
  firstName: text(80).min(1, 'Required'),
  middleName: text(80).optional(),
  divisionId: id,
  position: text(120).min(1, 'Required'),
  salary: text(30).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  roles: z.array(z.enum(ROLES)).max(ROLES.length),
  isActive: z.boolean(),
});
export type SaveEmployeeInput = z.infer<typeof saveEmployeeInput>;

/** What staff may change on their own record. Email, division, employment type and roles stay with HR. */
export const saveMyProfileInput = z.object({
  version: z.number().int().nonnegative(),
  lastName: text(80).min(1, 'Required'),
  firstName: text(80).min(1, 'Required'),
  middleName: text(80).optional(),
  position: text(120).min(1, 'Required'),
  salary: text(30).optional(),
});
export type SaveMyProfileInput = z.infer<typeof saveMyProfileInput>;

export const saveDivisionInput = z.object({
  divisionId: z.string().max(64).optional(),
  name: text(120).min(1, 'Required'),
  code: text(20).min(1, 'Required'),
  chiefEmployeeId: z.string().max(64).optional(),
  noChief: z.boolean().optional(),
  isActive: z.boolean(),
});

export const saveHolidayInput = z.object({ date: isoDate, name: text(120).min(1, 'Required') });
export const deleteHolidayInput = z.object({ date: isoDate });

export const saveOicInput = z
  .object({ employeeId: id, startDate: isoDate, endDate: isoDate, remarks: text(200).optional() })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'End date is before the start date' });
export const deleteOicInput = z.object({ assignmentId: id });

export const signatoryFlow = z
  .array(z.object({ signatory: z.enum(SIGNATORIES), section: z.enum(SECTIONS) }))
  .length(3)
  .refine((f) => new Set(f.map((s) => s.signatory)).size === 3, 'Each signatory appears once')
  .refine((f) => new Set(f.map((s) => s.section)).size === 3, 'Each section is signed once');
export type SignatoryFlow = z.infer<typeof signatoryFlow>;

export const settingsInput = z.object({
  agencyName: text(150).min(1),
  agencyAddress: text(200),
  signatoryFlow,
  leaveCreditsMode: z.enum(LEAVE_CREDITS_MODES),
  pilotDivisionIds: z.array(id).max(50),
  esignEnabled: z.boolean(),
  hrNotifyEmail: z.union([email, z.literal('')]),
  profileSelfEdit: z.boolean(),
});
export type SettingsInput = z.infer<typeof settingsInput>;

export const saveCreditsInput = z.object({
  employeeId: id,
  asOf: isoDate,
  vlBalance: z.number().min(0).max(10_000),
  slBalance: z.number().min(0).max(10_000),
});

export const uploadSignatureInput = z.object({
  /** PNG data, base64 without the data: prefix. About 300 KB at most after the browser resizes it. */
  pngBase64: z.string().min(100).max(400_000).regex(/^[A-Za-z0-9+/=]+$/),
});

export const auditInput = z.object({ entityId: z.string().max(64).optional(), limit: z.number().int().min(1).max(500).optional() });
