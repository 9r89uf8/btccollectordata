# BTCGT Runbook

This runbook covers the current local-dev and deployment flow for the Polymarket BTC Up/Down 5-minute tracker.

## Required env

Web / Convex:
- `.env.local` is written by `npx convex dev`
- required values:
  - `CONVEX_DEPLOYMENT`
  - `NEXT_PUBLIC_CONVEX_URL`
  - `NEXT_PUBLIC_CONVEX_SITE_URL`

Collector:
- the collector reads, in order:
  - process env
  - `.env.local`
  - `collector/.env`
  - `collector/.env.local`
- minimum required collector env:
  - `CONVEX_URL`
  - `CONVEX_SITE_URL`
  - `INGEST_SHARED_SECRET`

Recommended local collector file: [collector/.env.local](/C:/Users/alexa/WebstormProjects/btcgt/collector/.env.local)

```env
CONVEX_URL=https://your-dev-deployment.convex.cloud
CONVEX_SITE_URL=https://your-dev-deployment.convex.site
INGEST_SHARED_SECRET=replace-me
```

Do not set `COLLECTOR_EXIT_AFTER_MS` for normal collection. That flag is only for timed smoke tests.

Volume-control knobs:
- `SNAPSHOT_POLL_MS=5000` reduces persisted snapshot frequency from once per second to once every 5 seconds, and the replay UI now renders sparse 5-second capture without blank charts
- `PERSIST_MARKET_RAW_EVENTS=false` keeps WebSocket shadow state/parity logic alive but stops writing `market_events_raw`

## Local dev

Terminal 1: Convex

```powershell
npx convex dev
```

Terminal 2: collector

```powershell
Remove-Item Env:COLLECTOR_EXIT_AFTER_MS -ErrorAction SilentlyContinue
npm run collector:dev
```

Terminal 3: web app

```powershell
npm run dev
```

## Smoke tests

Run the test suite:

```powershell
npm test
```

Build the app:

```powershell
npm run build
```

Push Convex functions and schema once without the long-running watcher:

```powershell
npx convex dev --once
```

Inspect live state:

```powershell
npx convex run status:getProjectShell '{}'
npx convex run health:getCollectorHealth '{}'
npx convex run markets:listActiveBtc5m '{}'
```

## Data collection behavior

- Polling is still the primary persisted snapshot source.
- Market WebSocket capture runs in shadow mode for raw-event storage and parity measurement.
- `market_events_raw` should populate while the collector runs.
- `market_snapshots_1s` and `btc_ticks` should update continuously while the collector runs.
- `market_summaries` fill after markets close and the finalizer/repair flows run.

## Repair and hardening

Current automated repair flow:
- active market discovery runs every 15 seconds
- closed-market reconciliation/finalization runs every minute
- stale-active and missing-summary repair runs every 5 minutes

Historical Gamma backfill is intentionally not part of the current runtime flow.

## Deployment flow

1. Deploy Convex functions and schema.

```powershell
npx convex deploy
```

2. Set Convex env for the ingest route.

```powershell
npx convex env set INGEST_SHARED_SECRET <secret>
```

3. Configure the collector host with the same:
- `INGEST_SHARED_SECRET`
- `CONVEX_URL`
- `CONVEX_SITE_URL`

4. Run the collector under a long-lived process supervisor.
- examples: systemd, PM2, Docker restart policy, or your platform equivalent

5. Verify post-deploy state:
- collector health row updates
- active markets have non-`unknown` capture mode
- BTC ticks are fresh
- snapshots are accumulating for active markets

## Retention policy

Current decision:
- keep `market_events_raw` in dev for short-term debugging only
- target 30 days retention for production raw events unless analytics proves a longer window is needed
- do not purge automatically yet until the repair/backfill story is finalized

This is a policy decision only. Automatic retention enforcement is still pending.
