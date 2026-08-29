# Surebet API proxy

The `surebet-api` Worker gives the frontend a stable `workers.dev` API and
WebSocket origin. It reaches Caddy on AWS at `127.0.0.1:80` through a private
Workers VPC Service and named Cloudflare Tunnel. The AWS API is not published
to the Internet and no application domain is required.

Deploy the proxy:

```powershell
npm run deploy:api-proxy
```

Inspect the private service:

```powershell
npx wrangler vpc service get 01a04cd8-2797-7411-9419-d71cd6b721c2
```

The Worker deliberately proxies only `/api/v1` and its child paths. Tunnel ID
`897e0f13-7de3-4493-ab1f-5831b98ef781` must have at least one healthy connector
before deploying a change to this binding.
