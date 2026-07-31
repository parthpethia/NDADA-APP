import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured, supabase } from './supabase';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Account, AdminUser } from '@/types';
import { fetchUserProfile, UserProfileResponse } from './queries';
import { cacheClear } from './queryCache';
import { warmStaticDataCache } from './staticDataCache';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  member: Account | null;
  adminUser: AdminUser | null;
  loading: boolean;
  profileReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, profile: {
    full_name: string;
    phone: string;
    address: string;
    district: string;
    privacy_policy_accepted: boolean;
    terms_accepted: boolean;
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
  const [user, _setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const setUser = useCallback((u: User | null) => {
    userRef.current = u;
    _setUser(u);
  }, []);

  const [member, setMember] = useState<Account | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  // profileReady: false while profile (member + admin) is being fetched after
  // a session change. Routing guards must wait for this before redirecting so
  // that adminUser is resolved before any navigation decision.
  const [profileReady, _setProfileReady] = useState(false);
  const profileReadyRef = useRef(false);
  const setProfileReady = useCallback((val: boolean) => {
    profileReadyRef.current = val;
    _setProfileReady(val);
  }, []);

  // In-flight request deduplication
  const profileRequestRef = useRef<Promise<void> | null>(null);

  // Admin status cache: avoids re-querying admin_users for known non-admins.
  // Key: user_id, Value: AdminUser | null. Cleared on sign-out.
  const adminCacheRef = useRef<Map<string, AdminUser | null>>(new Map());

  // Broader check for invalid/expired session errors from Supabase
  const isInvalidSessionError = (message?: string | null): boolean => {
    const errorMessage = String(message || '').toLowerCase();
    // Exclude network/connection/timeout errors explicitly
    if (
      errorMessage.includes('fetcherror') ||
      errorMessage.includes('network request failed') ||
      errorMessage.includes('failed to fetch') ||
      errorMessage.includes('network error') ||
      errorMessage.includes('networkerror') ||
      errorMessage.includes('load failed') ||
      errorMessage.includes('offline') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('abort') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('etimedout')
    ) {
      return false;
    }
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
    // Clear the invalid session from Supabase client.
    // Wrap in a timeout so we don't hang if signOut itself deadlocks.
    try {
      await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timed out')), 3000)),
      ]);
    } catch (signOutError) {
      // Silently fail - we're in recovery mode
    }

    // Manually clear Supabase session keys from storage.
    // Only target keys with the 'sb-' prefix to avoid wiping unrelated data.
    if (typeof localStorage !== 'undefined') {
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Silently fail
      }
    }
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sbKeys = keys.filter(k => k.startsWith('sb-'));
      if (sbKeys.length > 0) {
        await Promise.all(sbKeys.map(k => AsyncStorage.removeItem(k)));
      }
    } catch (e) {
      // Silently fail
    }

    setSession(null);
    setUser(null);
    setMember(null);
    setAdminUser(null);
    setProfileReady(true);
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

    // Set admin status unconditionally from profile RPC result
    const cachedAdmin = profile?.admin ?? null;
    adminCacheRef.current.set(userId, cachedAdmin);
    setAdminUser(cachedAdmin);

    if (profile?.account) {
      // Merge lightweight fields into the Account type.
      // Existing full-profile fields (from a prior refreshMember) are preserved
      // by spreading the current member first.
      setMember(prev => ({
        ...(prev && prev.user_id === userId ? prev : {} as Account),
        ...profile.account,
      } as Account));
      return;
    }

    // No account found — try to create one if we have user metadata
    if (!currentUser) {
      setMember(null);
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
      return;
    }

    setMember(createdAccount as unknown as Account);
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
    if (!userRef.current) return;
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select(ACCOUNT_SELECT_COLUMNS)
        .eq('user_id', userRef.current.id)
        .maybeSingle();

      if (error) {
        console.warn('refreshMember error:', error.message);
        return;
      }
      if (data) {
        setMember(data as unknown as Account);
      } else {
        console.log('refreshMember: profile not found, attempting auto-creation/reload fallback');
        await loadUserProfile(userRef.current.id, userRef.current);
      }
    } catch (err) {
      console.warn('refreshMember error:', err);
    }
  }, [loadUserProfile]);

  // Helper: load user profile data with error recovery
  const loadProfile = async (currentSession: Session): Promise<boolean> => {
    try {
      await loadUserProfile(currentSession.user.id, currentSession.user);
      return true;
    } catch (err: any) {
      console.warn('Auth: profile fetch failed:', err);
      if (isInvalidSessionError(err?.message)) {
        await clearInvalidSession();
        return false;
      }
      // Preserve session on non-auth/network errors
      return true;
    }
  };

  useEffect(() => {
    // Track whether initializeAuth has completed to avoid double-loading
    let initialized = false;
    // Track whether profile was already loaded by initializeAuth
    // to skip the duplicate load from onAuthStateChange(INITIAL_SESSION)
    let profileLoaded = false;

    // React Native AppState listener for auto-refresh handling across APK lifecycle
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else if (state === 'background' || state === 'inactive') {
        supabase.auth.stopAutoRefresh();
      }
    });

    const initializeAuth = async () => {
      try {
        // Wrap getSession in a timeout — if the SDK's internal token refresh
        // hangs (e.g. stale refresh token + lock contention), fail fast rather
        // than leaving the user on the loading screen.
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getSession timed out')), 15000)
          ),
        ]);
        const { data: { session: currentSession }, error } = sessionResult;

        if (error) {
          if (isInvalidSessionError(error.message)) {
            console.warn('Auth: clearing invalid session on init:', error.message);
            await clearInvalidSession();
            return;
          } else {
            console.warn('Auth: non-fatal session restore warning (preserving state):', error.message);
          }
        }

        let effectiveSession = currentSession;
        // If currentSession is null from getSession, check if stored session exists in AsyncStorage directly
        // to prevent false logouts on APK cold boot timing glitches
        if (!effectiveSession) {
          try {
            const keys = await AsyncStorage.getAllKeys();
            const sbKey = keys.find(k => k.startsWith('sb-') && k.includes('auth-token'));
            if (sbKey) {
              const rawStored = await AsyncStorage.getItem(sbKey);
              if (rawStored) {
                const parsedStored = JSON.parse(rawStored);
                if (parsedStored?.access_token && parsedStored?.refresh_token && parsedStored?.user) {
                  console.log('Auth: recovered stored session from AsyncStorage fallback on init');
                  const { data: setSessionData, error: setSessionError } = await supabase.auth.setSession({
                    access_token: parsedStored.access_token,
                    refresh_token: parsedStored.refresh_token,
                  });
                  if (!setSessionError && setSessionData?.session) {
                    effectiveSession = setSessionData.session;
                  } else {
                    effectiveSession = parsedStored as Session;
                  }
                }
              }
            }
          } catch (storageErr) {
            console.warn('Auth: AsyncStorage raw session fallback check failed:', storageErr);
          }
        }

        setSession(effectiveSession);
        setUser(effectiveSession?.user ?? null);

        // Pre-warm static data cache in background on app launch
        warmStaticDataCache().catch(() => {});

        if (effectiveSession?.user) {
          const ok = await loadProfile(effectiveSession);
          if (ok) profileLoaded = true;
        }
      } catch (err: any) {
        console.warn('Auth initialization error:', err);
        if (isInvalidSessionError(err?.message)) {
          await clearInvalidSession();
        } else {
          console.warn('Auth init failed due to non-auth error (e.g. network/timeout), preserving session');
        }
      } finally {
        initialized = true;
        setProfileReady(true);
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
        const previousUserId = userRef.current?.id;
        const newUserId = newSession?.user?.id;
        const isSameUser = !!(previousUserId && newUserId && previousUserId === newUserId);

        // Skip profile fetch for INITIAL_SESSION if initializeAuth already loaded it.
        // This prevents the double-fetch that fires 4 queries instead of 2.
        if (event === 'INITIAL_SESSION' && profileLoaded) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (!initialized) {
            initialized = true;
            setProfileReady(true);
            setLoading(false);
          }
          return;
        }

        // If it's a token refresh for the SAME user and profile is ALREADY ready,
        // do not reset profileReady to false (which would trigger LoadingScreen & unmount the UI).
        if (event === 'TOKEN_REFRESHED' && isSameUser && profileReadyRef.current) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (!initialized) {
            initialized = true;
            setProfileReady(true);
            setLoading(false);
          }
          return;
        }

        // During password recovery, the reset-password page calls setSession()
        // with the recovery tokens, and then updateUser() which triggers USER_UPDATED.
        // Loading the full user profile here is unnecessary and can trigger auth errors
        // that cascade into clearInvalidSession() → signOut(), stealing the GoTrue lock
        // and producing the "lock not released" + AbortError / deadlock in the console.
        //
        // Therefore, we skip profile loading for ALL auth events while on the reset-password page.
        const isResetPasswordPage =
          typeof window !== 'undefined' &&
          window.location.pathname.includes('reset-password');

        if (event === 'PASSWORD_RECOVERY' || isResetPasswordPage) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (!newSession?.user) {
            setMember(null);
            setAdminUser(null);
          }
          setProfileReady(true);
          if (!initialized) {
            initialized = true;
            setLoading(false);
          }
          return;
        }

        // FIX: Set profileReady to false BEFORE session/user to prevent a render
        // where session is set but adminUser is still null (admin login race condition).
        // This ensures routing guards see profileReady=false in the same render batch.
        if (newSession?.user && (!isSameUser || !profileReadyRef.current)) {
          setProfileReady(false);
        }

        // Now set session/user — any render from here will already see profileReady=false
        setSession(newSession);
        setUser(newSession?.user ?? null);

        // Load profile directly (no setTimeout needed — GoTrue locks are already bypassed
        // in supabase.ts via the custom lock implementation).
        if (newSession?.user) {
          try {
            if (!isSameUser || !profileReadyRef.current) {
              await loadUserProfile(newSession.user.id, newSession.user);
            }
          } catch (err: any) {
            console.warn('Auth: onAuthStateChange profile fetch failed:', err);
            // Only clear session if error is explicitly an invalid session error (not a transient network glitch)
            if (isInvalidSessionError(err?.message)) {
              await clearInvalidSession();
            }
          }
        } else {
          setMember(null);
          setAdminUser(null);
        }

        // Profile loading is done — allow routing guards to proceed
        setProfileReady(true);

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
      appStateSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      let result = await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        const msg = String(result.error.message || '').toLowerCase();
        const isNetworkErr =
          msg.includes('failed to fetch') ||
          msg.includes('network request failed') ||
          msg.includes('fetcherror') ||
          msg.includes('typeerror') ||
          msg.includes('network error');

        if (isNetworkErr) {
          // Pause 800ms and retry signInWithPassword once before returning network error
          await new Promise((resolve) => setTimeout(resolve, 800));
          result = await supabase.auth.signInWithPassword({ email, password });
        }
      }

      if (result.error) {
        const msg = String(result.error.message || '').toLowerCase();
        if (
          msg.includes('failed to fetch') ||
          msg.includes('network request failed') ||
          msg.includes('fetcherror') ||
          msg.includes('typeerror') ||
          msg.includes('network error')
        ) {
          // On Android, the auth request may have reached the server and the
          // session was created, but the HTTP response never arrived at the
          // client.  Supabase's internal auth state listener may have already
          // picked up the session and persisted it.  Before returning a
          // misleading network error, check if we actually have a valid session.
          try {
            const { data: { session: recoveredSession } } = await supabase.auth.getSession();
            if (recoveredSession?.user) {
              // Session exists — the sign-in actually succeeded despite the
              // network error on the response side.  Return success so the UI
              // navigates to the dashboard instead of showing an error.
              return { error: null };
            }
          } catch {
            // getSession itself failed — fall through to the error below.
          }
          return {
            error:
              'Network error while contacting Supabase (unable to fetch). Please check your internet / mobile data connection and tap Sign In again.',
          };
        }
        return { error: result.error.message };
      }
      return { error: null };
    } catch (e: any) {
      if (!isSupabaseConfigured) {
        return {
          error:
            'Supabase is not configured for this deployment. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in Vercel Environment Variables, then redeploy.',
        };
      }
      // Same recovery check for catch-level network errors
      try {
        const { data: { session: recoveredSession } } = await supabase.auth.getSession();
        if (recoveredSession?.user) {
          return { error: null };
        }
      } catch {
        // getSession itself failed — fall through to the error below.
      }
      return {
        error:
          'Network error while contacting Supabase (unable to fetch). Please check your internet / mobile data connection and tap Sign In again.',
      };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    profile: {
      full_name: string;
      phone: string;
      address: string;
      district: string;
      privacy_policy_accepted: boolean;
      terms_accepted: boolean;
    }
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
          privacy_policy_accepted: profile.privacy_policy_accepted,
          terms_accepted: profile.terms_accepted,
        },
      },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Signup failed' };

    return { error: null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Auth: signOut error, forcing local signout:', error);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
    } finally {
      setSession(null);
      setUser(null);
      setMember(null);
      setAdminUser(null);
      setProfileReady(true);
      // Clear admin cache on sign-out so a different user gets a fresh lookup
      adminCacheRef.current.clear();
      // Clear in-flight profile request to prevent stale promise on re-login
      profileRequestRef.current = null;
      // Clear query cache to prevent stale data for the next user
      cacheClear();
    }
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
      value={{ session, user, member, adminUser, loading, profileReady, signIn, signUp, signOut, refreshMember, resetPassword }}
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
