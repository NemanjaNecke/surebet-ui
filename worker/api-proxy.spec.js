import { describe, expect, it, vi } from 'vitest';

import worker from './api-proxy.js';

const origin = 'https://kvotaradar.online';

function request(path = '/api/v1/auth/me', init = {}) {
  return new Request(`https://api.kvotaradar.online${path}`, {
    headers: { origin, ...init.headers },
    ...init,
  });
}

describe('API proxy CORS handling', () => {
  it('handles browser preflight without depending on AWS', async () => {
    const fetch = vi.fn();
    const response = await worker.fetch(
      request('/api/v1/auth/me', { method: 'OPTIONS' }),
      { VPC_API: { fetch } },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds CORS headers to upstream errors', async () => {
    const response = await worker.fetch(request(), {
      VPC_API: { fetch: vi.fn(async () => new Response('bad gateway', { status: 502 })) },
    });

    expect(response.status).toBe(502);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('turns VPC failures into a readable CORS-enabled 503', async () => {
    const response = await worker.fetch(request(), {
      VPC_API: { fetch: vi.fn(async () => { throw new Error('VPC unavailable'); }) },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(await response.text()).toBe('Private API is temporarily unavailable');
  });

  it('does not grant CORS to unknown origins', async () => {
    const response = await worker.fetch(
      request('/api/v1/auth/me', { headers: { origin: 'https://example.com' } }),
      { VPC_API: { fetch: vi.fn(async () => new Response('ok')) } },
    );

    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });
});
