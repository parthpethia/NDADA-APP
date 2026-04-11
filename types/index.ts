export type FirmType = 'proprietorship' | 'partnership' | 'private_limited' | 'llp' | 'other';
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type CertificateStatus = 'valid' | 'revoked' | 'suspended';
export type AdminRole = 'super_admin' | 'admin' | 'reviewer';

export interface Member {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  id_proof_url: string | null;
  payment_status: PaymentStatus;
  membership_id: string;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

export interface Firm {
  id: string;
  member_id: string;
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
  approval_status: ApprovalStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
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

export interface MemberWithFirms extends Member {
  firms: Firm[];
}

export interface MemberWithDetails extends MemberWithFirms {
  payments: Payment[];
  certificate: Certificate | null;
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
  suspicious_accounts: number;
}
