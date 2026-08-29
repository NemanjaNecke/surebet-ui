# Surebet API proxy

The `surebet-api` Worker gives the frontend a stable `workers.dev` API and
WebSocket origin while AWS is still connected through a temporary Quick
Tunnel.

Deploy the proxy:

```powershell
npm run deploy:api-proxy
```

Set or rotate the upstream origin. Store only the HTTPS origin, without
`/api/v1`:

```powershell
npm run secret:api-origin
```

Example secret value:

```text
https://example.trycloudflare.com
```

The Worker deliberately proxies only `/api/v1` and its child paths.
