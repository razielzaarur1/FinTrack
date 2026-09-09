import { NextResponse } from 'next/server';

const API_GATEWAY_URL =
  process.env.INTERNAL_API_URL ||
  process.env.API_GATEWAY_URL ||
  'http://api-gateway:3000';

export async function GET(request) {
  const targetUrl = `${API_GATEWAY_URL}/api/accounts`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const gatewayRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': request.headers.get('authorization') || '',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    const contentType = gatewayRes.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await gatewayRes.json() : await gatewayRes.text();

    if (!gatewayRes.ok) {
      return NextResponse.json(
        typeof data === 'object'
          ? data
          : {
              success: false,
              stage: 'NEXTJS_GATEWAY_RESPONSE',
              error: `API Gateway returned HTTP ${gatewayRes.status}`,
              details: data,
              transitDurationMs: Date.now() - startTime,
            },
        { status: gatewayRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        stage: isTimeout ? 'NEXTJS_GATEWAY_TIMEOUT' : 'NEXTJS_GATEWAY_CONNECTION_ERROR',
        error: isTimeout
          ? 'פניית ה-Frontend ל-API Gateway הסתיימה ב-Timeout (12 שניות)'
          : 'שגיאת תקשורת פנימית בין ה-Web Interface ל-API Gateway',
        details: err.message,
        targetUrl,
        transitDurationMs: Date.now() - startTime,
      },
      { status: 502 }
    );
  }
}

export async function POST(request) {
  const targetUrl = `${API_GATEWAY_URL}/api/accounts`;
  const startTime = Date.now();

  let body;
  try {
    body = await request.json();
  } catch (parseErr) {
    return NextResponse.json(
      {
        success: false,
        stage: 'NEXTJS_BODY_PARSE',
        error: 'גוף הבקשה אינו בפורמט JSON תקין',
        details: parseErr.message,
      },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const gatewayRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': request.headers.get('authorization') || '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    const contentType = gatewayRes.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await gatewayRes.json() : await gatewayRes.text();

    if (!gatewayRes.ok) {
      return NextResponse.json(
        typeof data === 'object'
          ? { ...data, transitDurationMs: Date.now() - startTime }
          : {
              success: false,
              stage: 'NEXTJS_GATEWAY_FORWARD',
              error: `API Gateway returned HTTP ${gatewayRes.status}`,
              details: data,
              transitDurationMs: Date.now() - startTime,
            },
        { status: gatewayRes.status }
      );
    }

    return NextResponse.json(data, { status: gatewayRes.status });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return NextResponse.json(
      {
        success: false,
        stage: isTimeout ? 'NEXTJS_GATEWAY_TIMEOUT' : 'NEXTJS_GATEWAY_CONNECTION_ERROR',
        error: isTimeout
          ? 'פניית השמירה ל-API Gateway הסתיימה ב-Timeout (15 שניות)'
          : 'שגיאת רשת פנימית: לא ניתן ליצור קשר עם שירות api-gateway',
        details: err.message,
        targetUrl,
        transitDurationMs: Date.now() - startTime,
        tip: 'ודא שקונטיינר finapp-api-gateway פעיל ובאותה רשת docker (fintrack-net)',
      },
      { status: 502 }
    );
  }
}
