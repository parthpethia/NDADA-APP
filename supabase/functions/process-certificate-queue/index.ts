// Supabase Edge Function: process-certificate-queue
// Processes pending certificate generation jobs from the queue.
// Designed to be invoked fire-and-forget after a queue insert,
// or periodically via pg_cron / external scheduler.
//
// Processes ONE job per invocation to avoid long-running functions.
// For batch processing, invoke this function repeatedly.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the next pending job using FOR UPDATE SKIP LOCKED
    const { data: jobs, error: jobErr } = await supabase
      .rpc('get_next_certificate_job');

    if (jobErr) {
      console.error('Error fetching next job:', jobErr);
      return new Response(JSON.stringify({ error: 'Failed to fetch queue job' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!jobs || jobs.length === 0) {
      console.log('No pending certificate jobs in queue.');
      return new Response(JSON.stringify({ message: 'No pending jobs', processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const job = jobs[0];
    console.log(`Processing certificate job ${job.id} for account ${job.account_id}`);

    // Mark as processing
    await supabase.rpc('mark_certificate_processing', { job_id: job.id });

    // Delegate actual generation to generate-certificate function
    // This keeps the generation logic in one place and avoids duplication
    try {
      const { data, error: genErr } = await supabase.functions.invoke('generate-certificate', {
        body: { member_id: job.account_id },
      });

      if (genErr) {
        throw new Error(genErr.message || 'Certificate generation failed');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Mark as completed
      await supabase.rpc('mark_certificate_completed', { job_id: job.id });

      console.log(`Job ${job.id} completed successfully for ${job.full_name}`);

      // Check if there are more pending jobs — process the next one
      const { count: pendingCount } = await supabase
        .from('certificate_generation_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if ((pendingCount ?? 0) > 0) {
        console.log(`${pendingCount} more job(s) pending — triggering next processor`);
        // Fire-and-forget to process next job
        supabase.functions.invoke('process-certificate-queue', { body: {} })
          .catch(() => {}); // Non-blocking
      }

      return new Response(JSON.stringify({
        message: 'Job processed successfully',
        processed: 1,
        job_id: job.id,
        account_id: job.account_id,
        remaining: pendingCount ?? 0,
        certificate: data?.certificate,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (genError) {
      const errorMsg = genError instanceof Error ? genError.message : String(genError);
      console.error(`Job ${job.id} failed:`, errorMsg);

      // Mark as failed with error message
      await supabase.rpc('mark_certificate_failed', {
        job_id: job.id,
        error_msg: errorMsg.substring(0, 500), // Truncate long errors
      });

      return new Response(JSON.stringify({
        error: 'Certificate generation failed',
        job_id: job.id,
        details: errorMsg,
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.error('Queue processor error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
