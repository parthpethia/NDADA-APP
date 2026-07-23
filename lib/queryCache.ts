/**
 * Lightweight In-Memory Query Cache
 *
 * Prevents redundant Supabase queries when components re-mount
 * (e.g. tab switching, back navigation). Entries expire after a
 * configurable TTL (default 60s).
 *
 * Not a full-featured cache — intentionally simple:
 * - No persistence (cleared on app reload)
 * - No LRU eviction (dashboard has <10 cache keys)
 * - Cleared entirely on sign-out
 */

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const DEFAULT_TTL_MS = 60_000; // 60 seconds

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
}

/**
 * Build a cache key scoped to a specific user.
 */
export function cacheKey(namespace: string, userId: string): string {
  return `${namespace}:${userId}`;
}
