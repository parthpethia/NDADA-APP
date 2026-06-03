import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function useAdmin() {
  const { session, adminUser } = useAuth();

  const callAdminAction = useCallback(async (action: string, params: Record<string, any> = {}) => {
    if (!session) {
      console.error('❌ Not authenticated - no session');
      throw new Error('Not authenticated');
    }

    console.log('🚀 Calling admin action:', action, params);

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action, ...params },
    });

    console.log('📢 Admin action response:', { data, error });

    if (error) {
      const anyError = error as any;
      console.error('❌ Admin action error:', anyError);

      let rawText = 'Unknown error payload';
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
          // If e is the error we just threw (it has our exact message), rethrow it
          if (e.message && e.message !== 'Failed to fetch' && !e.message.includes('JSON')) {
             throw e;
          }
        }
      }

      const finalMessage = `${error.message}${statusInfo}. Details: ${rawText}`;
      console.error('Final error message:', finalMessage);
      throw new Error(finalMessage);
    }

    console.log('✅ Admin action success:', data);
    return data;
  }, [session]);

  return {
    isAdmin: !!adminUser,
    role: adminUser?.role,
    callAdminAction,
  };
}
