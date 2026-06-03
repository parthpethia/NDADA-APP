import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Missing Supabase env vars. Create a .env file from .env.example:\n' +
    '  cp .env.example .env\n' +
    'Then fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY'
  );
}

const storage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => {
        try { return Promise.resolve(localStorage.getItem(key)); }
        catch { return Promise.resolve(null); }
      },
      setItem: (key: string, value: string) => {
        try { localStorage.setItem(key, value); }
        catch {}
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        try { localStorage.removeItem(key); }
        catch {}
        return Promise.resolve();
      },
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value).then(() => {}),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key).then(() => {}),
    };

const createSupabaseClient = () =>
  createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Bypass navigator.locks on web to prevent tab-close/background deadlocks
        ...(Platform.OS === 'web' && {
          lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
            return await fn();
          },
        }),
      },
    }
  );

type GlobalWithSupabase = typeof globalThis & {
  __ndadaSupabase__?: SupabaseClient;
};

const globalScope = globalThis as GlobalWithSupabase;

export const supabase =
  Platform.OS === 'web'
    ? (globalScope.__ndadaSupabase__ ??= createSupabaseClient())
    : createSupabaseClient();

// When landing on a password-recovery URL, clear any stale session from
// localStorage BEFORE the AuthProvider calls getSession(). This prevents
// Supabase's internal auto-refresh from firing a 400 "Invalid Refresh Token"
// error against an expired token that was left over from a previous login.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const hash = window.location.hash;
  if (hash && hash.includes('type=recovery')) {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') && key.includes('auth-token')) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // Silently ignore — storage may be unavailable in some environments
    }
  }
}
