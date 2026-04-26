// Supabase Edge Function: verify-cash-payment
// Allows admins to verify and approve cash payments from members
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Load environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const authHeader = req.headers.get('authorization');
    let adminUser = null;

    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (token) {
        const { data: { user: authUser } } = await supabase.auth.getUser(token);
        adminUser = authUser;
      }
    }

    if (!adminUser) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get admin account to verify they are an admin
    const { data: adminUsers } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', adminUser.id);

    if (!adminUsers || adminUsers.length === 0) {
      return new Response(JSON.stringify({ error: 'Only admins can verify cash payments' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get admin account ID for verification record
    const { data: adminAccount } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', adminUser.id)
      .single();

    // Parse request body
    const body = await req.json();
    const { member_id, status, notes } = body;

    if (!member_id || !status || !['approved', 'rejected'].includes(status)) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: member_id, status (approved/rejected)',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify member exists
    const { data: member } = await supabase
      .from('accounts')
      .select('id, payment_method')
      .eq('id', member_id)
      .single();

    if (!member) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (member.payment_method !== 'cash') {
      return new Response(JSON.stringify({
        error: 'Member has not selected cash payment method',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (status === 'approved') {
      // Update account to mark cash payment as verified
      const { error: updateErr } = await supabase
        .from('accounts')
        .update({
          cash_payment_verified: true,
          cash_payment_verified_by: adminAccount.id,
          cash_payment_verified_at: new Date().toISOString(),
          cash_payment_notes: notes || null,
          payment_status: 'paid', // Mark as paid once verified
        })
        .eq('id', member_id);

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      // Record verification
      const { error: verificationErr } = await supabase
        .from('cash_payment_verifications')
        .insert({
          member_id,
          verified_by: adminAccount.id,
          status: 'approved',
          notes,
        });

      if (verificationErr) {
        console.warn('Warning: Failed to record verification:', verificationErr.message);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Cash payment verified and approved',
        member_id,
        status: 'approved',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      // Rejected
      const { error: updateErr } = await supabase
        .from('accounts')
        .update({
          payment_method: 'online', // Reset to online
          cash_payment_notes: notes || null,
        })
        .eq('id', member_id);

      if (updateErr) {
        throw new Error(updateErr.message);
      }

      // Record verification
      const { error: verificationErr } = await supabase
        .from('cash_payment_verifications')
        .insert({
          member_id,
          verified_by: adminAccount.id,
          status: 'rejected',
          notes,
        });

      if (verificationErr) {
        console.warn('Warning: Failed to record verification:', verificationErr.message);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Cash payment request rejected',
        member_id,
        status: 'rejected',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Function error:', message);

    return new Response(JSON.stringify({
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
