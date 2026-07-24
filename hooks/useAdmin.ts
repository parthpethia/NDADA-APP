import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function useAdmin() {
  const { session, adminUser } = useAuth();

  const executeFallbackAdminAction = useCallback(async (action: string, params: Record<string, any>) => {
    if (!session) throw new Error('Not authenticated');

    console.warn(`⚠️ Edge Function unreachable. Executing DB fallback for admin action: "${action}"`, params);

    switch (action) {
      case 'reject-account': {
        const { account_id, reason } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: updated, error: dbErr } = await supabase
          .from('accounts')
          .update({
            approval_status: 'rejected',
            rejection_reason: reason || 'Application rejected by administrator',
            reviewed_by: session.user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', account_id)
          .select('id, user_id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        if (!updated) throw new Error('Account not found');

        if (adminUser?.id) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'account_rejected',
              target_user: updated.user_id,
              details: `Account ${account_id} rejected: ${reason || ''}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }

        return { success: true, message: 'Account rejected' };
      }

      case 'approve-account': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: updated, error: dbErr } = await supabase
          .from('accounts')
          .update({
            approval_status: 'approved',
            reviewed_by: session.user.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', account_id)
          .select('id, user_id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        if (!updated) throw new Error('Account not found');

        if (adminUser?.id) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'account_approved',
              target_user: updated.user_id,
              details: `Account ${account_id} approved`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }

        return { success: true, message: 'Account approved' };
      }

      case 'bulk-reject': {
        const { account_ids, reason } = params;
        if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
          throw new Error('No accounts selected for rejection');
        }
        const { data: updatedList, error: dbErr } = await supabase
          .from('accounts')
          .update({
            approval_status: 'rejected',
            rejection_reason: reason || 'Application rejected by administrator',
            reviewed_by: session.user.id,
            reviewed_at: new Date().toISOString(),
          })
          .in('id', account_ids)
          .select('id, user_id');

        if (dbErr) throw new Error(dbErr.message);

        if (adminUser?.id && updatedList && updatedList.length > 0) {
          const logs = updatedList.map((acc: any) => ({
            admin_id: adminUser.id,
            action: 'account_bulk_reject',
            target_user: acc.user_id,
            details: `Bulk rejected: ${reason || ''}`,
          }));
          try {
            await supabase.from('audit_logs').insert(logs);
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }

        return { success: true, message: 'Accounts rejected successfully', count: updatedList?.length || 0 };
      }

      case 'suspend-member': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: updated, error: dbErr } = await supabase
          .from('accounts')
          .update({ account_status: 'suspended' })
          .eq('id', account_id)
          .select('id, user_id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        if (adminUser?.id && updated) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'account_suspended',
              target_user: updated.user_id,
              details: `Suspended account ${account_id}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }

        return { success: true, message: 'Account suspended' };
      }

      case 'activate-member': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: updated, error: dbErr } = await supabase
          .from('accounts')
          .update({ account_status: 'active' })
          .eq('id', account_id)
          .select('id, user_id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        if (adminUser?.id && updated) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'account_activated',
              target_user: updated.user_id,
              details: `Activated account ${account_id}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }

        return { success: true, message: 'Account activated' };
      }

      case 'set-payment-status': {
        const { account_id, status } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: updated, error: dbErr } = await supabase
          .from('accounts')
          .update({ payment_status: status })
          .eq('id', account_id)
          .select('id, user_id')
          .single();

        if (dbErr) throw new Error(dbErr.message);

        if (status === 'paid') {
          try {
            await supabase.from('certificate_generation_queue').upsert(
              { account_id, status: 'pending' },
              { onConflict: 'account_id' }
            );
          } catch (e: any) {
            console.warn('Failed to enqueue certificate:', e?.message);
          }
        }

        if (adminUser?.id && updated) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'payment_status_set',
              target_user: updated.user_id,
              details: `Set payment_status=${status}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }

        return { success: true, message: 'Payment status updated' };
      }

      case 'add-note': {
        const { member_id, note } = params;
        if (!adminUser?.id) throw new Error('Admin profile missing');
        const { data, error: dbErr } = await supabase
          .from('admin_notes')
          .insert({ member_id, admin_id: adminUser.id, note })
          .select('id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Note added successfully', note_id: data?.id };
      }

      case 'edit-note': {
        const { note_id, note } = params;
        const { error: dbErr } = await supabase
          .from('admin_notes')
          .update({ note, updated_at: new Date().toISOString() })
          .eq('id', note_id);

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Note updated successfully' };
      }

      case 'delete-note': {
        const { note_id } = params;
        const { error: dbErr } = await supabase
          .from('admin_notes')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: adminUser?.id
          })
          .eq('id', note_id);

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Note soft-deleted successfully' };
      }

      case 'save-filter': {
        if (!adminUser?.id) throw new Error('Admin profile missing');
        const name = params.name || params.filter_name;
        const filters = params.filters || params.filter_params || {};
        const is_shared = params.is_shared || false;

        if (!name) throw new Error('Filter name is required');

        const { data, error: dbErr } = await supabase
          .from('admin_saved_filters')
          .insert({ admin_id: adminUser.id, name, filters, is_shared })
          .select('id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Filter saved successfully', filter_id: data?.id };
      }

      case 'get-saved-filters': {
        if (!adminUser?.id) return { success: true, filters: [] };
        const { data, error: dbErr } = await supabase
          .from('admin_saved_filters')
          .select('*')
          .or(`admin_id.eq.${adminUser.id},is_shared.eq.true`)
          .order('created_at', { ascending: false });

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, filters: data || [] };
      }

      case 'delete-filter': {
        const { filter_id } = params;
        if (!filter_id) throw new Error('filter_id is required');
        const { error: dbErr } = await supabase
          .from('admin_saved_filters')
          .delete()
          .eq('id', filter_id)
          .eq('admin_id', adminUser?.id);

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Filter deleted successfully' };
      }

      case 'revoke-certificate': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: account } = await supabase.from('accounts').select('user_id').eq('id', account_id).single();
        if (!account) throw new Error('Account not found');

        const { error: dbErr } = await supabase.from('certificates').update({ status: 'revoked' }).eq('member_id', account_id);
        if (dbErr) throw new Error(dbErr.message);

        if (adminUser?.id) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'certificate_revoked',
              target_user: account.user_id,
              details: `Revoked certificate for account ${account_id}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }
        return { success: true, message: 'Certificate revoked' };
      }

      case 'delete-certificate': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: account } = await supabase.from('accounts').select('user_id').eq('id', account_id).single();
        if (!account) throw new Error('Account not found');

        const { error: dbErr } = await supabase.from('certificates').delete().eq('member_id', account_id);
        if (dbErr) throw new Error(dbErr.message);
        await supabase.from('certificate_generation_queue').delete().eq('account_id', account_id);

        if (adminUser?.id) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'certificate_deleted',
              target_user: account.user_id,
              details: `Deleted certificate for account ${account_id}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }
        return { success: true, message: 'Certificate deleted' };
      }

      case 'bulk-suspend': {
        const { account_ids } = params;
        if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
          throw new Error('No accounts selected for suspension');
        }
        const { data: updatedList, error: dbErr } = await supabase
          .from('accounts')
          .update({ account_status: 'suspended' })
          .in('id', account_ids)
          .select('id, user_id');

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Accounts suspended successfully', count: updatedList?.length || 0 };
      }

      case 'bulk-activate': {
        const { account_ids } = params;
        if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
          throw new Error('No accounts selected for activation');
        }
        const { data: updatedList, error: dbErr } = await supabase
          .from('accounts')
          .update({ account_status: 'active' })
          .in('id', account_ids)
          .select('id, user_id');

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Accounts activated successfully', count: updatedList?.length || 0 };
      }

      case 'bulk-revoke': {
        const { account_ids } = params;
        if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
          throw new Error('No accounts selected for certificate revocation');
        }
        const { error: dbErr } = await supabase
          .from('certificates')
          .update({ status: 'revoked' })
          .in('member_id', account_ids);

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Certificates revoked successfully', count: account_ids.length };
      }

      case 'bulk-regenerate': {
        const { account_ids } = params;
        if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
          throw new Error('No accounts selected for certificate regeneration');
        }
        const queueItems = account_ids.map((id: string) => ({ account_id: id, status: 'pending' }));
        const { error: dbErr } = await supabase
          .from('certificate_generation_queue')
          .upsert(queueItems, { onConflict: 'account_id' });

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Certificates queued for regeneration', count: account_ids.length };
      }

      case 'assign-reviewer': {
        const { account_id, reviewer_id } = params;
        if (!account_id || !reviewer_id) throw new Error('account_id and reviewer_id are required');
        const { error: dbErr } = await supabase.from('review_assignments').upsert(
          { account_id, assigned_to: reviewer_id, assigned_by: adminUser?.id, status: 'pending' },
          { onConflict: 'account_id' }
        );
        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Reviewer assigned' };
      }

      case 'unassign-reviewer': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { error: dbErr } = await supabase.from('review_assignments').delete().eq('account_id', account_id);
        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Reviewer unassigned' };
      }

      case 'queue-job-action': {
        const { job_id, job_action } = params;
        if (!job_id) throw new Error('job_id is required');
        let status = 'pending';
        let errorMsg = null;
        if (job_action === 'cancel') {
          status = 'failed';
          errorMsg = 'Cancelled by administrator';
        }
        const payload: any = { status, error_message: errorMsg };
        if (job_action === 'retry') {
          payload.error_message = null;
        }
        const { error: dbErr } = await supabase.from('certificate_generation_queue').update(payload).eq('id', job_id);
        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: `Job ${job_action} completed` };
      }

      case 'create-member': {
        const email = String(params.email || '').trim().toLowerCase();
        const password = String(params.password || '').trim() || '123456';
        if (!email) throw new Error('email is required');

        const { data, error: createErr } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: String(params.full_name || '').trim(),
              phone: String(params.phone || '').trim(),
              address: String(params.address || '').trim(),
            },
          },
        });

        if (createErr) throw new Error(createErr.message);
        if (adminUser?.id && data?.user) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'member_created',
              target_user: data.user.id,
              details: `Created member user ${email}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }
        return { success: true, message: 'Member created successfully', user_id: data?.user?.id };
      }

      case 'delete-member': {
        const { account_id } = params;
        if (!account_id) throw new Error('account_id is required');
        const { data: updated, error: dbErr } = await supabase
          .from('accounts')
          .update({ account_status: 'deleted' })
          .eq('id', account_id)
          .select('id, user_id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        if (adminUser?.id && updated) {
          try {
            await supabase.from('audit_logs').insert({
              admin_id: adminUser.id,
              action: 'account_deleted',
              target_user: updated.user_id,
              details: `Deleted account ${account_id}`,
            });
          } catch (e: any) {
            console.warn('Audit log failed:', e?.message);
          }
        }
        return { success: true, message: 'Account deleted' };
      }

      case 'bulk-assign-reviewer': {
        const { account_ids, reviewer_id } = params;
        if (!account_ids || !Array.isArray(account_ids) || account_ids.length === 0) {
          throw new Error('No accounts selected for reviewer assignment');
        }
        if (!reviewer_id) throw new Error('reviewer_id is required');

        const assignments = account_ids.map((id: string) => ({
          account_id: id,
          assigned_to: reviewer_id,
          assigned_by: adminUser?.id,
          status: 'pending',
        }));

        const { error: dbErr } = await supabase
          .from('review_assignments')
          .upsert(assignments, { onConflict: 'account_id' });

        if (dbErr) throw new Error(dbErr.message);

        if (adminUser?.id) {
          const { data: accounts } = await supabase.from('accounts').select('id, user_id').in('id', account_ids);
          if (accounts && accounts.length > 0) {
            const logs = accounts.map((acc: any) => ({
              admin_id: adminUser.id,
              action: 'reviewer_bulk_assigned',
              target_user: acc.user_id,
              details: `Bulk assigned to reviewer ${reviewer_id}`,
            }));
            try {
              await supabase.from('audit_logs').insert(logs);
            } catch (e: any) {
              console.warn('Audit log failed:', e?.message);
            }
          }
        }

        return { success: true, message: 'Reviewers assigned successfully', count: account_ids.length };
      }

      case 'create-announcement': {
        const { title, message, target_type, target_value } = params;
        if (!title || !message) throw new Error('Title and message are required');

        const { data, error: dbErr } = await supabase
          .from('notification_campaigns')
          .insert({
            title,
            message,
            target_type: target_type || 'all',
            target_value: target_value || null,
            recipient_count: 0,
            admin_id: adminUser?.id,
          })
          .select('id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Announcement created successfully', campaign_id: data?.id };
      }

      case 'preview-campaign': {
        const { target_type } = params;
        let query = supabase.from('accounts').select('id', { count: 'exact', head: true });
        if (target_type === 'suspended') {
          query = query.eq('account_status', 'suspended');
        } else if (target_type === 'expired') {
          query = query.eq('account_status', 'active');
        }
        const { count, error: dbErr } = await query;
        if (dbErr) throw new Error(dbErr.message);
        return { success: true, recipient_count: count || 0 };
      }

      case 'send-campaign': {
        const { target_type, title, message } = params;
        if (!title || !message) throw new Error('Title and message are required');

        const { data: campaign, error: dbErr } = await supabase
          .from('notification_campaigns')
          .insert({
            title,
            message,
            target_type: target_type || 'expired_0_30',
            target_value: null,
            recipient_count: 0,
            admin_id: adminUser?.id,
          })
          .select('id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Campaign dispatched successfully', campaign_id: campaign?.id };
      }

      case 'generate-export': {
        const { type, format, filters } = params;
        if (!adminUser?.id) throw new Error('Admin profile missing');
        const { data, error: dbErr } = await supabase
          .from('export_jobs')
          .insert({
            admin_id: adminUser.id,
            export_type: type || 'members',
            format: format || 'CSV',
            filters: filters || {},
            status: 'failed',
            file_url: null,
            error_message: 'Edge function unreachable — export could not be compiled. Please check your network connection and try again.',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .select('id')
          .single();

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, message: 'Export job created (compilation unavailable — edge function offline)', job_id: data?.id };
      }

      case 'cleanup-exports': {
        const { error: dbErr } = await supabase
          .from('export_jobs')
          .delete()
          .lt('expires_at', new Date().toISOString());

        if (dbErr) console.warn('Cleanup exports error:', dbErr.message);
        return { success: true, message: 'Export cleanup completed' };
      }

      case 'get-export-download': {
        const { job_id } = params;
        if (!job_id) throw new Error('job_id is required');
        const { data, error: dbErr } = await supabase
          .from('export_jobs')
          .select('file_url')
          .eq('id', job_id)
          .single();

        if (dbErr) throw new Error(dbErr.message);
        return { success: true, download_url: data?.file_url };
      }

      default:
        throw new Error(`Edge Function is unreachable and no DB fallback exists for action "${action}".`);
    }
  }, [session, adminUser]);

  const callAdminAction = useCallback(async (action: string, params: Record<string, any> = {}) => {
    if (!session) {
      console.error('❌ Not authenticated - no session');
      throw new Error('Not authenticated');
    }

    if (__DEV__) {
      console.log('🚀 Calling admin action:', action, params);
    }

    let data: any = null;
    let error: any = null;

    try {
      const res = await supabase.functions.invoke('admin-actions', {
        body: { action, ...params },
      });
      data = res.data;
      error = res.error;
    } catch (invokeErr: any) {
      error = invokeErr;
    }

    if (__DEV__) {
      console.log('📢 Admin action response:', { data, error });
    }

    if (error) {
      const anyError = error as any;
      if (__DEV__) {
        console.error('❌ Admin action error:', anyError);
      }

      const errName = typeof anyError.name === 'string' ? anyError.name : '';
      const errMsg = typeof anyError.message === 'string' ? anyError.message.toLowerCase() : '';
      const isFetchError =
        errName === 'FunctionsFetchError' ||
        errName === 'FunctionsRelayError' ||
        errName === 'TypeError' ||
        errName === 'FetchError' ||
        errName === 'NetworkError' ||
        errMsg.includes('failed to send a request') ||
        errMsg.includes('functionsfetcherror') ||
        errMsg.includes('failed to fetch') ||
        errMsg.includes('network request failed') ||
        errMsg.includes('network error') ||
        errMsg.includes('load failed') ||
        errMsg.includes('offline') ||
        errMsg.includes('typeerror') ||
        errMsg.includes('econnreset') ||
        errMsg.includes('etimedout') ||
        errMsg.includes('abort');

      if (isFetchError) {
        try {
          return await executeFallbackAdminAction(action, params);
        } catch (fallbackErr: any) {
          console.error('❌ Fallback DB action error:', fallbackErr);
          throw new Error(fallbackErr?.message || 'Admin action failed');
        }
      }

      let rawText = '';
      let statusInfo = '';

      if (anyError?.context) {
        try {
          if (anyError.context.status) {
            statusInfo = ` (Status: ${anyError.context.status})`;
          }

          if (typeof anyError.context.text === 'function') {
            rawText = await anyError.context.text();
          } else if (typeof anyError.context === 'string') {
            rawText = anyError.context;
          } else if (typeof anyError.context === 'object') {
            rawText = JSON.stringify(anyError.context);
          }

          let errorObj;
          try {
            errorObj = JSON.parse(rawText);
          } catch (e) {
            // Not JSON
          }

          if (errorObj?.error) {
            throw new Error(String(errorObj.error));
          } else if (errorObj?.message) {
            throw new Error(String(errorObj.message));
          }
        } catch (e: any) {
          if (e.message && e.message !== 'Failed to fetch' && !e.message.includes('JSON')) {
            throw e;
          }
        }
      }

      if (!rawText || rawText === '{}') {
        rawText = anyError.message || String(anyError);
      }

      const finalMessage = `${error.message || 'Admin action failed'}${statusInfo}. Details: ${rawText}`;
      console.error('Final error message:', finalMessage);
      throw new Error(finalMessage);
    }

    if (__DEV__) {
      console.log('✅ Admin action success:', data);
    }
    return data;
  }, [session, executeFallbackAdminAction]);

  return {
    isAdmin: !!adminUser,
    role: adminUser?.role,
    callAdminAction,
  };
}

