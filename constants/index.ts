export const APP_NAME = 'NDADA';
export const MEMBERSHIP_AMOUNT = 1500;
export const MEMBERSHIP_CURRENCY = 'INR';
export const MEMBERSHIP_PLAN_NAME = 'Annual Membership';
export const MEMBERSHIP_VALIDITY_LABEL = '12 months';
export const MEMBERSHIP_SUPPORT_EMAIL = 'support@ndada.org';

export const MEMBERSHIP_BENEFITS = [
  'Official digital membership certificate',
  'Verified member ID for your business profile',
  'Application review and firm approval tracking',
  'Fast certificate verification for stakeholders',
] as const;

export const MEMBERSHIP_STEPS = [
  'Create your member account',
  'Submit your firm application',
  'Pay the membership fee securely',
  'Download your approved certificate',
] as const;

export const FIRM_TYPES = [
  { label: 'Proprietorship', value: 'proprietorship' },
  { label: 'Partnership', value: 'partnership' },
  { label: 'Private Limited', value: 'private_limited' },
  { label: 'LLP', value: 'llp' },
  { label: 'Other', value: 'other' },
] as const;

export const STORAGE_BUCKETS = {
  documents: 'documents',
  certificates: 'certificates',
  idProofs: 'id-proofs',
  paymentProofs: 'payment-proofs',
} as const;

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
};

export const CERTIFICATE_STATUS_LABELS: Record<string, string> = {
  valid: 'Valid',
  revoked: 'Revoked',
  suspended: 'Suspended',
};
