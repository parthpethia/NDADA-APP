/**
 * useDashboardData — Single-RPC dashboard data hook with persistent caching
 *
 * Replaces the 3-4 separate queries that previously fired on every
 * dashboard visit with a single `get_dashboard_data` RPC call.
 *
 * Features:
 * - 120-second in-memory cache (prevents re-fetch on tab switch / re-mount)
 * - 5-minute persistent AsyncStorage cache (instant load on cold boot)
 * - Stale-while-revalidate: serves cached data immediately, refreshes in background
 * - Graceful fallback to separate queries if the RPC isn't deployed yet
 * - Pull-to-refresh invalidates cache before re-fetching
 * - Returns { account, certificate, unreadCount, loading, refresh }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchDashboardData, DashboardDataResponse, fetchAccountCertificate } from '@/lib/queries';
import { cacheGet, cacheSet, cacheInvalidate, cacheKey, cacheSetPersistent, cacheGetPersistent } from '@/lib/queryCache';
import { Account, Certificate } from '@/types';

const CACHE_NS = 'dashboard';
const MEMORY_TTL_MS = 120_000; // 2 minutes
const PERSISTENT_TTL_MS = 300_000; // 5 minutes

interface DashboardData {
  /** Account data merged with AuthProvider's member (dashboard fields take priority) */
  certificate: Certificate | null;
  /** Unread notification count from the aggregate RPC */
  unreadCount: number;
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Invalidate cache and re-fetch everything */
  refresh: () => Promise<void>;
}

export function useDashboardData(): DashboardData {
  const { user, member } = useAuth();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Prevent duplicate in-flight requests & unmounted state updates
  const fetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  const userId = user?.id;

  const fetchData = useCallback(async (skipCache = false) => {
    if (!userId || !member) {
      if (isMountedRef.current) setLoading(false);
      return;
    }

    const key = cacheKey(CACHE_NS, userId);

    // Check caches (unless explicitly skipped, e.g. pull-to-refresh)
    if (!skipCache) {
      // 1. Try in-memory cache (instant)
      const cached = cacheGet<DashboardDataResponse>(key, MEMORY_TTL_MS);
      if (cached) {
        if (isMountedRef.current) {
          setCertificate(cached.certificate);
          setUnreadCount(cached.unread_notification_count);
          setLoading(false);
        }
        return;
      }

      // 2. Try persistent cache (cold boot)
      try {
        const persistent = await cacheGetPersistent<DashboardDataResponse>(
          key, MEMORY_TTL_MS, PERSISTENT_TTL_MS
        );
        if (persistent) {
          if (isMountedRef.current) {
            setCertificate(persistent.data.certificate);
            setUnreadCount(persistent.data.unread_notification_count);
            setLoading(false);
          }
          // If data is stale, refresh in background (don't block render)
          if (persistent.isStale) {
            // Fire-and-forget background refresh
            fetchFromNetwork(key).catch(() => {});
          }
          return;
        }
      } catch {
        // Persistent cache unavailable, continue to network
      }
    }

    // Network fetch
    await fetchFromNetwork(key);
  }, [userId, member]);

  /**
   * Fetch fresh data from the network (RPC or fallback).
   * Updates both memory and persistent caches.
   */
  const fetchFromNetwork = useCallback(async (key: string) => {
    if (!userId || !member) return;

    // Deduplicate concurrent calls
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      // Try the aggregate RPC first
      const { data, error } = await fetchDashboardData(userId);

      if (error) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Dashboard RPC failed, falling back to separate queries:', error.message);
        }
        // Fallback: fetch certificate separately (member is already in AuthProvider)
        await fallbackFetch(userId);
        return;
      }

      if (data) {
        cacheSet(key, data);
        // Persist for cold boot
        cacheSetPersistent(key, data).catch(() => {});

        if (isMountedRef.current) {
          setCertificate(data.certificate);
          setUnreadCount(data.unread_notification_count);
        }
      }
    } catch (err) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Dashboard data fetch failed:', err);
      }
      await fallbackFetch(userId);
    } finally {
      fetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [userId, member]);

  /**
   * Fallback for when the RPC migration hasn't been applied yet.
   * Uses the existing separate query for certificate.
   * Notification count will come from the NotificationProvider.
   */
  const fallbackFetch = async (uid: string) => {
    try {
      if (!member) return;
      const { data: cert } = await fetchAccountCertificate(member.id);
      const validCert = cert?.certificate_url && cert?.certificate_id ? cert : null;
      if (isMountedRef.current) {
        setCertificate(validCert);
      }
      const fallbackData: DashboardDataResponse = {
        account: null,
        certificate: validCert,
        unread_notification_count: 0,
      };
      const key = cacheKey(CACHE_NS, uid);
      cacheSet(key, fallbackData);
      cacheSetPersistent(key, fallbackData).catch(() => {});
    } catch (err) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Fallback certificate fetch failed:', err);
      }
    }
  };

  // Fetch on mount / when userId changes
  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  const refresh = useCallback(async () => {
    if (userId) {
      cacheInvalidate(cacheKey(CACHE_NS, userId));
    }
    await fetchData(true);
  }, [userId, fetchData]);

  return {
    certificate,
    unreadCount,
    loading,
    refresh,
  };
}
