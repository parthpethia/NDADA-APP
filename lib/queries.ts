/**
 * Centralized Data Fetching Layer
 *
 * All data queries for the NDADA app should go through this layer.
 * This provides:
 * - Consistency in error handling
 * - Single point for RLS policy checks
 * - Type safety
 * - Easy to add caching in the future
 */

import { supabase } from './supabase';
import { Account, Certificate, Payment, AdminUser, StatusTimeline, Notification, CertificateQueueJob } from '@/types';
import { PostgrestError } from '@supabase/supabase-js';

/**
 * Helper to create a PostgrestError from a caught exception.
 * Ensures the `name` property is always set (required by the type).
 */
function toPostgrestError(err: any, fallbackMessage: string): PostgrestError {
  return {
    name: 'PostgrestError',
    message: err?.message || fallbackMessage,
    details: err?.details || '',
    hint: err?.hint || '',
    code: err?.code || 'UNKNOWN',
  };
}

export interface AccountWithDetails extends Account {
  payments: Payment[];
  certificates: Certificate[];
}

/**
 * Fetch complete account with all related data
 * Single query that returns account + payments + certificates + fraud flags
 */
export async function fetchAccountWithDetails(
  userId: string
): Promise<{ data: AccountWithDetails | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select(
        `
        *,
        payments(id, amount, currency, status, razorpay_payment_link_url, razorpay_payment_link_id, created_at),
        certificates(id, certificate_id, certificate_url, issued_at, status)
      `
      )
      .eq('user_id', userId)
      .single();

    if (error) {
      console.warn('fetchAccountWithDetails error:', error.message);
      return { data: null, error };
    }

    return { data: data as AccountWithDetails, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching account') };
  }
}

/**
 * Fetch account basic info only (lighter weight)
 */
export async function fetchAccountBasic(
  userId: string
): Promise<{ data: Account | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, user_id, full_name, email, phone, address, district, membership_id, payment_status, approval_status')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.warn('fetchAccountBasic error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching account') };
  }
}

/**
 * Fetch all payments for an account
 */
export async function fetchAccountPayments(
  accountId: string
): Promise<{ data: Payment[] | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('id, member_id, amount, status, payment_method, razorpay_order_id, razorpay_payment_id, created_at')
      .eq('member_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('fetchAccountPayments error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching payments') };
  }
}

/**
 * Fetch certificate for an account
 */
export async function fetchAccountCertificate(
  accountId: string
): Promise<{ data: Certificate | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('certificates')
      .select('id, member_id, certificate_id, certificate_url, status, issued_at')
      .eq('member_id', accountId)
      .single();

    // Not an error if no certificate exists yet
    if (error?.code === 'PGRST116') {
      return { data: null, error: null };
    }

    if (error) {
      console.warn('fetchAccountCertificate error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching certificate') };
  }
}

/**
 * Fetch admin user info
 */
export async function fetchAdminUser(
  userId: string
): Promise<{ data: AdminUser | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('id, user_id, email, role, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('fetchAdminUser error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching admin user') };
  }
}

/**
 * Unified user profile fetch — single RPC replacing fetchMember + fetchAdminUser.
 * Returns lightweight account fields + admin status in one database round-trip.
 */
export interface UserProfileResponse {
  account: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    phone: string;
    address: string;
    district: string | null;
    firm_name: string;
    license_number: string;
    membership_id: string;
    payment_status: string;
    payment_method?: string;
    cash_payment_verified?: boolean;
    approval_status: string;
    account_status: string;
    created_at: string;
    updated_at: string;
  } | null;
  admin: AdminUser | null;
}

export async function fetchUserProfile(
  userId: string
): Promise<{ data: UserProfileResponse | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase.rpc('get_user_profile', {
      p_user_id: userId,
    });

    if (error) {
      console.warn('fetchUserProfile RPC error:', error.message);
      return { data: null, error };
    }

    return { data: data as UserProfileResponse, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching user profile') };
  }
}

/**
 * Aggregate dashboard data — single RPC replacing 3-4 separate queries.
 * Returns account profile fields, certificate, and unread notification count.
 */
export interface DashboardDataResponse {
  account: {
    id: string;
    user_id: string;
    full_name: string;
    email: string;
    phone: string;
    address: string;
    district: string | null;
    firm_name: string;
    license_number: string;
    membership_id: string;
    payment_status: string;
    payment_method?: string;
    cash_payment_verified?: boolean;
    approval_status: string;
    account_status: string;
    status_timeline?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  } | null;
  certificate: Certificate | null;
  unread_notification_count: number;
}

export async function fetchDashboardData(
  userId: string
): Promise<{ data: DashboardDataResponse | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase.rpc('get_dashboard_data', {
      p_user_id: userId,
    });

    if (error) {
      console.warn('fetchDashboardData RPC error:', error.message);
      return { data: null, error };
    }

    return { data: data as DashboardDataResponse, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching dashboard data') };
  }
}

/**
 * Fetch multiple accounts (for admin dashboard)
 */
export async function fetchAccountsList(
  filter?: {
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    paymentStatus?: 'pending' | 'paid' | 'failed';
    limit?: number;
  }
): Promise<{ data: Account[] | null; error: PostgrestError | null }> {
  try {
    let query = supabase.from('accounts').select('id, user_id, full_name, email, phone, district, firm_name, license_number, registration_number, membership_id, payment_status, approval_status, created_at').order('created_at', { ascending: false });

    if (filter?.approvalStatus) {
      query = query.eq('approval_status', filter.approvalStatus);
    }

    if (filter?.paymentStatus) {
      query = query.eq('payment_status', filter.paymentStatus);
    }

    const { data, error } = await query.limit(filter?.limit || 50);

    if (error) {
      console.warn('fetchAccountsList error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching accounts list') };
  }
}

/**
 * Fetch status timeline for an account
 */
export async function fetchAccountTimeline(
  accountId: string
): Promise<{ data: StatusTimeline | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('status_timeline')
      .eq('id', accountId)
      .single();

    if (error) {
      console.warn('fetchAccountTimeline error:', error.message);
      return { data: null, error };
    }

    return { data: data?.status_timeline || null, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching timeline') };
  }
}

/**
 * Fetch notifications for a user with cursor-based pagination.
 * @param userId    - The user's UUID
 * @param limit     - Number of notifications per page (default 30)
 * @param beforeDate - ISO timestamp cursor; fetch notifications older than this
 */
export async function fetchNotifications(
  userId: string,
  limit: number = 30,
  beforeDate?: string
): Promise<{ data: Notification[] | null; error: PostgrestError | null }> {
  try {
    let query = supabase
      .from('notifications')
      .select('id, user_id, title, message, type, read, action_url, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (beforeDate) {
      query = query.lt('created_at', beforeDate);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('fetchNotifications error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching notifications') };
  }
}

/**
 * Fetch unread notification count for a user.
 * Reads from the denormalized notification_unread_counts table (O(1) PK lookup)
 * instead of running COUNT(*) on the notifications table.
 */
export async function fetchUnreadNotificationCount(
  userId: string
): Promise<{ data: number; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('notification_unread_counts')
      .select('count')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('fetchUnreadNotificationCount error:', error.message);
      return { data: 0, error };
    }

    return { data: data?.count || 0, error: null };
  } catch (err: any) {
    return { data: 0, error: toPostgrestError(err, 'Unknown error fetching notification count') };
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<{ error: PostgrestError | null }> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      console.warn('markNotificationAsRead error:', error.message);
      return { error };
    }

    return { error: null };
  } catch (err: any) {
    return { error: toPostgrestError(err, 'Unknown error updating notification') };
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(
  userId: string
): Promise<{ error: PostgrestError | null }> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.warn('markAllNotificationsAsRead error:', error.message);
      return { error };
    }

    return { error: null };
  } catch (err: any) {
    return { error: toPostgrestError(err, 'Unknown error updating notifications') };
  }
}

/**
 * Fetch certificate generation queue jobs (for admin view)
 */
export async function fetchCertificateQueueJobs(
  status?: 'pending' | 'processing' | 'completed' | 'failed'
): Promise<{ data: CertificateQueueJob[] | null; error: PostgrestError | null }> {
  try {
    let query = supabase
      .from('certificate_generation_queue')
      .select('id, member_id, status, error_message, created_at, updated_at, processed_at')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      console.warn('fetchCertificateQueueJobs error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching certificate queue') };
  }
}

/**
 * Get next pending certificate job (for background processor)
 */
export async function getNextCertificateJob(): Promise<{
  data: (CertificateQueueJob & { firm_name: string; full_name: string; email: string; membership_id: string }) | null;
  error: PostgrestError | null;
}> {
  try {
    const { data, error } = await supabase.rpc('get_next_certificate_job');

    if (error) {
      console.warn('getNextCertificateJob error:', error.message);
      return { data: null, error };
    }

    return { data: data?.[0] || null, error: null };
  } catch (err: any) {
    return { data: null, error: toPostgrestError(err, 'Unknown error fetching next job') };
  }
}

/**
 * Mark certificate job as processing
 */
export async function markCertificateProcessing(jobId: string): Promise<{ error: PostgrestError | null }> {
  try {
    const { error } = await supabase.rpc('mark_certificate_processing', { job_id: jobId });

    if (error) {
      console.warn('markCertificateProcessing error:', error.message);
      return { error };
    }

    return { error: null };
  } catch (err: any) {
    return { error: toPostgrestError(err, 'Unknown error marking job as processing') };
  }
}

/**
 * Mark certificate job as completed
 */
export async function markCertificateCompleted(jobId: string): Promise<{ error: PostgrestError | null }> {
  try {
    const { error } = await supabase.rpc('mark_certificate_completed', { job_id: jobId });

    if (error) {
      console.warn('markCertificateCompleted error:', error.message);
      return { error };
    }

    return { error: null };
  } catch (err: any) {
    return { error: toPostgrestError(err, 'Unknown error marking job as completed') };
  }
}

/**
 * Mark certificate job as failed
 */
export async function markCertificateFailed(jobId: string, errorMessage: string): Promise<{ error: PostgrestError | null }> {
  try {
    const { error } = await supabase.rpc('mark_certificate_failed', {
      job_id: jobId,
      error_msg: errorMessage,
    });

    if (error) {
      console.warn('markCertificateFailed error:', error.message);
      return { error };
    }

    return { error: null };
  } catch (err: any) {
    return { error: toPostgrestError(err, 'Unknown error marking job as failed') };
  }
}
