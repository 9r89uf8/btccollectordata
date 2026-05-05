# BTC Collector Data

Polymarket BTC 5-minute market tracker backed by Convex. The collector can also
capture ETH 5-minute market snapshots for research context.

## Architecture

- The web app reads market, snapshot, summary, and health data from Convex.
- The long-running collector connects to:
  - Polymarket RTDS for Chainlink BTC/ETH ticks
  - Polymarket CLOB HTTP endpoints for market polling snapshots
  - Polymarket market WebSocket for shadow capture and parity checks
- The collector writes batches into Convex through the ingest route.

In practice:

- Browser or Vercel-hosted UI -> Convex
- DigitalOcean Droplet collector -> Convex
- Collector -> Polymarket APIs and WebSockets

The UI and the Droplet should point at the same Convex deployment.

## Local Development

Install dependencies:

```bash
npm ci
```

Run Convex locally against your cloud deployment:

```bash
npx convex dev
```

Run the collector:

```bash
npm run collector:dev
```

Run the web app:

```bash
npm run dev
```

## Important Env Vars

Web app / local repo:

- `NEXT_PUBLIC_CONVEX_URL`

Collector:

- `CONVEX_URL`
- `CONVEX_SITE_URL`
- `INGEST_SHARED_SECRET`
- `COLLECT_CRYPTO_ASSETS` (`btc,eth` by default)
- `SNAPSHOT_POLL_MS`
- `PERSIST_MARKET_RAW_EVENTS`

See [collector/.env.example](/C:/Users/alexa/WebstormProjects/btcgt/collector/.env.example) for the collector env template.

## Production Split

Recommended setup:

- Host the web UI on Vercel
- Run the collector on a DigitalOcean Droplet
- Use one shared Convex production deployment

DigitalOcean collector deployment steps are in [DEPLOY_DIGITALOCEAN.md](/C:/Users/alexa/WebstormProjects/btcgt/DEPLOY_DIGITALOCEAN.md).
Vercel web deployment steps are in [DEPLOY_VERCEL.md](/C:/Users/alexa/WebstormProjects/btcgt/DEPLOY_VERCEL.md).
