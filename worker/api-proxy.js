const API_PREFIX = '/api/v1';

function message(body, status) {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

export default {
  async fetch(request, env) {
    if (!env.API_ORIGIN) {
      return message('API origin is not configured', 503);
    }

    const incoming = new URL(request.url);
    if (incoming.pathname !== API_PREFIX && !incoming.pathname.startsWith(`${API_PREFIX}/`)) {
      return message('Not found', 404);
    }

    let origin;
    try {
      origin = new URL(env.API_ORIGIN);
    } catch {
      return message('API origin is invalid', 500);
    }
    if (origin.protocol !== 'https:') {
      return message('API origin must use HTTPS', 500);
    }

    const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
    return fetch(new Request(target.toString(), request));
  },
};
