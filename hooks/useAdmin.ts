import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function useAdmin() {
  const { session, adminUser } = useAuth();

  const callAdminAction = async (action: string, params: Record<string, any> = {}) => {
    if (!session) {
      console.error('❌ Not authenticated - no session');
      throw new Error('Not authenticated');
    }

    console.log('🚀 Calling admin action:', action, params);

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action, ...params },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    console.log('📢 Admin action response:', { data, error });

    if (error) {
      const anyError = error as any;
      console.error('❌ Admin action error:', anyError);

      // Supabase FunctionInvokeError often contains a response body in `context`.
      const contextBody = anyError?.context?.body;
      if (typeof contextBody === 'string' && contextBody.trim()) {
        try {
          const parsed = JSON.parse(contextBody);
          if (parsed?.error) {
            console.error('Parsed error from context:', parsed.error);
            throw new Error(String(parsed.error));
          }
        } catch (parseErr) {
          console.warn('Could not parse error context:', parseErr);
          // Not JSON, fall through to generic message
        }
      }

      if (anyError?.context?.status) {
        const msg = `${error.message} (status ${anyError.context.status})`;
        console.error(msg);
        throw new Error(msg);
      }

      console.error('Final error message:', error.message);
      throw new Error(error.message);
    }

    console.log('✅ Admin action success:', data);
    return data;
  };

  return {
    isAdmin: !!adminUser,
    role: adminUser?.role,
    callAdminAction,
  };
}
