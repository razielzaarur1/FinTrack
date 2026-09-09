import { NextResponse } from 'next/server';

const API_GATEWAY_URL =
  process.env.INTERNAL_API_URL ||
  process.env.API_GATEWAY_URL ||
  'http://api-gateway:3000';

export async function GET(request) {
  const targetUrl = `${API_GATEWAY_URL}/api/accounts/diagnostics`;
  const startTime = Date.now();

  const webLayerDiagnostic = {
    webServer: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      gatewayConfiguredUrl: API_GATEWAY_URL,
    },
    gatewayLayer: null,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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
    const gatewayData = isJson ? await gatewayRes.json() : await gatewayRes.text();

    webLayerDiagnostic.gatewayLayer = typeof gatewayData === 'object' ? gatewayData : { raw: gatewayData };
    webLayerDiagnostic.roundtripMs = Date.now() - startTime;

    return NextResponse.json(webLayerDiagnostic, { status: gatewayRes.status });
  } catch (err) {
    webLayerDiagnostic.gatewayLayer = {
      status: 'unreachable',
      error: err.message,
      targetUrl,
      roundtripMs: Date.now() - startTime,
    };
    return NextResponse.json(webLayerDiagnostic, { status: 502 });
  }
}
