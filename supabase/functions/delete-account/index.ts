import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('🗑️ Account deletion request received');

    // Load environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Database credentials missing in environment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate request authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Bearer token required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('❌ Auth error:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    console.log(`👤 Authenticated user for deletion: ${userId}`);

    // Fetch the account to verify it exists and get its internal ID
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, email')
      .eq('user_id', userId)
      .maybeSingle();

    if (accountError) {
      console.error('❌ Error fetching account:', accountError.message);
      return new Response(JSON.stringify({ error: 'Database error fetching profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!account) {
      return new Response(JSON.stringify({ error: 'Account profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const memberId = account.id;
    console.log(`📄 Matching member account ID: ${memberId}`);

    // --- 1. Clean Up Uploaded Files & Certificate Files (Best-Effort) ---
    const bucketsToCleanup = ['documents', 'id-proofs', 'payment-proofs', 'certificates'];
    for (const bucket of bucketsToCleanup) {
      try {
        const { data: files, error: listError } = await supabase.storage
          .from(bucket)
          .list(memberId);
        
        if (listError) {
          console.warn(`⚠️ Failed to list files in bucket "${bucket}":`, listError.message);
          continue;
        }

        if (files && files.length > 0) {
          const filesToDelete = files.map((file) => `${memberId}/${file.name}`);
          const { error: deleteError } = await supabase.storage
            .from(bucket)
            .remove(filesToDelete);
          
          if (deleteError) {
            console.warn(`⚠️ Failed to delete files in bucket "${bucket}":`, deleteError.message);
          } else {
            console.log(`✅ Cleaned up ${filesToDelete.length} files from bucket "${bucket}"`);
          }
        }
      } catch (err) {
        console.warn(`⚠️ Unexpected error cleaning up bucket "${bucket}":`, err);
      }
    }

    // --- 1b. Clean Up Related Database Records (Certificates, Notifications, Queue, Assignments, Drafts) ---
    try {
      // Clean certificates storage files referenced directly in certificates table
      const { data: certs } = await supabase
        .from('certificates')
        .select('id, certificate_url')
        .eq('member_id', memberId);

      if (certs && certs.length > 0) {
        for (const cert of certs) {
          if (cert.certificate_url) {
            await supabase.storage
              .from('certificates')
              .remove([cert.certificate_url])
              .catch((err: any) => console.error('Failed to delete cert file:', err));
          }
          await supabase.from('certificate_downloads').delete().eq('certificate_id', cert.id).catch(() => {});
        }
      }

      await supabase.from('certificates').delete().eq('member_id', memberId).catch(() => {});
      await supabase.from('certificate_generation_queue').delete().eq('account_id', memberId).catch(() => {});
      await supabase.from('notifications').delete().eq('user_id', userId).catch(() => {});
      await supabase.from('review_assignments').delete().eq('account_id', memberId).catch(() => {});
      await supabase.from('account_drafts').delete().eq('user_id', userId).catch(() => {});
      console.log('✅ Cleaned up related records (certificates, notifications, assignments, queue, drafts)');
    } catch (relErr) {
      console.warn('⚠️ Error cleaning up related DB records:', relErr);
    }

    // --- 2. Anonymize the Accounts Table Entry ---
    const dummyEmail = `deleted_${userId.substring(0, 8)}@deleted.invalid`;
    
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        full_name: 'Deleted User',
        email: dummyEmail,
        phone: '',
        address: '',
        district: null,
        id_proof_url: null,
        applicant_photo_url: null,
        documents_urls: [],
        
        firm_name: '',
        firm_type: 'other',
        license_number: '',
        registration_number: '',
        gst_number: null,
        firm_address: '',
        contact_phone: '',
        contact_email: '',
        firm_pin_code: null,
        partner_proprietor_name: null,
        whatsapp_number: null,
        aadhaar_card_number: null,
        ifms_number: null,
        seed_cotton_license_number: null,
        seed_cotton_license_expiry: null,
        sarthi_id_cotton: null,
        seed_general_license_number: null,
        seed_general_license_expiry: null,
        sarthi_id_general: null,
        pesticide_license_number: null,
        pesticide_license_expiry: null,
        fertilizer_license_number: null,
        fertilizer_license_expiry: null,
        residence_address: null,
        residence_pin_code: null,
        
        account_status: 'deleted',
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (updateError) {
      console.error('❌ Error anonymizing account profile:', updateError.message);
      return new Response(JSON.stringify({ error: 'Failed to anonymize account profile' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log('✅ Account profile anonymized successfully');

    // --- 3. Anonymize/Lock the Auth User (Best-Effort) ---
    // Change password to a random UUID and email to the dummy address
    // to prevent any future logins or conflicts.
    try {
      const randomPassword = crypto.randomUUID();
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
        email: dummyEmail,
        password: randomPassword,
        email_confirm: false,
        phone_confirm: false,
        user_metadata: {},
        app_metadata: { deleted: true },
      });

      if (authUpdateError) {
        console.warn('⚠️ Failed to update auth user metadata/password:', authUpdateError.message);
      } else {
        console.log('✅ Auth user record anonymized and locked');
      }
    } catch (authErr) {
      console.warn('⚠️ Unexpected error locking auth user:', authErr);
    }

    return new Response(JSON.stringify({ success: true, message: 'Account deleted and data anonymized successfully.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Unexpected edge function error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
