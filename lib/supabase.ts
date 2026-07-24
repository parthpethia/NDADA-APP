import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const CHUNK_SIZE = 1800;

/**
 * Legacy SecureStore getter with chunk & sentinel protection.
 * Will NEVER return sentinel strings like "NDADA_CHUNKED_SESSION" or invalid JSON.
 */
const getSecureStoreLegacy = async (key: string): Promise<string | null> => {
  try {
    const manifest = await SecureStore.getItemAsync(`${key}_manifest`);
    if (manifest) {
      try {
        const parsed = JSON.parse(manifest);
        if (parsed && typeof parsed.chunks === 'number' && parsed.chunks > 0) {
          let value = '';
          for (let i = 0; i < parsed.chunks; i++) {
            const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
            if (!chunk) return null;
            value += chunk;
          }
          return value;
        }
      } catch {
        // Corrupt manifest, fall through
      }
    }
    const val = await SecureStore.getItemAsync(key);
    // CRITICAL: NEVER return sentinel marker string to Supabase
    if (val === 'NDADA_CHUNKED_SESSION' || (val && val.startsWith('NDADA_CHUNKED'))) {
      return null;
    }
    return val;
  } catch (err) {
    console.warn('[SecureStore] Legacy getter error:', err);
    return null;
  }
};

/**
 * Legacy SecureStore remover to clean up chunked keys.
 */
const removeSecureStoreLegacy = async (key: string): Promise<void> => {
  try {
    const manifest = await SecureStore.getItemAsync(`${key}_manifest`);
    if (manifest) {
      try {
        const { chunks } = JSON.parse(manifest);
        if (typeof chunks === 'number') {
          for (let i = 0; i < chunks; i++) {
            await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
          }
        }
      } catch {}
      await SecureStore.deleteItemAsync(`${key}_manifest`);
    }
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn('[SecureStore] Legacy remove error:', err);
  }
};

/**
 * Fail-safe native storage adapter:
 * 1. Primary storage: AsyncStorage (fast, reliable across APK restarts, no size limit).
 * 2. Fallback: SecureStore (migrates existing stored sessions to AsyncStorage automatically).
 */
const getItemNative = async (key: string): Promise<string | null> => {
  try {
    // 1. Try AsyncStorage first (authoritative storage engine for native APK)
    const value = await AsyncStorage.getItem(key);
    if (value && value !== 'NDADA_CHUNKED_SESSION' && !value.startsWith('NDADA_CHUNKED')) {
      return value;
    }

    // 2. Fallback to SecureStore for legacy sessions (one-time migration)
    const legacyValue = await getSecureStoreLegacy(key);
    if (legacyValue) {
      // Migrate to AsyncStorage for fast, reliable access on next boot
      try {
        await AsyncStorage.setItem(key, legacyValue);
        // Immediately purge legacy SecureStore key so it cannot become stale
        await removeSecureStoreLegacy(key);
      } catch {}
      return legacyValue;
    }

    return null;
  } catch (err) {
    console.warn('[Storage] getItem error:', err);
    return await getSecureStoreLegacy(key);
  }
};

const setItemNative = async (key: string, value: string): Promise<void> => {
  try {
    // Save to AsyncStorage (primary authoritative storage)
    await AsyncStorage.setItem(key, value);

    // Clean up any stale legacy SecureStore entries to prevent future token collisions
    await removeSecureStoreLegacy(key);
  } catch (err) {
    console.warn('[Storage] setItem error:', err);
  }
};

const removeItemNative = async (key: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn('[Storage] removeItem error:', err);
  }
  await removeSecureStoreLegacy(key);
};

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
      getItem: (key: string) => getItemNative(key),
      setItem: (key: string, value: string) => setItemNative(key, value),
      removeItem: (key: string) => removeItemNative(key),
    };

/**
 * Robust fetch wrapper with exponential backoff retries.
 * Automatically retries transient network errors (Failed to fetch, network request failed,
 * connection drops, offline) and transient gateway/server errors (429, 500, 502, 503, 504) up to maxRetries.
 */
const fetchWithRetry: typeof fetch = async (url, options) => {
  const maxRetries = 4;
  let delay = 400; // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let controller: AbortController | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    // Create per-attempt 15-second timeout if signal is not already aborted
    if (!options?.signal?.aborted && typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = setTimeout(() => {
        try { controller?.abort(); } catch {}
      }, 15000);
    }

    const effectiveOptions: RequestInit = {
      ...options,
      signal: options?.signal || controller?.signal,
    };

    try {
      const response = await fetch(url as any, effectiveOptions);
      if (timeoutId) clearTimeout(timeoutId);

      const isRetryableStatus =
        response.status === 429 ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504;

      if (isRetryableStatus && attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2.5;
        continue;
      }
      return response;
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);

      // If caller explicitly aborted the request, do not retry
      if (options?.signal?.aborted) {
        throw err;
      }

      const errMsg = String(err?.message || err || '').toLowerCase();
      const errName = String(err?.name || '');
      const isTimeout = errName === 'AbortError' || errMsg.includes('aborted') || errMsg.includes('timeout');
      const isNetworkError =
        isTimeout ||
        errName === 'TypeError' ||
        errName === 'FetchError' ||
        errName === 'NetworkError' ||
        errName === 'FunctionsFetchError' ||
        errMsg.includes('failed to fetch') ||
        errMsg.includes('network request failed') ||
        errMsg.includes('network error') ||
        errMsg.includes('networkerror') ||
        errMsg.includes('load failed') ||
        errMsg.includes('offline') ||
        errMsg.includes('failed to send a request') ||
        errMsg.includes('econnreset') ||
        errMsg.includes('enotfound') ||
        errMsg.includes('etimedout') ||
        errMsg.includes('net::') ||
        errMsg.includes('socket');

      if (isNetworkError && attempt < maxRetries - 1) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(`[Supabase Fetch] Retrying network attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`, errMsg);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2.5;
        continue;
      }
      throw err;
    }
  }
  return fetch(url as any, options);
};

const createSupabaseClient = () =>
  createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key',
    {
      global: {
        fetch: fetchWithRetry,
      },
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Bypass navigator.locks on all platforms (web & native) to prevent tab-close/background deadlocks and native cold-boot lock timeouts
        lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
          return await fn();
        },
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
