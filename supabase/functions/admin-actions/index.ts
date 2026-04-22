// Supabase Edge Function: admin-actions
// Handles elevated admin operations with audit logging
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

  // Load environment variables INSIDE handler
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
    // Verify admin from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error('Unauthorized');

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!adminUser) throw new Error('Not an admin');

    const body = await req.json();
    const { action, ...params } = body;

    let result: any;

    switch (action) {
      case 'approve-account':
        result = await approveAccount(params.account_id, user.id);
        break;
      case 'reject-account':
        result = await rejectAccount(params.account_id, params.reason, user.id);
        break;
      case 'set-payment-status':
        result = await setPaymentStatus(params.account_id, params.status, user.id);
        break;
      case 'create-member':
        result = await createMemberUser(
          {
            email: params.email,
            password: params.password,
            full_name: params.full_name,
            phone: params.phone,
            address: params.address,
          },
          user.id
        );
        break;
      case 'suspend-member':
        result = await suspendAccount(params.account_id, user.id);
        break;
      case 'activate-member':
        result = await activateAccount(params.account_id, user.id);
        break;
      case 'delete-member':
        if (adminUser.role !== 'super_admin') throw new Error('Super admin required');
        result = await deleteAccount(params.account_id, user.id);
        break;
      case 'revoke-certificate':
        result = await revokeCertificate(params.account_id, user.id);
        break;
      case 'resolve-fraud-flag':
        result = await resolveFraudFlag(params.flag_id, user.id);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === 'Unauthorized' || err.message === 'Not an admin' ? 403 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function logAudit(adminId: string, action: string, targetUser?: string, details?: string) {
  await supabase.from('audit_logs').insert({
    admin_id: adminId,
    action,
    target_user: targetUser,
    details,
  });
}

async function approveAccount(accountId: string, adminId: string) {
  // Check payment is marked paid
  const { data: account } = await supabase
    .from('accounts')
    .select('payment_status, id, user_id')
    .eq('id', accountId)
    .single();

  if (!account) throw new Error('Account not found');
  if (account.payment_status !== 'paid') {
    throw new Error('Payment must be verified as paid before approving the account');
  }

  const { data: updated } = await supabase
    .from('accounts')
    .update({ approval_status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!updated) throw new Error('Account not found');

  await logAudit(adminId, 'account_approved', updated.user_id, `Account ${accountId} approved`);
  return { message: 'Account approved' };
}

async function rejectAccount(accountId: string, reason: string, adminId: string) {
  const { data: updated } = await supabase
    .from('accounts')
    .update({
      approval_status: 'rejected',
      rejection_reason: reason,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('id, user_id')
    .single();

  if (!updated) throw new Error('Account not found');
  await logAudit(adminId, 'account_rejected', updated.user_id, `Account ${accountId} rejected: ${reason}`);
  return { message: 'Account rejected' };
}

async function suspendAccount(accountId: string, adminId: string) {
  await supabase.from('accounts').update({ account_status: 'suspended' }).eq('id', accountId);
  await logAudit(adminId, 'account_suspended', accountId);
  return { message: 'Account suspended' };
}

async function activateAccount(accountId: string, adminId: string) {
  await supabase.from('accounts').update({ account_status: 'active' }).eq('id', accountId);
  await logAudit(adminId, 'account_activated', accountId);
  return { message: 'Account activated' };
}

async function deleteAccount(accountId: string, adminId: string) {
  await supabase.from('accounts').update({ account_status: 'deleted' }).eq('id', accountId);
  await logAudit(adminId, 'account_deleted', accountId);
  return { message: 'Account deleted' };
}

async function revokeCertificate(accountId: string, adminId: string) {
  await supabase.from('certificates').update({ status: 'revoked' }).eq('member_id', accountId);
  await logAudit(adminId, 'certificate_revoked', accountId);
  return { message: 'Certificate revoked' };
}

async function setPaymentStatus(
  accountId: string,
  status: 'pending' | 'paid' | 'failed',
  adminId: string
) {
  if (!accountId) throw new Error('account_id is required');
  if (!status || !['pending', 'paid', 'failed'].includes(status)) throw new Error('Invalid status');

  const { data: account } = await supabase
    .from('accounts')
    .update({ payment_status: status })
    .eq('id', accountId)
    .select('id')
    .single();

  if (!account) throw new Error('Account not found');
  await logAudit(adminId, 'payment_status_set', accountId, `Set payment_status=${status}`);
  return { message: 'Payment status updated' };
}

async function createMemberUser(
  params: {
    email: string;
    password: string;
    full_name?: string;
    phone?: string;
    address?: string;
  },
  adminId: string
) {
  const email = String(params.email || '').trim().toLowerCase();
  const password = String(params.password || '');

  if (!email) throw new Error('email is required');
  if (!password || password.length < 6) throw new Error('password must be at least 6 characters');

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

  await logAudit(adminId, 'member_created', data.user.id, `Created member user ${email}`);
  return { message: 'Member created', user_id: data.user.id };
}
