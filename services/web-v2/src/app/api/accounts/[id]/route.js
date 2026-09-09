import { NextResponse } from 'next/server';

const API_GATEWAY_URL =
  process.env.INTERNAL_API_URL ||
  process.env.API_GATEWAY_URL ||
  'http://api-gateway:3000';

export async function PATCH(request, { params }) {
  const { id } = params;
  const targetUrl = `${API_GATEWAY_URL}/api/accounts/${id}`;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json(
      { success: false, stage: 'NEXTJS_BODY_PARSE', error: 'Invalid JSON body', details: err.message },
      { status: 400 }
    );
  }

  try {
    const gatewayRes = await fetch(targetUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': request.headers.get('authorization') || '',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const isJson = (gatewayRes.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await gatewayRes.json() : await gatewayRes.text();

    return NextResponse.json(
      typeof data === 'object' ? data : { result: data },
      { status: gatewayRes.status }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, stage: 'NEXTJS_GATEWAY_FORWARD', error: err.message, targetUrl },
      { status: 502 }
    );
  }
}

export async function DELETE(request, { params }) {
  const { id } = params;
  const targetUrl = `${API_GATEWAY_URL}/api/accounts/${id}`;

  try {
    const gatewayRes = await fetch(targetUrl, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': request.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });

    const isJson = (gatewayRes.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await gatewayRes.json() : await gatewayRes.text();

    return NextResponse.json(
      typeof data === 'object' ? data : { result: data },
      { status: gatewayRes.status }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, stage: 'NEXTJS_GATEWAY_FORWARD', error: err.message, targetUrl },
      { status: 502 }
    );
  }
}
