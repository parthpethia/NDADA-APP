import { Account, Certificate } from '@/types';

export type MembershipStage =
  | 'application'
  | 'payment'
  | 'certificate'
  | 'active';

// Updated for new consolidated account schema
// Certificate eligibility depends only on payment, not admin approval
export function getMembershipStage(
  account: Account | null,
  certificate: Certificate | null
): MembershipStage {
  if (!account) return 'application';
  // If account exists but firm details not submitted yet
  if (!account.firm_name) return 'application';
  // If firm submitted but payment not done
  if (account.payment_status !== 'paid') return 'payment';
  // If paid but certificate not issued yet
  if (!certificate) return 'certificate';
  return 'active';
}

export function getMembershipStageMeta(stage: MembershipStage) {
  const stages = {
    application: {
      title: 'Start your membership application',
      message: 'Create your member profile and submit your firm details to get started.',
    },
    payment: {
      title: 'Complete your registration payment',
      message: 'Your application is saved. Pay the registration fee to receive your membership certificate.',
    },
    certificate: {
      title: 'Certificate ready soon',
      message: 'Payment received! Your membership certificate is being prepared for download.',
    },
    active: {
      title: 'Membership is active',
      message: 'Your membership is live and your certificate is available whenever you need it.',
    },
  } as const;

  return stages[stage];
}
