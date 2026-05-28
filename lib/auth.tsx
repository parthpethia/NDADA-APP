import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import { Account, AdminUser } from '@/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  member: Account | null;
  adminUser: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, profile: {
    full_name: string;
    phone: string;
    address: string;
    district: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Account | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Broader check for invalid/expired session errors from Supabase
  const isInvalidSessionError = (message?: string | null): boolean => {
    const errorMessage = String(message || '').toLowerCase();
    return (
      errorMessage.includes('invalid refresh token') ||
      errorMessage.includes('refresh token not found') ||
      errorMessage.includes('invalid jwt') ||
      errorMessage.includes('jwt expired') ||
      errorMessage.includes('session_not_found') ||
      errorMessage.includes('auth session missing') ||
      errorMessage.includes('token is expired') ||
      errorMessage.includes('invalid claim') ||
      errorMessage.includes('user not found')
    );
  };

  const clearInvalidSession = async () => {
    // Clear the invalid session from Supabase client
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      // Silently fail - we're in recovery mode
    }

    // Also manually clear storage to ensure token is gone
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('sb-auth-token');
        localStorage.removeItem('sb-refresh-token');
        // Clear any Supabase session keys
        Object.keys(localStorage).forEach(key => {
          if (key.includes('supabase') || key.includes('auth')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Silently fail
      }
    }

    setSession(null);
    setUser(null);
    setMember(null);
    setAdminUser(null);
  };

  const fetchMember = useCallback(async (userId: string, currentUser?: User | null) => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      setMember(data);
      return;
    }

    if (error) {
      console.warn('Failed to fetch account profile:', error.message);
      // If this is an auth error, the session is bad — don't try to create account
      if (isInvalidSessionError(error.message)) {
        throw new Error(`Auth error during fetch: ${error.message}`);
      }
    }

    if (!currentUser) {
      setMember(null);
      return;
    }

    const { data: createdAccount, error: createError } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        full_name:
          String(currentUser.user_metadata?.full_name || '').trim() ||
          String(currentUser.email || '').split('@')[0] ||
          'Member',
        email: String(currentUser.email || '').trim() || 'unknown@example.com',
        phone: String(currentUser.user_metadata?.phone || '').trim() || '',
        address: String(currentUser.user_metadata?.address || '').trim(),
        district: String(currentUser.user_metadata?.district || '').trim(),
        firm_name: '',
        license_number: '',
        registration_number: '',
        firm_address: '',
        contact_phone: '',
        contact_email: '',
      })
      .select('*')
      .single();

    if (createError) {
      console.error('Failed to create account profile:', createError.message, createError.details, createError.hint);
      setMember(null);
      return;
    }

    setMember(createdAccount);
  }, []);

  const fetchAdminUser = async (userId: string) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      try {
        // Avoid printing keys; URL is safe and helps detect wrong project/env.
        console.log('Auth: fetching admin user for', userId, 'from', (supabase as any)?.supabaseUrl);
      } catch {}
    }

    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn(
        'Failed to fetch admin user:',
        {
          message: error.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
        }
      );
      // If this is an auth error, propagate it
      if (isInvalidSessionError(error.message)) {
        throw new Error(`Auth error during admin fetch: ${error.message}`);
      }
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('Auth: admin user lookup result', data ?? null);
    }

    setAdminUser(data ?? null);
  };

  const refreshMember = useCallback(async () => {
    if (user) await fetchMember(user.id);
  }, [user, fetchMember]);

  // Helper: load user profile data with error recovery
  const loadUserProfile = async (currentSession: Session): Promise<boolean> => {
    try {
      await Promise.all([
        fetchMember(currentSession.user.id, currentSession.user),
        fetchAdminUser(currentSession.user.id),
      ]);
      return true;
    } catch (err) {
      console.warn('Auth: profile fetch failed, clearing invalid session:', err);
      await clearInvalidSession();
      return false;
    }
  };

  useEffect(() => {
    // Track whether initializeAuth has completed to avoid double-loading
    let initialized = false;

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();

        if (error) {
          if (isInvalidSessionError(error.message)) {
            console.warn('Auth: clearing invalid session on init:', error.message);
            await clearInvalidSession();
          } else {
            console.warn('Failed to restore auth session:', error.message);
          }
          return;
        }

        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        if (currentSession?.user) {
          await loadUserProfile(currentSession);
        }
      } catch (err) {
        console.warn('Auth initialization error:', err);
        // On any unexpected error, clear session to prevent stuck state
        await clearInvalidSession();
      } finally {
        initialized = true;
        setLoading(false);
      }
    };

    initializeAuth();

    // Safety timeout: if initialization hangs (e.g. network issue), force loading to false
    // so the user at least sees the login screen instead of infinite spinner
    const safetyTimer = setTimeout(() => {
      if (!initialized) {
        console.warn('Auth: initialization timed out after 10s, forcing loading=false');
        setLoading(false);
      }
    }, 10_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          try {
            await Promise.all([
              fetchMember(newSession.user.id, newSession.user),
              fetchAdminUser(newSession.user.id),
            ]);
          } catch (err) {
            console.warn('Auth: onAuthStateChange profile fetch failed:', err);
            // If profile loading fails due to auth error, clear session
            await clearInvalidSession();
          }
        } else {
          setMember(null);
          setAdminUser(null);
        }

        // If the listener fires before initializeAuth finishes (e.g. INITIAL_SESSION event),
        // make sure we also stop the loading spinner
        if (!initialized) {
          initialized = true;
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (e) {
      if (!isSupabaseConfigured) {
        return {
          error:
            'Supabase is not configured for this deployment. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in Vercel Environment Variables, then redeploy.',
        };
      }
      return {
        error:
          'Network error while contacting Supabase (unable to fetch). Check your internet connection and that your Supabase project URL is reachable.',
      };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    profile: { full_name: string; phone: string; address: string; district: string }
  ) => {
    // Pass profile data as user metadata — the database trigger
    // handle_new_user() reads this and creates the member row automatically
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: profile.full_name,
          phone: profile.phone,
          address: profile.address,
          district: profile.district,
        },
      },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Signup failed' };

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMember(null);
    setAdminUser(null);
  };

  const resetPassword = async (email: string) => {
    try {
      const appUrl = process.env.EXPO_PUBLIC_APP_URL || 'http://localhost:8081';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/(auth)/reset-password`,
      });
      return { error: error?.message ?? null };
    } catch (e) {
      return {
        error: 'Network error while sending reset email. Please check your internet connection.',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{ session, user, member, adminUser, loading, signIn, signUp, signOut, refreshMember, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
