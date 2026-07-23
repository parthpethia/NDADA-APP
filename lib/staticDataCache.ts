/**
 * Static Data Cache — Persistent AsyncStorage Cache for Rarely-Changing Data
 *
 * Stores static lists (districts, firm types, constants) in AsyncStorage
 * so that repeat screen navigations never hit Supabase for data that
 * only changes when the app is updated.
 *
 * Cache hierarchy:
 * 1. In-memory Map (instant, lost on app restart)
 * 2. AsyncStorage (fast, survives restarts, 24h TTL)
 * 3. Bundled constants (fallback, always available)
 *
 * Usage:
 *   const districts = await getCachedStaticData('districts', () => DISTRICTS);
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'ndada_static_';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

// Current schema version — bump when static data structures change
const SCHEMA_VERSION = 1;

// In-memory layer (hot cache)
const memoryCache = new Map<string, CachedEntry<unknown>>();

/**
 * Get cached static data with the 3-layer cache hierarchy.
 *
 * @param key       Unique cache key (e.g. 'districts', 'firm_types')
 * @param fallback  Function that returns the default/bundled data
 * @param ttlMs     Time-to-live in ms before data is considered stale (default 24h)
 * @returns         The cached data (from memory, AsyncStorage, or fallback)
 */
export async function getCachedStaticData<T>(
  key: string,
  fallback: () => T,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cacheKey = `${CACHE_PREFIX}${key}`;

  // 1. Check in-memory cache (instant)
  const memEntry = memoryCache.get(cacheKey) as CachedEntry<T> | undefined;
  if (memEntry && memEntry.version === SCHEMA_VERSION) {
    const age = Date.now() - memEntry.timestamp;
    if (age < ttlMs) {
      return memEntry.data;
    }
  }

  // 2. Check AsyncStorage (fast, survives restarts)
  try {
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const parsed: CachedEntry<T> = JSON.parse(stored);
      if (parsed.version === SCHEMA_VERSION) {
        // Populate memory cache
        memoryCache.set(cacheKey, parsed);

        const age = Date.now() - parsed.timestamp;
        if (age < ttlMs) {
          return parsed.data;
        }
        // Stale but usable — serve it and let caller refresh if needed
        return parsed.data;
      }
    }
  } catch (err) {
    // AsyncStorage read failed — fall through to bundled fallback
    if (__DEV__) {
      console.warn(`[StaticDataCache] Failed to read ${key} from AsyncStorage:`, err);
    }
  }

  // 3. Fallback to bundled constants
  const data = fallback();

  // Persist to both layers for next access
  const entry: CachedEntry<T> = {
    data,
    timestamp: Date.now(),
    version: SCHEMA_VERSION,
  };
  memoryCache.set(cacheKey, entry);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (err) {
    if (__DEV__) {
      console.warn(`[StaticDataCache] Failed to write ${key} to AsyncStorage:`, err);
    }
  }

  return data;
}

/**
 * Pre-warm the static data cache on app launch.
 * Populates memory cache from AsyncStorage or bundled defaults.
 * Call this once during app initialization (e.g. after auth restore).
 */
export async function warmStaticDataCache(): Promise<void> {
  // Import constants inline to avoid circular dependencies
  const { DISTRICTS } = require('@/constants/districts');
  const { FIRM_TYPES } = require('@/constants');

  await Promise.all([
    getCachedStaticData('districts', () => DISTRICTS),
    getCachedStaticData('firm_types', () => FIRM_TYPES),
  ]);
}

/**
 * Update a static data entry (e.g. after fetching fresh data from the server).
 * Updates both memory and AsyncStorage layers.
 */
export async function updateStaticDataCache<T>(key: string, data: T): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  const entry: CachedEntry<T> = {
    data,
    timestamp: Date.now(),
    version: SCHEMA_VERSION,
  };

  memoryCache.set(cacheKey, entry);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (err) {
    if (__DEV__) {
      console.warn(`[StaticDataCache] Failed to update ${key}:`, err);
    }
  }
}

/**
 * Clear all static data caches (e.g. on sign-out or app update).
 */
export async function clearStaticDataCache(): Promise<void> {
  memoryCache.clear();

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const staticKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (staticKeys.length > 0) {
      await Promise.all(staticKeys.map((k) => AsyncStorage.removeItem(k)));
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[StaticDataCache] Failed to clear AsyncStorage:', err);
    }
  }
}
