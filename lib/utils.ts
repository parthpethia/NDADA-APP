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

export function formatDate(date: string) {
  if (!date) return '';
  const trimmed = String(date).trim();
  if (!trimmed) return '';
  const cleanStr = trimmed.split('T')[0].split('+')[0].split(' ')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
    const [year, month, day] = cleanStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
    const [day, month, year] = cleanStr.split('/').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(date: string) {
  return new Date(date).toLocaleString('en-IN', {
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

