import { NextResponse } from 'next/server';
import { forwardToGateway } from '@/lib/gateway-proxy';

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  const result = await forwardToGateway('/api/accounts', {
    method: 'GET',
    headers: { Authorization: authHeader },
    timeoutMs: 12000,
  });

  return NextResponse.json(result.data, { status: result.status });
}

export async function POST(request) {
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

  const authHeader = request.headers.get('authorization') || '';
  const result = await forwardToGateway('/api/accounts', {
    method: 'POST',
    headers: { Authorization: authHeader },
    body,
    timeoutMs: 15000,
  });

  return NextResponse.json(result.data, { status: result.status });
}
