# SureEdge odds portal

Angular 21 frontend for the Surebet FastAPI service. The portal is designed for end users rather
than scraper administration.

It provides:

- live and prematch best-odds comparison;
- sport, market, time, bookmaker, league, and team search;
- live surebets across 1X2, two-way, double-chance, totals, and BTTS markets;
- prematch 1X2 and double-chance surebets;
- a match drawer containing every available bookmaker offer;
- an exact surebet stake split and guaranteed-return calculator;
- Auth0 login and bearer-token attachment for protected API routes;
- a clearly marked preview mode when authenticated data is unavailable.

## Start locally

Requirements: Node.js 22.12 or newer and npm 11.

```powershell
cd C:\Users\Pc\Desktop\scraper\surebet-ui
npm install
npm start
```

Open `http://localhost:4200`.

The development proxy forwards `/api` and `/health` to `http://127.0.0.1:8080`. To use the API on
the current AWS instance without exposing port 8080, open a second PowerShell window and create an
SSH tunnel:

```powershell
ssh -i "C:\Users\Pc\Downloads\surebet-aws.pem" -L 8080:127.0.0.1:80 ubuntu@18.199.155.237
```

Keep that SSH session open while running the Angular portal.

## Authentication

`public/app-config.js` contains the current Auth0 SPA domain, public client ID, API audience, and
same-origin API base. No client secret belongs in the frontend.

Add these values to the Auth0 SPA application:

- Allowed Callback URLs: `http://localhost:4200`
- Allowed Logout URLs: `http://localhost:4200`
- Allowed Web Origins: `http://localhost:4200`

Add the final production portal origin to the same three lists before deployment.

## API routes used

- `/api/v1/odds/live/best`
- `/api/v1/odds/prematch/best`
- `/api/v1/matches/{id}/odds`
- `/api/v1/prematch/matches/{id}/odds`
- `/api/v1/surebets/live`
- `/api/v1/surebets/prematch`
- `/api/v1/bookmakers/health`
- `/api/v1/auth/realtime-ticket`

## Quality checks

```powershell
npm run typecheck
npm run test:ci
npm run build
```
