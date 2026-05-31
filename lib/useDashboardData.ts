/**
 * useDashboardData — Single-RPC dashboard data hook
 *
 * Replaces the 3-4 separate queries that previously fired on every
 * dashboard visit with a single `get_dashboard_data` RPC call.
 *
 * Features:
 * - 120-second in-memory cache (prevents re-fetch on tab switch / re-mount)
 * - Graceful fallback to separate queries if the RPC isn't deployed yet
 * - Pull-to-refresh invalidates cache before re-fetching
 * - Returns { account, certificate, unreadCount, loading, refresh }
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchDashboardData, DashboardDataResponse, fetchAccountCertificate } from '@/lib/queries';
import { cacheGet, cacheSet, cacheInvalidate, cacheKey } from '@/lib/queryCache';
import { Account, Certificate } from '@/types';

const CACHE_NS = 'dashboard';

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

  // Prevent duplicate in-flight requests
  const fetchingRef = useRef(false);

  const userId = user?.id;

  const fetchData = useCallback(async (skipCache = false) => {
    if (!userId || !member) {
      setLoading(false);
      return;
    }

    // Check cache first (unless explicitly skipped, e.g. pull-to-refresh)
    const key = cacheKey(CACHE_NS, userId);
    if (!skipCache) {
      const cached = cacheGet<DashboardDataResponse>(key, 120_000);
      if (cached) {
        setCertificate(cached.certificate);
        setUnreadCount(cached.unread_notification_count);
        setLoading(false);
        return;
      }
    }

    // Deduplicate concurrent calls
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      // Try the aggregate RPC first
      const { data, error } = await fetchDashboardData(userId);

      if (error) {
        console.warn('Dashboard RPC failed, falling back to separate queries:', error.message);
        // Fallback: fetch certificate separately (member is already in AuthProvider)
        await fallbackFetch(userId);
        return;
      }

      if (data) {
        cacheSet(key, data);
        setCertificate(data.certificate);
        setUnreadCount(data.unread_notification_count);
      }
    } catch (err) {
      console.warn('Dashboard data fetch failed:', err);
      await fallbackFetch(userId);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
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
      setCertificate(validCert);
    } catch (err) {
      console.warn('Fallback certificate fetch failed:', err);
    }
  };

  // Fetch on mount / when userId changes
  useEffect(() => {
    fetchData();
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
