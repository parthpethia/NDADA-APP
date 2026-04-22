export type FirmType = 'proprietorship' | 'partnership' | 'private_limited' | 'llp' | 'other';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'processing' | 'abandoned' | 'expired';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type CertificateStatus = 'valid' | 'revoked' | 'suspended';
export type AdminRole = 'super_admin' | 'admin' | 'reviewer';
export type NotificationType = 'payment' | 'approval' | 'certificate' | 'system';

// ============================================================
// STATUS TIMELINE TYPES
// ============================================================
export interface TimelineEvent {
  timestamp: string;
  [key: string]: unknown;
}

export interface StatusTimeline {
  submitted?: TimelineEvent & { by_user: boolean };
  payment_verified?: TimelineEvent & { by_system: boolean };
  under_review?: TimelineEvent & { assigned_to_admin?: string };
  approved?: TimelineEvent & { approved_by: string };
  rejected?: TimelineEvent & { rejected_by: string; reason: string };
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================
export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  action_url?: string | null;
  read: boolean;
  created_at: string;
}

// ============================================================
// CONSOLIDATED ACCOUNT TYPE (One User = One Firm)
// ============================================================
export interface Account {
  id: string;
  user_id: string;

  // Personal/Member Info
  full_name: string;
  email: string;
  phone: string;
  address: string;
  id_proof_url: string | null;

  // Firm Info
  firm_name: string;
  firm_type: FirmType;
  license_number: string;
  registration_number: string;
  gst_number: string | null;
  firm_address: string;
  contact_phone: string;
  contact_email: string;
  firm_pin_code: string | null;
  partner_proprietor_name: string | null;
  whatsapp_number: string | null;
  aadhaar_card_number: string | null;
  ifms_number: string | null;
  seed_cotton_license_number: string | null;
  seed_cotton_license_expiry: string | null;
  sarthi_id_cotton: string | null;
  seed_general_license_number: string | null;
  seed_general_license_expiry: string | null;
  sarthi_id_general: string | null;
  pesticide_license_number: string | null;
  pesticide_license_expiry: string | null;
  fertilizer_license_number: string | null;
  fertilizer_license_expiry: string | null;
  residence_address: string | null;
  residence_pin_code: string | null;
  applicant_photo_url: string | null;
  documents_urls: string[];

  // Status Fields
  membership_id: string;
  payment_status: PaymentStatus;
  approval_status: ApprovalStatus;
  account_status: AccountStatus;
  rejection_reason: string | null;
  status_timeline?: StatusTimeline;

  // Approval Tracking
  reviewed_by: string | null;
  reviewed_at: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}


export interface Payment {
  id: string;
  member_id: string;
  proof_url?: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider?: string | null;
  razorpay_payment_link_id?: string | null;
  razorpay_payment_link_url?: string | null;
  razorpay_payment_id?: string | null;
  provider_event?: string | null;
  provider_payload?: unknown;
  created_at: string;
}

export interface Certificate {
  id: string;
  certificate_id: string;
  member_id: string;
  certificate_url: string;
  issued_at: string;
  status: CertificateStatus;
}

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: AdminRole;
  created_at: string;
}

export interface FraudFlag {
  id: string;
  member_id: string;
  reason: string;
  details: string | null;
  resolved: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  target_user: string | null;
  details: string | null;
  created_at: string;
}

export interface CertificateDownload {
  id: string;
  certificate_id: string;
  member_id: string;
  downloaded_at: string;
  ip_address: string | null;
}

export type CertificateGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CertificateQueueJob {
  id: string;
  account_id: string;
  status: CertificateGenerationStatus;
  error_message: string | null;
  created_at: string;
  processing_started_at: string | null;
  completed_at: string | null;
}

// ============================================================
// COMPOSITE TYPES (for queries with related data)
// ============================================================
export interface AccountWithDetails extends Account {
  payments: Payment[];
  certificates: Certificate[];
  fraud_flags: FraudFlag[];
}


export interface CertificateVerification {
  certificate_id: string;
  member_name: string;
  membership_id: string;
  issued_at: string;
  status: CertificateStatus;
}

export interface DashboardStats {
  total_members: number;
  total_firms: number;
  payments_completed: number;
  certificates_issued: number;
  pending_reviews: number;
  pending_payments?: number;
  approved_count?: number;
  rejected_count?: number;
  suspicious_accounts: number;
}
