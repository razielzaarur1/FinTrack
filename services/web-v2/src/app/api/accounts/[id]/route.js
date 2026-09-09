import { NextResponse } from 'next/server';
import { forwardToGateway } from '@/lib/gateway-proxy';

export async function PATCH(request, { params }) {
  const { id } = params;
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      { success: false, stage: 'NEXTJS_BODY_PARSE', error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const result = await forwardToGateway(`/api/accounts/${id}`, {
    method: 'PATCH',
    headers: { Authorization: authHeader },
    body,
  });

  return NextResponse.json(result.data, { status: result.status });
}

export async function DELETE(request, { params }) {
  const { id } = params;
  const authHeader = request.headers.get('authorization') || '';
  const result = await forwardToGateway(`/api/accounts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader },
  });

  return NextResponse.json(result.data, { status: result.status });
}
