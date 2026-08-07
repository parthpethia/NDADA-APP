import { Platform } from 'react-native';

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatPureDate(
  date: string | null | undefined,
  format: 'readable' | 'DD/MM/YYYY' | 'YYYY-MM-DD' = 'readable'
): string {
  if (!date) return '';
  const str = String(date).trim();
  if (!str) return '';

  // Extract year, month, day directly using regex to prevent timezone shift & strip ISO noise (00:00:00, .000+00:00, T00:00:00.000Z)
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  let year: number, month: number, day: number;

  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else if (slashMatch) {
    day = parseInt(slashMatch[1], 10);
    month = parseInt(slashMatch[2], 10);
    year = parseInt(slashMatch[3], 10);
  } else {
    const cleanDateStr = str.split('T')[0].split('+')[0].split(' ')[0];
    const parsed = new Date(cleanDateStr || str);
    if (isNaN(parsed.getTime())) return str;
    year = parsed.getFullYear();
    month = parsed.getMonth() + 1;
    day = parsed.getDate();
  }

  if (format === 'DD/MM/YYYY') {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  } else if (format === 'YYYY-MM-DD') {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else {
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}

export function formatDate(date: string | null | undefined): string {
  return formatPureDate(date, 'readable');
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '';
  const str = String(date).trim();
  if (!str) return '';

  // Check if date has no explicit non-zero time component (e.g. 00:00:00, T00:00:00.000Z, or pure YYYY-MM-DD)
  const isPureDate =
    /^\d{4}-\d{2}-\d{2}$/.test(str) ||
    str.includes('T00:00:00') ||
    str.includes(' 00:00:00');

  if (isPureDate) {
    return formatPureDate(str, 'readable');
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return formatPureDate(str, 'readable');

  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isWeb() {
  return Platform.OS === 'web';
}

/**
 * Extracts a descriptive error message from a Supabase Edge Function invocation error.
 * A 5xx or 4xx response from Edge Functions is thrown as a FunctionsHttpError with a generic message,
 * but the response body contains the actual error description.
 *
 * Automatically detects network reachability errors (FunctionsFetchError, FetchError, TypeError)
 * and formats clean, user-friendly offline messages.
 */
export async function getFunctionsErrorMessage(error: any): Promise<string> {
  if (!error) return 'An unknown error occurred';

  const errName = String(error?.name || '');
  const errMsg = String(error?.message || error || '').toLowerCase();

  const isNetworkError =
    errName === 'FunctionsFetchError' ||
    errName === 'FetchError' ||
    errName === 'TypeError' ||
    errName === 'NetworkError' ||
    errMsg.includes('failed to send a request') ||
    errMsg.includes('failed to fetch') ||
    errMsg.includes('network request failed') ||
    errMsg.includes('network error') ||
    errMsg.includes('load failed') ||
    errMsg.includes('offline') ||
    errMsg.includes('econnreset') ||
    errMsg.includes('etimedout');

  if (isNetworkError) {
    return 'Network error connecting to server (unable to reach server). Please check your internet connection and try again.';
  }

  if (error.context && typeof error.context.json === 'function') {
    try {
      // Use clone() to avoid draining the original response body stream
      const body = await error.context.clone().json();
      return body.error || body.message || error.message;
    } catch {
      try {
        const text = await error.context.clone().text();
        return text || error.message;
      } catch {
        // Fallback
      }
    }
  }

  return error.message || String(error);
}

// ── Navigation & Render Forensic Loggers ─────────────────────────────────────
// No-ops in production to avoid console spam and leaking internal state
export function navLog(requester: string, action: string, details?: unknown) {
  if (!__DEV__) return;
  const ts = new Date().toISOString().slice(11, 23);
  if (details !== undefined) {
    console.log(`[NAV-FORENSIC ${ts}] [${requester}] ${action}`, typeof details === 'object' ? JSON.stringify(details) : details);
  } else {
    console.log(`[NAV-FORENSIC ${ts}] [${requester}] ${action}`);
  }
}

export function renderLog(component: string, renderCount: number, state: { pathname?: string; session?: boolean; loading?: boolean; profileReady?: boolean; adminUser?: boolean; member?: boolean }) {
  if (!__DEV__) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[RENDER-FORENSIC ${ts}] [${component} #${renderCount}]`, JSON.stringify(state));
}

