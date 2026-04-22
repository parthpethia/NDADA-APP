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
import { Account, Certificate, Payment, FraudFlag, AdminUser, StatusTimeline, Notification, CertificateQueueJob } from '@/types';
import { PostgrestError } from '@supabase/supabase-js';

export interface AccountWithDetails extends Account {
  payments: Payment[];
  certificate: Certificate | null;
  fraud_flags: FraudFlag[];
}

/**
 * Fetch complete account with all related data
 * Single query that returns account + payments + certificate + fraud flags
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
        certificates(id, certificate_url, issued_at, status),
        fraud_flags(id, reason, details, resolved, created_at)
      `
      )
      .eq('user_id', userId)
      .single();

    if (error) {
      console.warn('fetchAccountWithDetails error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching account',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.warn('fetchAccountBasic error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching account',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
      .select('*')
      .eq('member_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('fetchAccountPayments error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching payments',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
      .select('*')
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching certificate',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('fetchAdminUser error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching admin user',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
    let query = supabase.from('accounts').select('*').order('created_at', { ascending: false });

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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching accounts list',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching timeline',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
  }
}

/**
 * Fetch all notifications for a user
 */
export async function fetchNotifications(
  userId: string,
  limit: number = 50
): Promise<{ data: Notification[] | null; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('fetchNotifications error:', error.message);
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err: any) {
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching notifications',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
  }
}

/**
 * Fetch unread notification count for a user
 */
export async function fetchUnreadNotificationCount(
  userId: string
): Promise<{ data: number; error: PostgrestError | null }> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.warn('fetchUnreadNotificationCount error:', error.message);
      return { data: 0, error };
    }

    return { data: count || 0, error: null };
  } catch (err: any) {
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching notification count',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: 0, error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error updating notification',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error updating notifications',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { error };
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
      .select('*')
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching certificate queue',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error fetching next job',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { data: null, error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error marking job as processing',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error marking job as completed',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { error };
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
    const error: PostgrestError = {
      message: err?.message || 'Unknown error marking job as failed',
      details: err?.details || '',
      hint: err?.hint || '',
      code: err?.code || 'UNKNOWN',
    };
    return { error };
  }
}
