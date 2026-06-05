const ALLOWED_ORIGINS = [
  'https://ndada.vercel.app',
  'http://localhost:8081', // Expo local dev server
  'http://localhost:3000', // Web testing local dev server
];

export const getCorsHeaders = (req: Request): Record<string, string> => {
  const origin = req.headers.get('origin');
  
  // Match origin against allowlist, fallback to primary production domain
  let allowedOrigin = 'https://ndada.vercel.app';
  
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    allowedOrigin = origin;
  }
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin', // Instruct cache proxies to cache responses separately by Origin header
  };
};
