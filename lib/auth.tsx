import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import { Account, AdminUser } from '@/types';
import { fetchUserProfile, UserProfileResponse } from './queries';
import { cacheClear } from './queryCache';

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

// Full column list — only used by refreshMember/loadFullProfile
// to backfill the complete Account type after initial lightweight load.
const ACCOUNT_SELECT_COLUMNS = [
  'id', 'user_id',
  'full_name', 'email', 'phone', 'address', 'district', 'id_proof_url',
  'firm_name', 'firm_type', 'license_number', 'registration_number',
  'gst_number', 'firm_address', 'contact_phone', 'contact_email',
  'firm_pin_code', 'partner_proprietor_name', 'whatsapp_number',
  'aadhaar_card_number', 'ifms_number',
  'seed_cotton_license_number', 'seed_cotton_license_expiry', 'sarthi_id_cotton',
  'seed_general_license_number', 'seed_general_license_expiry', 'sarthi_id_general',
  'pesticide_license_number', 'pesticide_license_expiry',
  'fertilizer_license_number', 'fertilizer_license_expiry',
  'residence_address', 'residence_pin_code',
  'applicant_photo_url', 'documents_urls',
  'membership_id', 'payment_status', 'payment_method',
  'cash_payment_verified', 'cash_payment_verified_by',
  'cash_payment_verified_at', 'cash_payment_notes',
  'approval_status', 'account_status', 'rejection_reason',
  'status_timeline', 'reviewed_by', 'reviewed_at',
  'created_at', 'updated_at',
].join(', ');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Account | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  // In-flight request deduplication
  const profileRequestRef = useRef<Promise<void> | null>(null);

  // Admin status cache: avoids re-querying admin_users for known non-admins.
  // Key: user_id, Value: AdminUser | null. Cleared on sign-out.
  const adminCacheRef = useRef<Map<string, AdminUser | null>>(new Map());

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

  /**
   * Core profile loader — single RPC call replaces fetchMember + fetchAdminUser.
   *
   * Flow:
   * 1. Call get_user_profile() RPC → returns lightweight account + admin in one trip.
   * 2. If account exists, merge into member state (keeping any existing full-profile
   *    fields from a prior loadFullProfile call).
   * 3. If admin is returned, cache it. If null, cache that too (so we skip next time).
   * 4. If no account exists and currentUser is provided, fall back to account creation.
   */
  const loadUserProfileCore = useCallback(async (userId: string, currentUser?: User | null) => {
    // Try the unified RPC first
    const { data: profile, error: rpcError } = await fetchUserProfile(userId);

    if (rpcError) {
      if (isInvalidSessionError(rpcError.message)) {
        throw new Error(`Auth error during profile fetch: ${rpcError.message}`);
      }
      console.warn('get_user_profile RPC failed, falling back to separate queries:', rpcError.message);
      // Fall back to legacy separate queries if RPC doesn't exist yet
      // (e.g., migration not yet applied)
      await loadUserProfileLegacy(userId, currentUser);
      return;
    }

    if (profile?.account) {
      // Merge lightweight fields into the Account type.
      // Existing full-profile fields (from a prior refreshMember) are preserved
      // by spreading the current member first.
      setMember(prev => ({
        ...(prev && prev.user_id === userId ? prev : {} as Account),
        ...profile.account,
      } as Account));

      // Cache admin status
      const cachedAdmin = profile.admin ?? null;
      adminCacheRef.current.set(userId, cachedAdmin);
      setAdminUser(cachedAdmin);
      return;
    }

    // No account found — try to create one if we have user metadata
    if (!currentUser) {
      setMember(null);
      setAdminUser(null);
      return;
    }

    // Account auto-creation fallback (same logic as before)
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
      .select(ACCOUNT_SELECT_COLUMNS)
      .single();

    if (createError) {
      console.error('Failed to create account profile:', createError.message, createError.details, createError.hint);
      setMember(null);
      setAdminUser(null);
      return;
    }

    setMember(createdAccount as unknown as Account);
    // New account — definitely not an admin
    adminCacheRef.current.set(userId, null);
    setAdminUser(null);
  }, []);

  /**
   * Legacy fallback: separate queries for when the RPC migration isn't deployed yet.
   * This ensures zero downtime during the migration rollout.
   */
  const loadUserProfileLegacy = async (userId: string, currentUser?: User | null) => {
    // Fetch account
    const { data: accountData, error: accountError } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();

    if (accountError) {
      if (isInvalidSessionError(accountError.message)) {
        throw new Error(`Auth error during fetch: ${accountError.message}`);
      }
      console.warn('Failed to fetch account profile:', accountError.message);
    }

    if (accountData) {
      setMember(accountData as unknown as Account);
    } else if (currentUser) {
      // Account creation fallback
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
        .select(ACCOUNT_SELECT_COLUMNS)
        .single();

      if (createError) {
        console.error('Failed to create account profile:', createError.message, createError.details, createError.hint);
        setMember(null);
      } else {
        setMember(createdAccount as unknown as Account);
      }
    } else {
      setMember(null);
    }

    // Check admin cache first
    if (adminCacheRef.current.has(userId)) {
      setAdminUser(adminCacheRef.current.get(userId) ?? null);
      return;
    }

    // Fetch admin status
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      try {
        console.log('Auth: fetching admin user for', userId, 'from', (supabase as any)?.supabaseUrl);
      } catch {}
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('id, user_id, email, role, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminError) {
      if (isInvalidSessionError(adminError.message)) {
        throw new Error(`Auth error during admin fetch: ${adminError.message}`);
      }
      console.warn('Failed to fetch admin user:', adminError.message);
    }

    const resolvedAdmin = adminData ?? null;
    adminCacheRef.current.set(userId, resolvedAdmin);
    setAdminUser(resolvedAdmin);

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('Auth: admin user lookup result', resolvedAdmin);
    }
  };

  // Deduplicated wrapper: prevents concurrent profile load calls
  const loadUserProfile = useCallback(async (userId: string, currentUser?: User | null) => {
    if (profileRequestRef.current) return profileRequestRef.current;
    const promise = loadUserProfileCore(userId, currentUser).finally(() => {
      profileRequestRef.current = null;
    });
    profileRequestRef.current = promise;
    return promise;
  }, [loadUserProfileCore]);

  // refreshMember: re-fetches the FULL account (all 47 columns) from the database.
  // This is used after profile edits, form submissions, payment updates, etc.
  const refreshMember = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('accounts')
      .select(ACCOUNT_SELECT_COLUMNS)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('refreshMember error:', error.message);
      return;
    }
    if (data) {
      setMember(data as unknown as Account);
    }
  }, [user]);

  // Helper: load user profile data with error recovery
  const loadProfile = async (currentSession: Session): Promise<boolean> => {
    try {
      await loadUserProfile(currentSession.user.id, currentSession.user);
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
    // Track whether profile was already loaded by initializeAuth
    // to skip the duplicate load from onAuthStateChange(INITIAL_SESSION)
    let profileLoaded = false;

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
          const ok = await loadProfile(currentSession);
          if (ok) profileLoaded = true;
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

        // Skip profile fetch for INITIAL_SESSION if initializeAuth already loaded it.
        // This prevents the double-fetch that fires 4 queries instead of 2.
        if (event === 'INITIAL_SESSION' && profileLoaded) {
          if (!initialized) {
            initialized = true;
            setLoading(false);
          }
          return;
        }

        // During password recovery, the reset-password page calls setSession()
        // with the recovery tokens. Loading the full user profile here is
        // unnecessary and can trigger auth errors that cascade into
        // clearInvalidSession() → signOut(), stealing the GoTrue lock and
        // producing the "lock not released" + AbortError in the console.
        //
        // Supabase may fire PASSWORD_RECOVERY and/or SIGNED_IN for the same
        // setSession() call depending on the version. Skip profile loading
        // for both when we're on the reset-password page.
        if (event === 'PASSWORD_RECOVERY') {
          return;
        }
        if (
          event === 'SIGNED_IN' &&
          typeof window !== 'undefined' &&
          window.location.pathname.includes('reset-password')
        ) {
          return;
        }

        if (newSession?.user) {
          try {
            await loadUserProfile(newSession.user.id, newSession.user);
          } catch (err) {
            console.warn('Auth: onAuthStateChange profile fetch failed:', err);
            // If profile loading fails due to auth error, clear session
            await clearInvalidSession();
          }
        } else {
          setMember(null);
          setAdminUser(null);
        }

        // If the listener fires before initializeAuth finishes,
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
    // Clear admin cache on sign-out so a different user gets a fresh lookup
    adminCacheRef.current.clear();
    // Clear query cache to prevent stale data for the next user
    cacheClear();
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
