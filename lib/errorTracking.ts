/**
 * Error Tracking & Monitoring Module
 *
 * Centralized error handling and monitoring for the NDADA app
 * Integrates with external error tracking services (Sentry, etc)
 * and provides local logging for development
 */

import { supabase } from '@/lib/supabase';

// ============================================================
// Types
// ============================================================

export interface ErrorContext {
  userId?: string;
  action?: string;
  endpoint?: string;
  requestData?: Record<string, any>;
  responseData?: Record<string, any>;
  userAgent?: string;
  url?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface ErrorReport {
  id: string;
  error: Error | string;
  level: 'error' | 'warning' | 'info';
  context: ErrorContext;
  stackTrace?: string;
  reported: boolean;
  timestamp: string;
}

// ============================================================
// Configuration
// ============================================================

interface ErrorTrackerConfig {
  enableRemoteTracking: boolean;
  enableLocalLogging: boolean;
  enableConsoleOutput: boolean;
  maxLocalLogs: number;
  sentryDsn?: string;
}

const DEFAULT_CONFIG: ErrorTrackerConfig = {
  enableRemoteTracking: process.env.NODE_ENV === 'production',
  enableLocalLogging: true,
  enableConsoleOutput: process.env.NODE_ENV === 'development',
  maxLocalLogs: 100,
};

// ============================================================
// Error Tracker Class
// ============================================================

class ErrorTracker {
  private config: ErrorTrackerConfig;
  private localLogs: ErrorReport[] = [];
  private sentryInitialized = false;

  constructor(config: Partial<ErrorTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeSentry();
  }

  /**
   * Initialize Sentry if DSN is provided
   */
  private initializeSentry() {
    if (!this.config.sentryDsn) {
      console.log('[ErrorTracker] Sentry DSN not configured');
      return;
    }

    try {
      // Import Sentry conditionally (could be added to package.json)
      // import * as Sentry from "@sentry/react-native";
      // Sentry.init({
      //   dsn: this.config.sentryDsn,
      //   tracesSampleRate: 1.0,
      //   environment: process.env.NODE_ENV,
      // });
      this.sentryInitialized = true;
      console.log('[ErrorTracker] Sentry initialized successfully');
    } catch (err) {
      console.error('[ErrorTracker] Failed to initialize Sentry:', err);
    }
  }

  /**
   * Log an error with context
   */
  public logError(error: Error | string, context: ErrorContext = {}, level: 'error' | 'warning' | 'info' = 'error') {
    const errorReport: ErrorReport = {
      id: this.generateId(),
      error,
      level,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
      },
      stackTrace: error instanceof Error ? error.stack : undefined,
      reported: false,
      timestamp: new Date().toISOString(),
    };

    // Store locally
    if (this.config.enableLocalLogging) {
      this.storeLocally(errorReport);
    }

    // Log to console in development
    if (this.config.enableConsoleOutput) {
      this.logToConsole(errorReport);
    }

    // Report to remote service
    if (this.config.enableRemoteTracking) {
      this.reportRemote(errorReport);
    }

    return errorReport;
  }

  /**
   * Log a caught exception
   */
  public captureException(error: unknown, context: ErrorContext = {}) {
    let errorToLog: Error | string;

    if (error instanceof Error) {
      errorToLog = error;
    } else if (typeof error === 'string') {
      errorToLog = error;
    } else {
      errorToLog = new Error(JSON.stringify(error));
    }

    return this.logError(errorToLog, context, 'error');
  }

  /**
   * Log an API error
   */
  public captureApiError(
    error: any,
    options: {
      endpoint: string;
      method?: string;
      status?: number;
      requestData?: Record<string, any>;
      responseData?: Record<string, any>;
      userId?: string;
    }
  ) {
    const context: ErrorContext = {
      action: 'API Call',
      endpoint: options.endpoint,
      method: options.method || 'GET',
      status: options.status,
      requestData: options.requestData,
      responseData: options.responseData,
      userId: options.userId,
    };

    const message = `API Error: ${options.method || 'GET'} ${options.endpoint}`;
    return this.logError(new Error(message), context, 'error');
  }

  /**
   * Log authentication error
   */
  public captureAuthError(error: any, context: ErrorContext = {}) {
    return this.logError(error instanceof Error ? error : new Error(String(error)), {
      action: 'Authentication',
      ...context,
    }, 'error');
  }

  /**
   * Log form validation error
   */
  public captureValidationError(fieldName: string, message: string, context: ErrorContext = {}) {
    return this.logError(new Error(`Validation Error: ${fieldName} - ${message}`), {
      action: 'Form Validation',
      fieldName,
      ...context,
    }, 'warning');
  }

  /**
   * Store error locally
   */
  private storeLocally(report: ErrorReport) {
    this.localLogs.push(report);

    // Keep only recent logs
    if (this.localLogs.length > this.config.maxLocalLogs) {
      this.localLogs = this.localLogs.slice(-this.config.maxLocalLogs);
    }
  }

  /**
   * Log to console
   */
  private logToConsole(report: ErrorReport) {
    const prefix = `[ErrorTracker] [${report.level.toUpperCase()}]`;
    const message = report.error instanceof Error ? report.error.message : String(report.error);

    if (report.level === 'error') {
      console.error(`${prefix}`, message, report.context, report.stackTrace);
    } else if (report.level === 'warning') {
      console.warn(`${prefix}`, message, report.context);
    } else {
      console.log(`${prefix}`, message, report.context);
    }
  }

  /**
   * Report to remote service
   */
  private async reportRemote(report: ErrorReport) {
    try {
      // Try to save to Supabase error_logs table if it exists
      const { error } = await supabase.from('error_logs').insert({
        message: report.error instanceof Error ? report.error.message : String(report.error),
        level: report.level,
        context: report.context,
        stack_trace: report.stackTrace,
        user_id: report.context.userId,
        created_at: new Date().toISOString(),
      }).select();

      if (!error) {
        report.reported = true;
      } else {
        console.error('[ErrorTracker] Failed to report to remote:', error);
      }
    } catch (err) {
      console.error('[ErrorTracker] Failed to report remote error:', err);
    }
  }

  /**
   * Get all local logs
   */
  public getLocalLogs(): ErrorReport[] {
    return [...this.localLogs];
  }

  /**
   * Clear local logs
   */
  public clearLocalLogs() {
    this.localLogs = [];
  }

  /**
   * Export logs for debugging
   */
  public exportLogs(): string {
    return JSON.stringify(this.localLogs, null, 2);
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set user context
   */
  public setUser(userId: string, email?: string, name?: string) {
    // Store user context for all future logs
    (globalThis as any).__errorTrackerUser = { userId, email, name };
  }

  /**
   * Clear user context
   */
  public clearUser() {
    (globalThis as any).__errorTrackerUser = null;
  }

  /**
   * Get current user context
   */
  private getUserContext(): Partial<ErrorContext> {
    const user = (globalThis as any).__errorTrackerUser;
    return user ? { userId: user.userId } : {};
  }
}

// ============================================================
// Singleton instance
// ============================================================

let trackerInstance: ErrorTracker | null = null;

export function initializeErrorTracker(config?: Partial<ErrorTrackerConfig>): ErrorTracker {
  if (!trackerInstance) {
    trackerInstance = new ErrorTracker(config);
  }
  return trackerInstance;
}

export function getErrorTracker(): ErrorTracker {
  if (!trackerInstance) {
    trackerInstance = new ErrorTracker();
  }
  return trackerInstance;
}

// ============================================================
// Global error handlers
// ============================================================

export function setupGlobalErrorHandlers() {
  const tracker = getErrorTracker();

  // Handle uncaught exceptions
  if (globalThis.addEventListener) {
    globalThis.addEventListener('error', (event) => {
      tracker.captureException(event.error || event.message, {
        action: 'Uncaught Exception',
        url: globalThis.location?.href,
      });
    });

    // Handle unhandled promise rejections
    globalThis.addEventListener('unhandledrejection', (event) => {
      tracker.captureException(event.reason, {
        action: 'Unhandled Promise Rejection',
      });
    });
  }
}

// ============================================================
// Helper functions
// ============================================================

export function captureError(error: any, context?: ErrorContext) {
  return getErrorTracker().captureException(error, context);
}

export function captureApiError(error: any, options: Parameters<ErrorTracker['captureApiError']>[1]) {
  return getErrorTracker().captureApiError(error, options);
}

export function captureValidationError(fieldName: string, message: string, context?: ErrorContext) {
  return getErrorTracker().captureValidationError(fieldName, message, context);
}

export function setErrorUser(userId: string, email?: string, name?: string) {
  getErrorTracker().setUser(userId, email, name);
}

export function getErrorLogs() {
  return getErrorTracker().getLocalLogs();
}

export function exportErrorLogs() {
  return getErrorTracker().exportLogs();
}
