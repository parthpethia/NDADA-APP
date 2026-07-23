/**
 * Lightweight In-Memory + Persistent Query Cache
 *
 * Prevents redundant Supabase queries when components re-mount
 * (e.g. tab switching, back navigation). Entries expire after a
 * configurable TTL (default 60s).
 *
 * Two cache layers:
 * 1. In-memory Map — instant access, lost on app restart
 * 2. AsyncStorage (opt-in) — survives restarts, serves stale-while-revalidate
 *
 * Not a full-featured cache — intentionally simple:
 * - No LRU eviction (dashboard has <10 cache keys)
 * - Cleared entirely on sign-out
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL_MS = 60_000; // 60 seconds
const PERSISTENT_PREFIX = 'ndada_qc_';

const cache = new Map<string, CacheEntry>();

const MAX_CACHE_ENTRIES = 100;

/**
 * Get a cached value if it exists and hasn't expired.
 * Returns `undefined` if the key is missing or stale.
 */
export function cacheGet<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): T | undefined {
  if (!key || typeof key !== 'string') return undefined;
  const entry = cache.get(key);
  if (!entry) return undefined;

  const age = Date.now() - entry.timestamp;
  if (age > ttlMs) {
    cache.delete(key);
    return undefined;
  }

  return entry.data as T;
}

/**
 * Store a value in the cache with the current timestamp.
 */
export function cacheSet<T>(key: string, data: T): void {
  if (!key || typeof key !== 'string') return;
  // LRU eviction: remove the entry with the oldest timestamp when cap is reached
  if (cache.size >= MAX_CACHE_ENTRIES && !cache.has(key)) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, entry] of cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Remove a specific key from the cache.
 * Use after mutations (e.g. profile edit, payment) to force a fresh fetch.
 */
export function cacheInvalidate(key: string): void {
  if (!key || typeof key !== 'string') return;
  cache.delete(key);
  // Also remove persistent entry
  AsyncStorage.removeItem(`${PERSISTENT_PREFIX}${key}`).catch(() => {});
}

/**
 * Remove all keys matching a prefix.
 * Useful for invalidating all user-scoped caches at once.
 */
export function cacheInvalidatePrefix(prefix: string): void {
  if (!prefix || typeof prefix !== 'string') return;
  const keysToDelete: string[] = [];
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    cache.delete(key);
  }
}

/**
 * Clear the entire cache.
 * Called on sign-out to prevent stale data for the next user.
 */
export function cacheClear(): void {
  cache.clear();
  // Clear persistent entries
  AsyncStorage.getAllKeys()
    .then((keys) => {
      const persistentKeys = keys.filter((k) => k.startsWith(PERSISTENT_PREFIX));
      if (persistentKeys.length > 0) {
        return Promise.all(persistentKeys.map((k) => AsyncStorage.removeItem(k)));
      }
    })
    .catch(() => {});
}

/**
 * Build a cache key scoped to a specific user.
 */
export function cacheKey(namespace: string, userId: string): string {
  return `${namespace}:${userId}`;
}

// ─── Persistent Cache Layer ─────────────────────────────────
// Opt-in: only used for critical data (dashboard, profile)
// that should survive app restarts.

/**
 * Store data in both memory and AsyncStorage.
 * Use for critical data that should be available on cold boot.
 */
export async function cacheSetPersistent<T>(key: string, data: T): Promise<void> {
  // Always set in-memory first
  cacheSet(key, data);

  // Persist to AsyncStorage
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(`${PERSISTENT_PREFIX}${key}`, JSON.stringify(entry));
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[queryCache] Failed to persist cache entry:', key, err);
    }
  }
}

/**
 * Get cached data with persistent fallback.
 * 
 * Returns:
 * - Memory cache if available and fresh
 * - AsyncStorage cache if memory is empty (cold boot)
 * - undefined if nothing is cached
 * 
 * The `isStale` flag in the return value indicates whether the data
 * came from a stale persistent entry (caller should refresh in background).
 */
export async function cacheGetPersistent<T>(
  key: string,
  memoryTtlMs: number = DEFAULT_TTL_MS,
  persistentTtlMs: number = 300_000 // 5 minutes
): Promise<{ data: T; isStale: boolean } | undefined> {
  // 1. Try memory cache first (instant)
  const memResult = cacheGet<T>(key, memoryTtlMs);
  if (memResult !== undefined) {
    return { data: memResult, isStale: false };
  }

  // 2. Try AsyncStorage (cold boot)
  try {
    const stored = await AsyncStorage.getItem(`${PERSISTENT_PREFIX}${key}`);
    if (stored) {
      const entry: CacheEntry<T> = JSON.parse(stored);
      const age = Date.now() - entry.timestamp;

      // Populate memory cache
      cache.set(key, entry);

      // If within persistent TTL, it's fresh
      if (age < persistentTtlMs) {
        return { data: entry.data, isStale: false };
      }

      // Otherwise serve stale data (caller should refresh in background)
      return { data: entry.data, isStale: true };
    }
  } catch (err) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[queryCache] Failed to read persistent cache:', key, err);
    }
  }

  return undefined;
}
