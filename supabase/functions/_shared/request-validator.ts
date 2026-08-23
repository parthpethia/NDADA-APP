// Shared Edge Function Request Payload & Size Validator
import { getCorsHeaders } from './cors.ts';

const DEFAULT_MAX_SIZE_BYTES = 1024 * 1024; // 1 MB

export async function validateAndParseJson<T = any>(
  req: Request,
  maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES
): Promise<{ data: T | null; errorResponse?: Response }> {
  const corsHeaders = getCorsHeaders(req);

  // Check Content-Length header if present
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
    return {
      data: null,
      errorResponse: new Response(
        JSON.stringify({
          error: 'Payload Too Large',
          message: `Request body exceeds maximum size of ${Math.round(maxSizeBytes / 1024)} KB`,
        }),
        {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      ),
    };
  }

  try {
    const rawText = await req.text();

    if (rawText.length > maxSizeBytes) {
      return {
        data: null,
        errorResponse: new Response(
          JSON.stringify({
            error: 'Payload Too Large',
            message: `Request body exceeds maximum size limit of ${Math.round(maxSizeBytes / 1024)} KB`,
          }),
          {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    if (!rawText || rawText.trim() === '') {
      return { data: {} as T };
    }

    const data = JSON.parse(rawText) as T;
    return { data };
  } catch (err) {
    return {
      data: null,
      errorResponse: new Response(
        JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid JSON payload format',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      ),
    };
  }
}
