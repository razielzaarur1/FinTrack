import { NextResponse } from 'next/server';
import { forwardToGateway } from '@/lib/gateway-proxy';

async function handleProxy(request, path, method) {
  const authHeader = request.headers.get('authorization') || '';
  let body = undefined;

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    try {
      const text = await request.text();
      if (text && text.trim().length > 0) {
        body = text;
      }
    } catch (_) {
      body = undefined;
    }
  }

  const result = await forwardToGateway(path, {
    method,
    headers: { Authorization: authHeader },
    body,
    timeoutMs: 15000,
  });

  return NextResponse.json(result.data, { status: result.status });
}

export async function GET(request, { params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const search = request.nextUrl.search || '';
  return handleProxy(request, `/api/${path}${search}`, 'GET');
}

export async function POST(request, { params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const search = request.nextUrl.search || '';
  return handleProxy(request, `/api/${path}${search}`, 'POST');
}

export async function PUT(request, { params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const search = request.nextUrl.search || '';
  return handleProxy(request, `/api/${path}${search}`, 'PUT');
}

export async function PATCH(request, { params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const search = request.nextUrl.search || '';
  return handleProxy(request, `/api/${path}${search}`, 'PATCH');
}

export async function DELETE(request, { params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const search = request.nextUrl.search || '';
  return handleProxy(request, `/api/${path}${search}`, 'DELETE');
}
