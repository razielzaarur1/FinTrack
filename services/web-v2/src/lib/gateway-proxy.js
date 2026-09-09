import dns from 'node:dns/promises';

const CANDIDATE_URLS = Array.from(
  new Set(
    [
      process.env.INTERNAL_API_URL,
      process.env.API_GATEWAY_URL,
      'http://finapp-api-gateway:3000',
      'http://api-gateway:3000',
    ].filter(Boolean)
  )
);

let cachedWorkingBaseUrl = null;

/**
 * Robust HTTP forwarder to API Gateway with multi-candidate fallback.
 */
export async function forwardToGateway(path, options = {}) {
  const timeoutMs = options.timeoutMs || 12000;
  const urlsToTry = cachedWorkingBaseUrl
    ? [cachedWorkingBaseUrl, ...CANDIDATE_URLS.filter((u) => u !== cachedWorkingBaseUrl)]
    : CANDIDATE_URLS;

  let lastError = null;
  const attempts = [];

  for (const baseUrl of urlsToTry) {
    const targetUrl = `${baseUrl}${path}`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(targetUrl, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers,
        },
        body: options.body
          ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
          : undefined,
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      // If we got an HTTP response (gateway accepted the connection), cache this URL
      cachedWorkingBaseUrl = baseUrl;

      return {
        ok: res.ok,
        status: res.status,
        data,
        targetUrl,
        durationMs: Date.now() - startTime,
        attempts,
      };
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      const cause = err.cause;
      const attemptInfo = {
        targetUrl,
        error: err.message,
        isTimeout,
        code: cause?.code || err.code || null,
        syscall: cause?.syscall || null,
        hostname: cause?.hostname || null,
        durationMs: Date.now() - startTime,
      };
      attempts.push(attemptInfo);
      lastError = err;
    }
  }

  // All candidates failed
  return {
    ok: false,
    status: 502,
    data: {
      success: false,
      stage: 'NEXTJS_GATEWAY_CONNECTION_ERROR',
      error: 'שגיאת רשת פנימית: לא ניתן ליצור קשר עם שירות api-gateway באף אחת מכתובות היעד הפנימיות',
      attempts,
      details: lastError?.message,
    },
    attempts,
  };
}

/**
 * Network probe inspecting container DNS and reachability.
 */
export async function probeNetwork() {
  const hostnames = [
    'api-gateway',
    'finapp-api-gateway',
    'postgres',
    'finapp-postgres',
    'scraper-worker',
    'finapp-scraper-worker',
  ];
  const dnsResults = {};

  for (const host of hostnames) {
    try {
      const res = await dns.lookup(host);
      dnsResults[host] = { status: 'resolved', ip: res.address };
    } catch (e) {
      dnsResults[host] = { status: 'unresolved', code: e.code, message: e.message };
    }
  }

  return {
    candidateUrls: CANDIDATE_URLS,
    cachedWorkingBaseUrl,
    dnsResults,
  };
}
