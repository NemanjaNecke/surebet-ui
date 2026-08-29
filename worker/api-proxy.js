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
    if (!env.VPC_API) {
      return message('Private API binding is not configured', 503);
    }

    const incoming = new URL(request.url);
    if (incoming.pathname !== API_PREFIX && !incoming.pathname.startsWith(`${API_PREFIX}/`)) {
      return message('Not found', 404);
    }

    const target = new URL(`${incoming.pathname}${incoming.search}`, 'http://127.0.0.1');
    return env.VPC_API.fetch(new Request(target.toString(), request));
  },
};
