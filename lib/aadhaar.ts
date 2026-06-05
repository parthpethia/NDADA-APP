/**
 * Masks an Aadhaar number to only show the last 4 digits.
 * Input formats like "123456789012" or "1234-5678-9012" or "1234 5678 9012"
 * are all normalized and masked as "XXXX-XXXX-9012".
 * If the input is empty or invalid, it returns a placeholder or empty string.
 */
export function maskAadhaar(value: string | null | undefined): string {
  if (!value) return '—';
  
  // Remove spaces, hyphens, and any non-numeric characters
  const clean = value.replace(/\D/g, '');
  
  if (clean.length < 4) {
    return value; // If it's too short to mask, return as-is
  }
  
  const lastFour = clean.slice(-4);
  return `XXXX-XXXX-${lastFour}`;
}
