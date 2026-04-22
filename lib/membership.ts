import { Account, Certificate } from '@/types';

export type MembershipStage =
  | 'application'
  | 'payment'
  | 'review'
  | 'certificate'
  | 'active';

// Updated for new consolidated account schema
export function getMembershipStage(
  account: Account | null,
  certificate: Certificate | null
): MembershipStage {
  if (!account) return 'application';
  // If account exists but firm details not submitted yet
  if (!account.firm_name) return 'application';
  // If firm submitted but payment not done
  if (account.payment_status !== 'paid') return 'payment';
  // If account has firm but not approved yet
  if (account.approval_status !== 'approved') return 'review';
  // If account and firm approved but certificate not issued
  if (!certificate) return 'certificate';
  return 'active';
}

export function getMembershipStageMeta(stage: MembershipStage) {
  const stages = {
    application: {
      title: 'Start your membership application',
      message: 'Create your member profile and submit your firm details to begin the approval process.',
    },
    payment: {
      title: 'Complete your registration payment',
      message: 'Your application is saved. Pay the registration fee to move your profile into review.',
    },
    review: {
      title: 'Application under review',
      message: 'Your payment is received. Our team is now reviewing your firm details before issuing a certificate.',
    },
    certificate: {
      title: 'Certificate ready soon',
      message: 'Your firm is approved. The final certificate record is being prepared for download.',
    },
    active: {
      title: 'Membership is active',
      message: 'Your membership is live and your certificate is available whenever you need it.',
    },
  } as const;

  return stages[stage];
}
