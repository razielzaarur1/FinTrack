import { NextResponse } from 'next/server';
import { forwardToGateway, probeNetwork } from '@/lib/gateway-proxy';

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  const networkProbe = await probeNetwork();

  const result = await forwardToGateway('/api/accounts/diagnostics', {
    method: 'GET',
    headers: { Authorization: authHeader },
    timeoutMs: 6000,
  });

  const responsePayload = {
    webServer: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      ...networkProbe,
    },
    gatewayLayer: result.data,
    gatewayAttemptedUrl: result.targetUrl || null,
    transitDurationMs: result.durationMs || null,
    attempts: result.attempts || null,
  };

  return NextResponse.json(responsePayload, { status: result.status });
}
