import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { initializeErrorTracker, setErrorUser, setupGlobalErrorHandlers } from '@/lib/errorTracking';

/**
 * Hook to initialize error tracking
 * Should be called once in the root layout or App component
 */
export function useErrorTracking() {
  const { user, session } = useAuth();

  useEffect(() => {
    // Initialize error tracking once
    initializeErrorTracker({
      enableRemoteTracking: process.env.NODE_ENV === 'production',
      enableLocalLogging: true,
      enableConsoleOutput: process.env.NODE_ENV === 'development',
    });

    // Setup global error handlers
    setupGlobalErrorHandlers();
  }, []);

  // Update user context when user changes
  useEffect(() => {
    if (user?.id) {
      setErrorUser(user.id, user.email);
    }
  }, [user?.id, user?.email]);

  // Return tracker instance for manual logging
  return null;
}

/**
 * Hook to capture errors with try-catch
 * Wraps async functions with error handling
 */
export function useErrorHandler() {
  const { user } = useAuth();
  const tracker = require('@/lib/errorTracking').getErrorTracker();

  const captureAsync = async <T,>(
    fn: () => Promise<T>,
    context: { action: string; [key: string]: any } = { action: 'Unknown' }
  ): Promise<{ data: T | null; error: any | null }> => {
    try {
      const data = await fn();
      return { data, error: null };
    } catch (error) {
      tracker.captureException(error, {
        ...context,
        userId: user?.id,
      });
      return { data: null, error };
    }
  };

  const captureSync = <T,>(
    fn: () => T,
    context: { action: string; [key: string]: any } = { action: 'Unknown' }
  ): { data: T | null; error: any | null } => {
    try {
      const data = fn();
      return { data, error: null };
    } catch (error) {
      tracker.captureException(error, {
        ...context,
        userId: user?.id,
      });
      return { data: null, error };
    }
  };

  return {
    captureAsync,
    captureSync,
  };
}
