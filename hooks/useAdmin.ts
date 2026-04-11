import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export function useAdmin() {
  const { session, adminUser } = useAuth();

  const callAdminAction = async (action: string, params: Record<string, any> = {}) => {
    if (!session) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('admin-actions', {
      body: { action, ...params },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      const anyError = error as any;

      // Supabase FunctionInvokeError often contains a response body in `context`.
      const contextBody = anyError?.context?.body;
      if (typeof contextBody === 'string' && contextBody.trim()) {
        try {
          const parsed = JSON.parse(contextBody);
          if (parsed?.error) {
            throw new Error(String(parsed.error));
          }
        } catch {
          // Not JSON, fall through to generic message
        }
      }

      if (anyError?.context?.status) {
        throw new Error(`${error.message} (status ${anyError.context.status})`);
      }
      throw new Error(error.message);
    }
    return data;
  };

  return {
    isAdmin: !!adminUser,
    role: adminUser?.role,
    callAdminAction,
  };
}
