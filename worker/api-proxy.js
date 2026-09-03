const API_PREFIX = '/api/v1';
const ALLOWED_ORIGINS = new Set([
  'https://kvotaradar.online',
  'https://www.kvotaradar.online',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }

  return {
    'access-control-allow-credentials': 'true',
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function message(request, body, status) {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      ...corsHeaders(request),
    },
  });
}

function withCors(request, response) {
  // WebSocket upgrades must retain Cloudflare's response object because it
  // carries the non-standard webSocket handle.
  if (response.status === 101) {
    return response;
  }
  const headers = new Headers(response.headers);
  const additions = corsHeaders(request);
  delete additions.vary;
  for (const [name, value] of Object.entries(additions)) {
    headers.set(name, value);
  }
  const vary = headers.get('vary');
  if (additions['access-control-allow-origin'] && !vary?.toLowerCase().split(',').map((value) => value.trim()).includes('origin')) {
    headers.set('vary', vary ? `${vary}, Origin` : 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    if (!env.VPC_API) {
      return message(request, 'Private API binding is not configured', 503);
    }

    const incoming = new URL(request.url);
    if (incoming.pathname !== API_PREFIX && !incoming.pathname.startsWith(`${API_PREFIX}/`)) {
      return message(request, 'Not found', 404);
    }

    if (request.method === 'OPTIONS') {
      return message(request, null, 204);
    }

    const target = new URL(`${incoming.pathname}${incoming.search}`, 'http://127.0.0.1');
    try {
      const response = await env.VPC_API.fetch(new Request(target.toString(), request));
      return withCors(request, response);
    } catch (error) {
      console.error('Private API fetch failed', error);
      return message(request, 'Private API is temporarily unavailable', 503);
    }
  },
};
