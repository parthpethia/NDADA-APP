// Shared Edge Function Rate Limiter
import { getCorsHeaders } from './cors.ts';

export function getClientIdentifier(req: Request, userId?: string | null): string {
  if (userId && userId.trim() !== '') {
    return userId.trim();
  }

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map((ip) => ip.trim());
    if (ips[0] && ips[0] !== '') {
      return `ip:${ips[0]}`;
    }
  }

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp && cfConnectingIp.trim() !== '') {
    return `ip:${cfConnectingIp.trim()}`;
  }

  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim() !== '') {
    return `ip:${xRealIp.trim()}`;
  }

  return 'ip:anonymous';
}

export async function checkEdgeRateLimit(
  req: Request,
  supabase: any,
  actionType: string,
  maxRequests: number,
  windowSeconds: number,
  userId?: string | null
): Promise<{ allowed: boolean; retryAfter: number; response?: Response }> {
  const identifier = getClientIdentifier(req, userId);

  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_action_type: actionType,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.warn(`⚠️ Rate limit RPC error for ${actionType}:`, error.message);
      // Fail-open for RPC database errors to prevent service outages, but log warning
      return { allowed: true, retryAfter: 0 };
    }

    const allowed = Boolean(data?.allowed);
    const retryAfter = Number(data?.retry_after || 0);

    if (!allowed) {
      const corsHeaders = getCorsHeaders(req);
      const response = new Response(
        JSON.stringify({
          error: 'Too many requests',
          message: `Rate limit exceeded for action '${actionType}'. Please retry after ${retryAfter} seconds.`,
          retry_after: retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        }
      );
      return { allowed: false, retryAfter, response };
    }

    return { allowed: true, retryAfter: 0 };
  } catch (err) {
    console.warn(`⚠️ Rate limit check failed for ${actionType}:`, err);
    return { allowed: true, retryAfter: 0 };
  }
}
