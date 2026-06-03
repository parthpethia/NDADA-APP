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
  return new Date(date).toLocaleDateString('en-IN', {
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
 */
export async function getFunctionsErrorMessage(error: any): Promise<string> {
  if (!error) return 'An unknown error occurred';

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

