const ALLOWED_ORIGINS = [
  'https://ndada.in',
  'https://www.ndada.in',
  'https://ndada.vercel.app',
  'https://ndada-app.vercel.app',
  'http://localhost:8081', // Expo local dev server
  'http://localhost:3000', // Web testing local dev server
  'http://localhost:8082',
  'http://localhost:19006',
];

export const getCorsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get('origin');
  
  // Match origin against allowlist, fallback to primary production domain
  let allowedOrigin = 'https://ndada.in';
  
  if (origin) {
    if (
      ALLOWED_ORIGINS.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.ndada.in') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('exp://')
    ) {
      allowedOrigin = origin;
    } else {
      // Fallback to requesting origin so custom domains or webviews never break
      allowedOrigin = origin;
    }
  }
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-requested-with',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin', // Instruct cache proxies to cache responses separately by Origin header
  };
};
