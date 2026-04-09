import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import { Member, AdminUser } from '@/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  member: Member | null;
  adminUser: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, profile: {
    full_name: string;
    phone: string;
    address: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const recoverFromInvalidRefreshToken = async (message?: string | null) => {
    const errorMessage = String(message || '').toLowerCase();
    if (!errorMessage.includes('invalid refresh token')) return false;

    // Clear only the local session cache so web can recover from stale tokens.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      console.warn('Failed to clear stale local session:', signOutError);
    }
    setSession(null);
    setUser(null);
    setMember(null);
    setAdminUser(null);
    return true;
  };

  const fetchMember = async (userId: string, currentUser?: User | null) => {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      setMember(data);
      return;
    }

    if (error) {
      console.warn('Failed to fetch member profile:', error.message);
    }

    if (!currentUser) {
      setMember(null);
      return;
    }

    const { data: createdMember, error: createError } = await supabase
      .from('members')
      .insert({
        user_id: userId,
        full_name:
          String(currentUser.user_metadata?.full_name || '').trim() ||
          String(currentUser.email || '').split('@')[0] ||
          'Member',
        email: String(currentUser.email || '').trim() || 'unknown@example.com',
        phone: String(currentUser.user_metadata?.phone || '').trim() || 'N/A',
        address: String(currentUser.user_metadata?.address || '').trim(),
      })
      .select('*')
      .single();

    if (createError) {
      console.warn('Failed to create member profile:', createError.message);
      setMember(null);
      return;
    }

    setMember(createdMember);
  };

  const fetchAdminUser = async (userId: string) => {
    const { data } = await supabase
      .from('admin_users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setAdminUser(data ?? null);
  };

  const refreshMember = async () => {
    if (user) await fetchMember(user.id);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        const recovered = await recoverFromInvalidRefreshToken(error.message);
        if (!recovered) {
          console.warn('Failed to restore auth session:', error.message);
        }
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchMember(session.user.id, session.user);
        await fetchAdminUser(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchMember(session.user.id, session.user);
          await fetchAdminUser(session.user.id);
        } else {
          setMember(null);
          setAdminUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (
    email: string,
    password: string,
    profile: { full_name: string; phone: string; address: string }
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

  return (
    <AuthContext.Provider
      value={{ session, user, member, adminUser, loading, signIn, signUp, signOut, refreshMember }}
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
