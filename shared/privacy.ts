/**
 * Privacy notice shown before a person's first filing (RA 10173, Data Privacy Act).
 * DRAFT: the DPO must approve the wording. Set `approved: true` only after written approval;
 * scripts/deploy.mjs refuses to deploy production until then.
 */
export const PRIVACY_NOTICE = {
  version: 'draft-2026-11-25',
  approved: false,
  text: [
    'DHSUD Region X collects the details in this form (your name, office, position, salary, the type, dates and reason of your leave, and the actions of your signatories) to process your application for leave under CSC rules.',
    'Details about illness or other sensitive matters are personal and sensitive information. Only you, your signatories, HR and the system administrator can see them. Emails never include them.',
    'Records are kept in the office Google Workspace account and retained according to the National Archives schedule for personnel records.',
    'You may ask to see or correct your information through HR or the Data Protection Officer.',
  ].join('\n\n'),
};
