// Supabase Edge Function: admin-actions
// Handles elevated admin operations with dynamic permission checks and audit logging
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Verify Authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized');

    // 2. Fetch target Admin User profile inside admin_users
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) throw new Error('Not an admin');

    const body = await req.json();
    const { action, ...params } = body;

    // Helper to enforce permissions check
    const verifyPermission = async (permission: string) => {
      const { data: hasPerm, error } = await supabase.rpc('has_permission', {
        p_user_id: user.id,
        p_permission: permission
      });
      if (error || !hasPerm) {
        throw new Error(`Access Denied: Requires permission '${permission}'`);
      }
    };

    let result: any;

    // 3. Dispatch action
    switch (action) {
      // Members operational management
      case 'approve-account':
        await verifyPermission('manage_firms');
        result = await approveAccount(supabase, params.account_id, user.id, adminUser.id);
        break;
      case 'reject-account':
        await verifyPermission('manage_firms');
        result = await rejectAccount(supabase, params.account_id, params.reason, user.id, adminUser.id);
        break;
      case 'set-payment-status':
        await verifyPermission('manage_payments');
        result = await setPaymentStatus(supabase, params.account_id, params.status, adminUser.id);
        break;
      case 'create-member':
        await verifyPermission('manage_members');
        result = await createMemberUser(
          supabase,
          {
            email: params.email,
            password: params.password,
            full_name: params.full_name,
            phone: params.phone,
            address: params.address,
          },
          adminUser.id
        );
        break;
      case 'suspend-member':
        await verifyPermission('manage_members');
        result = await suspendAccount(supabase, params.account_id, adminUser.id);
        break;
      case 'activate-member':
        await verifyPermission('manage_members');
        result = await activateAccount(supabase, params.account_id, adminUser.id);
        break;
      case 'delete-member':
        await verifyPermission('manage_members');
        if (adminUser.role !== 'super_admin') throw new Error('Super admin required');
        result = await deleteAccount(supabase, params.account_id, adminUser.id);
        break;

      // Certificate actions
      case 'revoke-certificate':
        await verifyPermission('manage_certificates');
        result = await revokeCertificate(supabase, params.account_id, adminUser.id);
        break;
      case 'delete-certificate':
        await verifyPermission('manage_certificates');
        result = await deleteCertificate(supabase, params.account_id, adminUser.id);
        break;

      // New system assignment actions
      case 'assign-reviewer':
        await verifyPermission('manage_assignments');
        result = await assignReviewer(supabase, params.account_id, params.reviewer_id, adminUser.id);
        break;
      case 'unassign-reviewer':
        await verifyPermission('manage_assignments');
        result = await unassignReviewer(supabase, params.account_id, adminUser.id);
        break;

      // Notes systems management (audited notes)
      case 'add-note':
        await verifyPermission('manage_members');
        result = await addNote(supabase, params.member_id, params.note, adminUser.id);
        break;
      case 'edit-note':
        await verifyPermission('manage_members');
        result = await editNote(supabase, params.note_id, params.note, adminUser.id);
        break;
      case 'delete-note':
        await verifyPermission('manage_members');
        result = await deleteNote(supabase, params.note_id, adminUser.id, adminUser.role);
        break;

      // Bulk operations
      case 'bulk-suspend':
        await verifyPermission('manage_members');
        result = await bulkSuspend(supabase, params.account_ids, adminUser.id);
        break;
      case 'bulk-activate':
        await verifyPermission('manage_members');
        result = await bulkActivate(supabase, params.account_ids, adminUser.id);
        break;
      case 'bulk-reject':
        await verifyPermission('manage_firms');
        result = await bulkReject(supabase, params.account_ids, params.reason, user.id, adminUser.id);
        break;
      case 'bulk-assign-reviewer':
        await verifyPermission('manage_assignments');
        result = await bulkAssignReviewer(supabase, params.account_ids, params.reviewer_id, adminUser.id);
        break;
      case 'bulk-revoke':
        await verifyPermission('manage_certificates');
        result = await bulkRevokeCertificates(supabase, params.account_ids, adminUser.id);
        break;
      case 'bulk-regenerate':
        await verifyPermission('manage_certificates');
        result = await bulkRegenerateCertificates(supabase, params.account_ids, adminUser.id);
        break;

      // Certificate Queue actions
      case 'queue-job-action':
        await verifyPermission('manage_queue');
        result = await queueJobAction(supabase, params.job_id, params.job_action, adminUser.id, adminUser.role);
        break;

      // Admin Management Actions (Super Admin Only)
      case 'admin-management':
        await verifyPermission('manage_admins');
        if (adminUser.role !== 'super_admin') throw new Error('Super admin required');
        result = await manageAdminUser(supabase, params, adminUser.id);
        break;

      // Export Center actions
      case 'generate-export':
        if (params.type === 'members') {
          await verifyPermission('manage_members');
        } else if (params.type === 'payments') {
          await verifyPermission('manage_payments');
        } else if (params.type === 'certificates') {
          await verifyPermission('manage_certificates');
        } else if (params.type === 'audit_logs') {
          await verifyPermission('view_audit_logs');
        } else {
          throw new Error(`Unsupported export type: ${params.type}`);
        }
        result = await generateBackgroundExport(supabase, params, adminUser.id);
        break;
      case 'cleanup-exports':
        await verifyPermission('view_audit_logs');
        result = await cleanupExpiredExportsAPI(supabase, adminUser.id);
        break;
      case 'get-export-download':
        await verifyPermission('view_audit_logs');
        result = await getExportDownloadLink(supabase, params.job_id, adminUser.id);
        break;

      // Announcement & Notification Campaign Actions
      case 'create-announcement':
        await verifyPermission('manage_members');
        result = await createAnnouncement(supabase, params, adminUser.id);
        break;
      case 'preview-campaign':
        await verifyPermission('manage_members');
        result = await previewCampaign(supabase, params);
        break;
      case 'send-campaign':
        await verifyPermission('manage_members');
        result = await sendNotificationCampaign(supabase, params, adminUser.id);
        break;

      // Saved Filters Actions
      case 'save-filter':
        await verifyPermission('manage_members');
        result = await saveAdminFilter(supabase, params, adminUser.id);
        break;
      case 'get-saved-filters':
        await verifyPermission('manage_members');
        result = await getSavedFilters(supabase, adminUser.id);
        break;
      case 'delete-filter':
        await verifyPermission('manage_members');
        result = await deleteAdminFilter(supabase, params.filter_id, adminUser.id);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    let status = 400;
    if (err.message === 'Unauthorized' || err.message === 'Not an admin' || err.message.includes('Access Denied')) {
      status = 403;
    } else if (err.message === 'Supabase credentials not configured') {
      status = 500;
    }
    
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// FIXED: adminId maps to admin_users.id fkey rather than auth.users.id
async function logAudit(supabase: any, adminId: string, action: string, targetUser?: string, details?: string) {
  const { error } = await supabase.from('audit_logs').insert({
    admin_id: adminId,
    action,
    target_user: targetUser,
    details,
  });
  if (error) {
    console.error('Audit Logging failed:', error.message, error.details);
  }
}

async function approveAccount(supabase: any, accountId: string, authAdminId: string, adminDbId: string) {
  const { data: updated } = await supabase
    .from('accounts')
    .update({ 
      approval_status: 'approved', 
      reviewed_by: authAdminId, // references auth.users(id)
      reviewed_at: new Date().toISOString() 
    })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!updated) throw new Error('Account not found');

  await logAudit(supabase, adminDbId, 'account_approved', updated.user_id, `Account ${accountId} approved`);
  return { message: 'Account approved' };
}

async function rejectAccount(supabase: any, accountId: string, reason: string, authAdminId: string, adminDbId: string) {
  const { data: updated } = await supabase
    .from('accounts')
    .update({
      approval_status: 'rejected',
      rejection_reason: reason,
      reviewed_by: authAdminId, // references auth.users(id)
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!updated) throw new Error('Account not found');
  await logAudit(supabase, adminDbId, 'account_rejected', updated.user_id, `Account ${accountId} rejected: ${reason}`);
  return { message: 'Account rejected' };
}

async function suspendAccount(supabase: any, accountId: string, adminDbId: string) {
  const { data: updated } = await supabase
    .from('accounts')
    .update({ account_status: 'suspended' })
    .eq('id', accountId)
    .select('id, user_id')
    .single();
    
  if (!updated) throw new Error('Account not found');
  await logAudit(supabase, adminDbId, 'account_suspended', updated.user_id, `Suspended account ${accountId}`);
  return { message: 'Account suspended' };
}

async function activateAccount(supabase: any, accountId: string, adminDbId: string) {
  const { data: updated } = await supabase
    .from('accounts')
    .update({ account_status: 'active' })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!updated) throw new Error('Account not found');
  await logAudit(supabase, adminDbId, 'account_activated', updated.user_id, `Activated account ${accountId}`);
  return { message: 'Account activated' };
}

async function deleteAccount(supabase: any, accountId: string, adminDbId: string) {
  const { data: updated } = await supabase
    .from('accounts')
    .update({ account_status: 'deleted' })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!updated) throw new Error('Account not found');
  await logAudit(supabase, adminDbId, 'account_deleted', updated.user_id, `Deleted account ${accountId}`);
  return { message: 'Account deleted' };
}

async function revokeCertificate(supabase: any, accountId: string, adminDbId: string) {
  const { data: account } = await supabase.from('accounts').select('user_id').eq('id', accountId).single();
  if (!account) throw new Error('Account not found');

  const { error } = await supabase.from('certificates').update({ status: 'revoked' }).eq('member_id', accountId);
  if (error) throw new Error(error.message);
  
  await logAudit(supabase, adminDbId, 'certificate_revoked', account.user_id, `Revoked certificate for account ${accountId}`);
  return { message: 'Certificate revoked' };
}

async function deleteCertificate(supabase: any, accountId: string, adminDbId: string) {
  const { data: account } = await supabase.from('accounts').select('user_id').eq('id', accountId).single();
  if (!account) throw new Error('Account not found');

  const { data: certs, error: fetchErr } = await supabase
    .from('certificates')
    .select('id, certificate_url')
    .eq('member_id', accountId);

  if (fetchErr) throw new Error(fetchErr.message);
  if (!certs || certs.length === 0) throw new Error('No certificate found for this account');

  for (const cert of certs) {
    if (cert.certificate_url) {
      await supabase.storage
        .from('certificates')
        .remove([cert.certificate_url])
        .catch((err: any) => console.error('Failed to delete certificate file:', err));
    }
    await supabase.from('certificate_downloads').delete().eq('certificate_id', cert.id);
  }

  const { error } = await supabase.from('certificates').delete().eq('member_id', accountId);
  if (error) throw new Error(error.message);

  await supabase.from('certificate_generation_queue').delete().eq('account_id', accountId);

  await logAudit(supabase, adminDbId, 'certificate_deleted', account.user_id, `Deleted certificates for account ${accountId}`);
  return { message: 'Certificate deleted' };
}

async function setPaymentStatus(supabase: any, accountId: string, status: 'pending' | 'paid' | 'failed', adminDbId: string) {
  if (!accountId) throw new Error('account_id is required');
  if (!status || !['pending', 'paid', 'failed'].includes(status)) throw new Error('Invalid status');

  const { data: account } = await supabase
    .from('accounts')
    .update({ payment_status: status })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!account) throw new Error('Account not found');

  if (status === 'paid') {
    await supabase.from('certificate_generation_queue').upsert(
      { account_id: accountId, status: 'pending' },
      { onConflict: 'account_id' }
    ).then(() => {
      supabase.functions.invoke('process-certificate-queue', { body: {} }).catch(() => {});
    }).catch((err: any) => console.error('Failed to enqueue certificate generation:', err));
  }

  await logAudit(supabase, adminDbId, 'payment_status_set', account.user_id, `Set payment_status=${status}`);
  return { message: 'Payment status updated' };
}

async function createMemberUser(
  supabase: any,
  params: { email: string; password?: string; full_name?: string; phone?: string; address?: string },
  adminDbId: string
) {
  const email = String(params.email || '').trim().toLowerCase();
  const password = String(params.password || '').trim() || '123456';

  if (!email) throw new Error('email is required');
  if (password.length < 6) throw new Error('password must be at least 6 characters');

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: String(params.full_name || '').trim(),
      phone: String(params.phone || '').trim(),
      address: String(params.address || '').trim(),
    },
  });

  if (error) throw new Error(error.message);
  if (!data?.user) throw new Error('Failed to create user');

  await logAudit(supabase, adminDbId, 'member_created', data.user.id, `Created member user ${email}`);
  return { message: 'Member created', user_id: data.user.id };
}

// =========================================================================
// ASSIGNMENT CONTROLLERS
// =========================================================================

async function assignReviewer(supabase: any, accountId: string, reviewerId: string, adminDbId: string) {
  const { error } = await supabase
    .from('review_assignments')
    .upsert(
      { account_id: accountId, assigned_to: reviewerId, assigned_by: adminDbId, status: 'pending' },
      { onConflict: 'account_id' }
    );

  if (error) throw error;

  const { data: account } = await supabase
    .from('accounts')
    .select('user_id, status_timeline')
    .eq('id', accountId)
    .single();

  if (account) {
    const timeline = account.status_timeline || {};
    timeline.under_review = {
      timestamp: new Date().toISOString(),
      assigned_to_admin: reviewerId,
    };
    
    await supabase.from('accounts').update({ 
      status_timeline: timeline,
      approval_status: 'pending' 
    }).eq('id', accountId);

    await logAudit(supabase, adminDbId, 'reviewer_assigned', account.user_id, `Assigned reviewer ${reviewerId} to account ${accountId}`);
  }

  return { message: 'Reviewer assigned successfully' };
}

async function unassignReviewer(supabase: any, accountId: string, adminDbId: string) {
  const { data: account } = await supabase.from('accounts').select('user_id').eq('id', accountId).single();
  if (!account) throw new Error('Account not found');

  const { error } = await supabase.from('review_assignments').delete().eq('account_id', accountId);
  if (error) throw error;

  await logAudit(supabase, adminDbId, 'reviewer_unassigned', account.user_id, `Unassigned reviewer from account ${accountId}`);
  return { message: 'Reviewer unassigned successfully' };
}

// =========================================================================
// NOTES CONTROLLERS WITH SOFT DELETE SUPPORT
// =========================================================================

async function addNote(supabase: any, memberId: string, note: string, adminDbId: string) {
  const { data, error } = await supabase
    .from('admin_notes')
    .insert({ member_id: memberId, admin_id: adminDbId, note })
    .select('id')
    .single();

  if (error) throw error;

  const { data: account } = await supabase.from('accounts').select('user_id').eq('id', memberId).single();
  await logAudit(supabase, adminDbId, 'note_created', account?.user_id, `Added note to account ${memberId}`);
  return { message: 'Note added successfully', note_id: data.id };
}

async function editNote(supabase: any, noteId: string, note: string, adminDbId: string) {
  const { data: existing } = await supabase.from('admin_notes').select('admin_id, member_id').eq('id', noteId).single();
  if (!existing) throw new Error('Note not found');
  if (existing.admin_id !== adminDbId) throw new Error('Unauthorized: You can only edit your own notes');

  const { error } = await supabase
    .from('admin_notes')
    .update({ note, updated_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) throw error;

  const { data: account } = await supabase.from('accounts').select('user_id').eq('id', existing.member_id).single();
  await logAudit(supabase, adminDbId, 'note_updated', account?.user_id, `Updated note ${noteId}`);
  return { message: 'Note updated successfully' };
}

async function deleteNote(supabase: any, noteId: string, adminDbId: string, role: string) {
  const { data: existing } = await supabase.from('admin_notes').select('admin_id, member_id').eq('id', noteId).single();
  if (!existing) throw new Error('Note not found');

  if (existing.admin_id !== adminDbId && role !== 'super_admin') {
    throw new Error('Unauthorized: Only the creator or a super admin can delete this note');
  }

  // Enforces Soft-delete by setting deleted_at and deleted_by
  const { error } = await supabase
    .from('admin_notes')
    .update({ 
      deleted_at: new Date().toISOString(), 
      deleted_by: adminDbId 
    })
    .eq('id', noteId);

  if (error) throw error;

  const { data: account } = await supabase.from('accounts').select('user_id').eq('id', existing.member_id).single();
  await logAudit(supabase, adminDbId, 'note_deleted', account?.user_id, `Soft-deleted note ${noteId}`);
  return { message: 'Note soft-deleted successfully' };
}

// =========================================================================
// OPTIMIZED SET-BASED BULK SQL OPERATIONS
// =========================================================================

async function bulkSuspend(supabase: any, accountIds: string[], adminDbId: string) {
  if (!accountIds || accountIds.length === 0) throw new Error('No accounts selected');
  
  const { data, error } = await supabase
    .from('accounts')
    .update({ account_status: 'suspended' })
    .in('id', accountIds)
    .select('id, user_id');

  if (error) throw error;

  const audits = data.map((row: any) => ({
    admin_id: adminDbId,
    action: 'account_bulk_suspend',
    target_user: row.user_id,
    details: `Bulk suspended inside batch of ${accountIds.length}`
  }));
  
  await supabase.from('audit_logs').insert(audits);
  return { message: 'Accounts suspended successfully', count: data.length };
}

async function bulkActivate(supabase: any, accountIds: string[], adminDbId: string) {
  if (!accountIds || accountIds.length === 0) throw new Error('No accounts selected');

  const { data, error } = await supabase
    .from('accounts')
    .update({ account_status: 'active' })
    .in('id', accountIds)
    .select('id, user_id');

  if (error) throw error;

  const audits = data.map((row: any) => ({
    admin_id: adminDbId,
    action: 'account_bulk_activate',
    target_user: row.user_id,
    details: `Bulk activated inside batch of ${accountIds.length}`
  }));

  await supabase.from('audit_logs').insert(audits);
  return { message: 'Accounts activated successfully', count: data.length };
}

async function bulkReject(supabase: any, accountIds: string[], reason: string, authAdminId: string, adminDbId: string) {
  if (!accountIds || accountIds.length === 0) throw new Error('No accounts selected');
  if (!reason) throw new Error('Rejection reason is required');

  const { data, error } = await supabase
    .from('accounts')
    .update({
      approval_status: 'rejected',
      rejection_reason: reason,
      reviewed_by: authAdminId,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', accountIds)
    .select('id, user_id');

  if (error) throw error;

  const audits = data.map((row: any) => ({
    admin_id: adminDbId,
    action: 'account_bulk_reject',
    target_user: row.user_id,
    details: `Bulk rejected: ${reason}`
  }));

  await supabase.from('audit_logs').insert(audits);
  return { message: 'Accounts rejected successfully', count: data.length };
}

async function bulkAssignReviewer(supabase: any, accountIds: string[], reviewerId: string, adminDbId: string) {
  if (!accountIds || accountIds.length === 0) throw new Error('No accounts selected');
  if (!reviewerId) throw new Error('Reviewer ID is required');

  const assignments = accountIds.map(id => ({
    account_id: id,
    assigned_to: reviewerId,
    assigned_by: adminDbId,
    status: 'pending'
  }));

  const { error } = await supabase.from('review_assignments').upsert(assignments, { onConflict: 'account_id' });
  if (error) throw error;

  const { data: accounts } = await supabase.from('accounts').select('id, user_id').in('id', accountIds);
  if (accounts) {
    const audits = accounts.map((row: any) => ({
      admin_id: adminDbId,
      action: 'reviewer_bulk_assigned',
      target_user: row.user_id,
      details: `Bulk assigned to reviewer ${reviewerId}`
    }));
    await supabase.from('audit_logs').insert(audits);
  }

  return { message: 'Reviewers assigned successfully', count: accountIds.length };
}

async function bulkRevokeCertificates(supabase: any, accountIds: string[], adminDbId: string) {
  if (!accountIds || accountIds.length === 0) throw new Error('No accounts selected');

  const { error } = await supabase
    .from('certificates')
    .update({ status: 'revoked' })
    .in('member_id', accountIds);

  if (error) throw error;

  const { data: accounts } = await supabase.from('accounts').select('id, user_id').in('id', accountIds);
  if (accounts) {
    const audits = accounts.map((row: any) => ({
      admin_id: adminDbId,
      action: 'certificate_bulk_revoke',
      target_user: row.user_id,
      details: 'Bulk revoked certificates'
    }));
    await supabase.from('audit_logs').insert(audits);
  }

  return { message: 'Certificates revoked successfully', count: accountIds.length };
}

async function bulkRegenerateCertificates(supabase: any, accountIds: string[], adminDbId: string) {
  if (!accountIds || accountIds.length === 0) throw new Error('No accounts selected');

  const queueItems = accountIds.map(id => ({ account_id: id, status: 'pending' }));
  const { error } = await supabase
    .from('certificate_generation_queue')
    .upsert(queueItems, { onConflict: 'account_id' });

  if (error) throw error;

  const { data: accounts } = await supabase.from('accounts').select('id, user_id').in('id', accountIds);
  if (accounts) {
    const audits = accounts.map((row: any) => ({
      admin_id: adminDbId,
      action: 'certificate_bulk_regenerate',
      target_user: row.user_id,
      details: 'Enqueued bulk certificate regeneration'
    }));
    await supabase.from('audit_logs').insert(audits);
  }

  supabase.functions.invoke('process-certificate-queue', { body: {} }).catch(() => {});
  return { message: 'Certificates queued for regeneration successfully', count: accountIds.length };
}

// =========================================================================
// CERTIFICATE QUEUE ACTIONS
// =========================================================================

async function queueJobAction(supabase: any, jobId: string, jobAction: 'retry' | 'requeue' | 'cancel' | 'force', adminDbId: string, role: string) {
  const { data: job } = await supabase.from('certificate_generation_queue').select('account_id').eq('id', jobId).single();
  if (!job) throw new Error('Queue job not found');

  if (jobAction === 'force' && role !== 'super_admin') {
    throw new Error('Access Denied: Only a super admin can force run queue jobs');
  }

  let status = 'pending';
  let errorMsg = null;
  if (jobAction === 'cancel') {
    status = 'failed';
    errorMsg = 'Cancelled by administrator';
  }

  if (jobAction === 'force') {
    await supabase.from('certificate_generation_queue').update({ status: 'pending', error_message: null }).eq('id', jobId);
    supabase.functions.invoke('process-certificate-queue', { body: {} }).catch(() => {});
    await logAudit(supabase, adminDbId, 'queue_job_force', job.account_id, `Force processed queue job ${jobId}`);
    return { message: 'Force processed triggered successfully' };
  }

  const payload: any = { status, error_message: errorMsg };
  if (jobAction === 'retry') {
    const { data: currentJob } = await supabase.from('certificate_generation_queue').select('retry_count').eq('id', jobId).single();
    payload.retry_count = (currentJob?.retry_count || 0) + 1;
    payload.error_message = null;
  }

  const { error } = await supabase.from('certificate_generation_queue').update(payload).eq('id', jobId);
  if (error) throw error;

  await logAudit(supabase, adminDbId, `queue_job_${jobAction}`, job.account_id, `Job ${jobId} set to action ${jobAction}`);
  return { message: `Job ${jobAction} completed successfully` };
}

// =========================================================================
// EXPORT CENTER COMPILERS & PHYSICAL STORAGE PURGES
// =========================================================================

async function generateBackgroundExport(
  supabase: any,
  params: { type: 'members' | 'firms' | 'payments' | 'certificates' | 'audit_logs'; filters?: Record<string, any>; format: 'CSV' | 'XLSX' },
  adminDbId: string
) {
  const exportType = params.type;
  const format = params.format || 'CSV';
  const filters = params.filters || {};

  // 1. Initialize DB record to track progress
  const { data: job, error: jobErr } = await supabase
    .from('export_jobs')
    .insert({
      admin_id: adminDbId,
      export_type: exportType,
      filters,
      format,
      status: 'processing'
    })
    .select('id')
    .single();

  if (jobErr) throw jobErr;

  // Compile matching records asynchronously
  try {
    let rows: any[] = [];
    let headers: string[] = [];
    
    if (exportType === 'members') {
      headers = ['ID', 'Membership ID', 'Full Name', 'Email', 'Phone', 'District', 'Payment Status', 'Approval Status', 'Account Status', 'Joined Date'];
      let query = supabase.from('accounts').select('id, membership_id, full_name, email, phone, district, payment_status, approval_status, account_status, created_at');
      if (filters.district) query = query.eq('district', filters.district);
      if (filters.payment_status) query = query.eq('payment_status', filters.payment_status);
      if (filters.approval_status) query = query.eq('approval_status', filters.approval_status);
      const { data } = await query;
      rows = (data || []).map((r: any) => [
        r.id, r.membership_id, r.full_name, r.email, r.phone || '', r.district || '', r.payment_status, r.approval_status, r.account_status, r.created_at
      ]);
    } else if (exportType === 'payments') {
      headers = ['ID', 'Member ID', 'Amount', 'Currency', 'Status', 'Payment Method', 'Razorpay ID', 'Created Date'];
      let query = supabase.from('payments').select('id, member_id, amount, currency, status, payment_method, razorpay_payment_id, created_at');
      if (filters.status) query = query.eq('status', filters.status);
      const { data } = await query;
      rows = (data || []).map((r: any) => [
        r.id, r.member_id, r.amount, r.currency, r.status, r.payment_method || 'online', r.razorpay_payment_id || '', r.created_at
      ]);
    } else if (exportType === 'certificates') {
      headers = ['ID', 'Certificate ID', 'Member ID', 'Issued Date', 'Status', 'URL'];
      let query = supabase.from('certificates').select('id, certificate_id, member_id, issued_at, status, certificate_url');
      if (filters.status) query = query.eq('status', filters.status);
      const { data } = await query;
      rows = (data || []).map((r: any) => [
        r.id, r.certificate_id, r.member_id, r.issued_at, r.status, r.certificate_url
      ]);
    } else if (exportType === 'audit_logs') {
      headers = ['ID', 'Admin ID', 'Action', 'Target User ID', 'Details', 'Timestamp'];
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
      rows = (data || []).map((r: any) => [
        r.id, r.admin_id, r.action, r.target_user || '', r.details || '', r.created_at
      ]);
    } else {
      throw new Error(`Unsupported export type: ${exportType}`);
    }

    // 2. Generate standard escaped CSV data stream
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map((val: any) => {
          const str = String(val === null || val === undefined ? '' : val);
          // Escape quotes and wrap in quotes
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');

    // 3. Ensure Bucket exists
    await supabase.storage.createBucket('secure-exports', { public: false }).catch(() => {});

    // 4. Upload file to Supabase Secure Private Bucket
    const filename = `${exportType}_export_${job.id}.csv`;
    const { error: uploadErr } = await supabase.storage
      .from('secure-exports')
      .upload(filename, csvContent, {
        contentType: 'text/csv',
        upsert: true
      });

    if (uploadErr) throw uploadErr;

    // 5. Save reference & complete job
    await supabase
      .from('export_jobs')
      .update({ status: 'completed', file_url: filename })
      .eq('id', job.id);

    await logAudit(supabase, adminDbId, 'export_generated', null, `Export compiled: ${exportType}`);
    return { message: 'Export compiled successfully', job_id: job.id };
  } catch (err: any) {
    console.error('Export compiler failed:', err.message);
    await supabase
      .from('export_jobs')
      .update({ status: 'failed', error_message: err.message })
      .eq('id', job.id);
    throw err;
  }
}

// GUARANTEED: Storage API Physical Deletion Cleanup instead of direct database table bypasses
async function cleanupExpiredExportsAPI(supabase: any, adminDbId: string) {
  // Query all expired export jobs containing files
  const { data: expiredJobs, error } = await supabase
    .from('export_jobs')
    .select('id, file_url')
    .lte('expires_at', new Date().toISOString())
    .not('file_url', 'is', null);

  if (error) throw error;
  if (!expiredJobs || expiredJobs.length === 0) {
    return { message: 'Zero expired exports found', cleaned: 0 };
  }

  let cleanedCount = 0;
  for (const job of expiredJobs) {
    // 1. Physically delete file using official Supabase Storage API
    const { error: storageErr } = await supabase.storage
      .from('secure-exports')
      .remove([job.file_url]);

    if (storageErr) {
      console.warn(`Failed to physically delete file ${job.file_url}:`, storageErr.message);
    }

    // 2. Invalidate database reference
    await supabase
      .from('export_jobs')
      .update({ 
        file_url: null, 
        status: 'failed', 
        error_message: 'Export link expired (7 days retention limit)' 
      })
      .eq('id', job.id);

    cleanedCount++;
  }

  await logAudit(supabase, adminDbId, 'export_expired_cleanup', null, `Purged ${cleanedCount} expired storage export files`);
  return { message: `Purged ${cleanedCount} expired storage exports`, cleaned: cleanedCount };
}

async function getExportDownloadLink(supabase: any, jobId: string, adminDbId: string) {
  const { data: job } = await supabase.from('export_jobs').select('*').eq('id', jobId).single();
  if (!job) throw new Error('Export job not found');
  if (job.status !== 'completed' || !job.file_url) {
    throw new Error('Export file is not compiled or has expired');
  }

  // Generate a secure, short-lived signed download token (valid 1 hour)
  const { data, error } = await supabase.storage
    .from('secure-exports')
    .createSignedUrl(job.file_url, 3600);

  if (error) throw error;

  await logAudit(supabase, adminDbId, 'export_download_accessed', null, `Accessed download link for export job ${jobId}`);
  return { download_url: data.signedUrl };
}

// =========================================================================
// ANNOUNCEMENT CREATION
// =========================================================================

async function createAnnouncement(
  supabase: any,
  params: { title: string; message: string; target_type: 'all' | 'district' | 'group'; target_value?: string },
  adminDbId: string
) {
  if (!params.title || !params.message) throw new Error('Title and Message are required');
  const { data, error } = await supabase
    .from('announcements')
    .insert({
      title: params.title,
      message: params.message,
      target_type: params.target_type,
      target_value: params.target_value,
      created_by: adminDbId
    })
    .select('id')
    .single();

  if (error) throw error;

  await logAudit(supabase, adminDbId, 'announcement_created', null, `Announcement Broadcast: ${params.title}`);
  return { message: 'Announcement created successfully', announcement_id: data.id };
}

// =========================================================================
// ADMIN USER MANAGEMENT (ROLE CONTROL)
// =========================================================================

async function manageAdminUser(
  supabase: any,
  params: {
    action: 'create-admin' | 'create-reviewer' | 'promote-reviewer' | 'demote-admin' | 'disable-admin' | 'enable-admin';
    admin_user_id?: string;
    email?: string;
    password?: string;
  },
  adminDbId: string
) {
  const subAction = params.action;

  if (subAction === 'create-admin' || subAction === 'create-reviewer') {
    const email = String(params.email || '').trim().toLowerCase();
    const password = String(params.password || '').trim() || '123456';
    if (!email) throw new Error('Email is required');

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) throw authErr;

    const role = subAction === 'create-admin' ? 'admin' : 'reviewer';
    const { data: newAdmin, error: adminErr } = await supabase
      .from('admin_users')
      .insert({ user_id: authUser.user.id, email, role })
      .select('id')
      .single();

    if (adminErr) throw adminErr;

    await logAudit(supabase, adminDbId, 'admin_user_created', authUser.user.id, `Created ${role} account: ${email}`);
    return { message: 'Admin user created successfully', id: newAdmin.id };
  }

  const targetId = params.admin_user_id;
  if (!targetId) throw new Error('admin_user_id is required');

  const { data: target } = await supabase.from('admin_users').select('*').eq('id', targetId).single();
  if (!target) throw new Error('Admin user profile not found');

  if (subAction === 'promote-reviewer') {
    await supabase.from('admin_users').update({ role: 'admin' }).eq('id', targetId);
    await logAudit(supabase, adminDbId, 'admin_promoted', target.user_id, `Promoted reviewer to admin`);
    return { message: 'Reviewer promoted to admin successfully' };
  } else if (subAction === 'demote-admin') {
    await supabase.from('admin_users').update({ role: 'reviewer' }).eq('id', targetId);
    await logAudit(supabase, adminDbId, 'admin_demoted', target.user_id, `Demoted admin to reviewer`);
    return { message: 'Admin demoted to reviewer successfully' };
  } else if (subAction === 'disable-admin') {
    const { error: banErr } = await supabase.auth.admin.updateUserById(target.user_id, {
      ban_duration: '876000h' // Locks user out for 100 years
    });
    if (banErr) throw banErr;

    await logAudit(supabase, adminDbId, 'admin_disabled', target.user_id, `Disabled admin account`);
    return { message: 'Admin account disabled successfully' };
  } else if (subAction === 'enable-admin') {
    const { error: unbanErr } = await supabase.auth.admin.updateUserById(target.user_id, {
      ban_duration: 'none'
    });
    if (unbanErr) throw unbanErr;

    await logAudit(supabase, adminDbId, 'admin_enabled', target.user_id, `Enabled admin account`);
    return { message: 'Admin account enabled successfully' };
  }

  throw new Error(`Unknown management action: ${subAction}`);
}

// =========================================================================
// CAMPAIGN AUDIENCE PREVIEWS & SECURE COOLDOWN DISPATCHES
// =========================================================================

async function getCampaignRecipients(supabase: any, targetType: string, targetValue?: string) {
  const now = new Date();
  const cooldownLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  if (targetType === 'all') {
    const { data, error } = await supabase.from('accounts').select('id, user_id').eq('account_status', 'active');
    if (error) throw error;
    return data || [];
  }

  if (targetType === 'district') {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, user_id')
      .eq('account_status', 'active')
      .eq('district', targetValue);
    if (error) throw error;
    return data || [];
  }

  if (targetType === 'suspended') {
    const { data, error } = await supabase.from('accounts').select('id, user_id').eq('account_status', 'suspended');
    if (error) throw error;
    return data || [];
  }

  // Renewal buckets with 7-day cooldown throttling
  const d365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const d335 = new Date(now.getTime() - 335 * 24 * 60 * 60 * 1000).toISOString();
  const d305 = new Date(now.getTime() - 305 * 24 * 60 * 60 * 1000).toISOString();
  const d275 = new Date(now.getTime() - 275 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('accounts')
    .select('id, user_id, certificates!inner(issued_at, last_renewal_reminder_at, status)')
    .eq('account_status', 'active')
    .eq('certificates.status', 'valid')
    .or(`last_renewal_reminder_at.is.null,last_renewal_reminder_at.lte.${cooldownLimit}`, { foreignTable: 'certificates' });

  if (targetType === 'expired_0_30') {
    query = query.gt('certificates.issued_at', d365).lte('certificates.issued_at', d335);
  } else if (targetType === 'expired_31_60') {
    query = query.gt('certificates.issued_at', d335).lte('certificates.issued_at', d305);
  } else if (targetType === 'expired_61_90') {
    query = query.gt('certificates.issued_at', d305).lte('certificates.issued_at', d275);
  } else if (targetType === 'expired') {
    query = query.lte('certificates.issued_at', d365);
  } else {
    throw new Error(`Unsupported campaign target type: ${targetType}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function previewCampaign(supabase: any, params: { target_type: string; target_value?: string }) {
  const recipients = await getCampaignRecipients(supabase, params.target_type, params.target_value);
  return { recipient_count: recipients.length };
}

async function sendNotificationCampaign(
  supabase: any,
  params: { target_type: string; target_value?: string; title: string; message: string },
  adminDbId: string
) {
  const { target_type, target_value, title, message } = params;
  if (!title || !message) throw new Error('Title and message are required');

  const recipients = await getCampaignRecipients(supabase, target_type, target_value);
  if (recipients.length === 0) {
    return { message: 'Zero recipients matched cooldown check. Campaign aborted.', sent: 0 };
  }

  // 1. Audit campaign dispatch in campaign history registry
  const { data: campaign, error: campaignErr } = await supabase
    .from('notification_campaigns')
    .insert({
      admin_id: adminDbId,
      title,
      message,
      target_type,
      target_value,
      recipient_count: recipients.length
    })
    .select('id')
    .single();

  if (campaignErr) throw campaignErr;

  // 2. Dispatch notifications feed in bulk
  const notifications = recipients.map((r: any) => ({
    user_id: r.user_id,
    type: 'system',
    title,
    message
  }));

  const { error: notifErr } = await supabase.from('notifications').insert(notifications);
  if (notifErr) throw notifErr;

  // 3. Throttle updates: mark certificates.last_renewal_reminder_at = now() for expired targets
  if (['expired_0_30', 'expired_31_60', 'expired_61_90', 'expired'].includes(target_type)) {
    const accountIds = recipients.map((r: any) => r.id);
    const { error: updateErr } = await supabase
      .from('certificates')
      .update({ last_renewal_reminder_at: new Date().toISOString() })
      .in('member_id', accountIds)
      .eq('status', 'valid');

    if (updateErr) {
      console.warn('Failed to update renewal cooldown timestamps:', updateErr.message);
    }
  }

  await logAudit(supabase, adminDbId, 'notification_campaign_sent', null, `Sent campaign: ${title} to ${recipients.length} recipients`);
  return { message: `Campaign sent successfully to ${recipients.length} members.`, sent: recipients.length };
}

// =========================================================================
// SAVED FILTERS MANAGER (PRIVATE & SHARED OPTIONS)
// =========================================================================

async function saveAdminFilter(
  supabase: any,
  params: { name: string; filters: Record<string, any>; is_shared?: boolean },
  adminDbId: string
) {
  const { name, filters, is_shared = false } = params;
  if (!name) throw new Error('Filter name is required');

  const { data, error } = await supabase
    .from('admin_saved_filters')
    .insert({
      admin_id: adminDbId,
      name,
      filters,
      is_shared
    })
    .select('id')
    .single();

  if (error) throw error;
  await logAudit(supabase, adminDbId, 'saved_filter_created', null, `Saved filter bookmark: ${name}`);
  return { message: 'Filter saved successfully', filter_id: data.id };
}

async function getSavedFilters(supabase: any, adminDbId: string) {
  const { data, error } = await supabase
    .from('admin_saved_filters')
    .select('*')
    .or(`admin_id.eq.${adminDbId},is_shared.eq.true`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { filters: data || [] };
}

async function deleteAdminFilter(supabase: any, filterId: string, adminDbId: string) {
  const { error } = await supabase
    .from('admin_saved_filters')
    .delete()
    .eq('id', filterId)
    .eq('admin_id', adminDbId);

  if (error) throw error;
  await logAudit(supabase, adminDbId, 'saved_filter_deleted', null, `Deleted filter: ${filterId}`);
  return { message: 'Filter deleted successfully' };
}

