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
      case 'approve-firm':
        result = await approveFirm(params.firm_id, user.id);
        break;
      case 'reject-firm':
        result = await rejectFirm(params.firm_id, params.reason, user.id);
        break;
      case 'set-member-payment-status':
        result = await setMemberPaymentStatus(params.member_id, params.status, user.id);
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
        result = await suspendMember(params.member_id, user.id);
        break;
      case 'activate-member':
        result = await activateMember(params.member_id, user.id);
        break;
      case 'delete-member':
        if (adminUser.role !== 'super_admin') throw new Error('Super admin required');
        result = await deleteMember(params.member_id, user.id);
        break;
      case 'revoke-certificate':
        result = await revokeCertificate(params.member_id, user.id);
        break;
      case 'regenerate-certificate':
        throw new Error('Certificates are uploaded manually. Use Upload Certificate from the Firms tab.');
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

async function approveFirm(firmId: string, adminId: string) {
  // Only allow approval after payment is marked paid
  const { data: firmMember } = await supabase
    .from('firms')
    .select('member_id')
    .eq('id', firmId)
    .single();

  if (!firmMember?.member_id) throw new Error('Firm not found');

  const { data: member } = await supabase
    .from('members')
    .select('payment_status')
    .eq('id', firmMember.member_id)
    .single();

  if (member?.payment_status !== 'paid') {
    throw new Error('Payment must be verified as paid before approving the firm');
  }

  const { data: firm } = await supabase
    .from('firms')
    .update({ approval_status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq('id', firmId)
    .select('member_id')
    .single();

  if (!firm) throw new Error('Firm not found');

  await logAudit(adminId, 'firm_approved', firm.member_id, `Firm ${firmId} approved`);
  return { message: 'Firm approved' };
}

async function rejectFirm(firmId: string, reason: string, adminId: string) {
  const { data: firm } = await supabase
    .from('firms')
    .update({
      approval_status: 'rejected',
      rejection_reason: reason,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', firmId)
    .select('member_id')
    .single();

  if (!firm) throw new Error('Firm not found');
  await logAudit(adminId, 'firm_rejected', firm.member_id, `Firm ${firmId} rejected: ${reason}`);
  return { message: 'Firm rejected' };
}

async function suspendMember(memberId: string, adminId: string) {
  await supabase.from('members').update({ account_status: 'suspended' }).eq('id', memberId);
  await logAudit(adminId, 'account_suspended', memberId);
  return { message: 'Account suspended' };
}

async function activateMember(memberId: string, adminId: string) {
  await supabase.from('members').update({ account_status: 'active' }).eq('id', memberId);
  await logAudit(adminId, 'account_activated', memberId);
  return { message: 'Account activated' };
}

async function deleteMember(memberId: string, adminId: string) {
  await supabase.from('members').update({ account_status: 'deleted' }).eq('id', memberId);
  await logAudit(adminId, 'account_deleted', memberId);
  return { message: 'Account deleted' };
}

async function revokeCertificate(memberId: string, adminId: string) {
  await supabase.from('certificates').update({ status: 'revoked' }).eq('member_id', memberId);
  await logAudit(adminId, 'certificate_revoked', memberId);
  return { message: 'Certificate revoked' };
}

async function regenerateCertificate(memberId: string, adminId: string) {
  // Delete existing certificate
  await supabase.from('certificates').delete().eq('member_id', memberId);
  // Delete from storage
  await supabase.storage.from('certificates').remove([`${memberId}.pdf`]);
  // Trigger re-generation
  const functionUrl = `${supabaseUrl}/functions/v1/generate-certificate`;
  await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ member_id: memberId }),
  });
  await logAudit(adminId, 'certificate_regenerated', memberId);
  return { message: 'Certificate regenerated' };
}

async function resolveFraudFlag(flagId: string, adminId: string) {
  const { data: flag } = await supabase
    .from('fraud_flags')
    .update({ resolved: true })
    .eq('id', flagId)
    .select('member_id')
    .single();

  if (!flag) throw new Error('Flag not found');
  await logAudit(adminId, 'fraud_flag_resolved', flag.member_id, `Flag ${flagId} resolved`);
  return { message: 'Flag resolved' };
}

async function setMemberPaymentStatus(
  memberId: string,
  status: 'pending' | 'paid' | 'failed',
  adminId: string
) {
  if (!memberId) throw new Error('member_id is required');
  if (!status || !['pending', 'paid', 'failed'].includes(status)) throw new Error('Invalid status');

  const { data: member } = await supabase
    .from('members')
    .update({ payment_status: status })
    .eq('id', memberId)
    .select('id')
    .single();

  if (!member) throw new Error('Member not found');
  await logAudit(adminId, 'member_payment_status_set', memberId, `Set payment_status=${status}`);
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
