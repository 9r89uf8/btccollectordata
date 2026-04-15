IMPLEMENTATION_STEPS.md

# Implementation Steps: Polymarket BTC 5m Tracker

10 steps, each producing a testable checkpoint. Complete them in order.

---

## Step 1 — Project foundation + TypeScript + Convex

- [ ] Convert JS to TypeScript (`tsconfig.json`, rename `.js` -> `.tsx`)
- [ ] Install & init Convex (`npx convex init`, add `convex`, `@convex-dev/react`)
- [ ] Create `convex/schema.ts` with all 6 tables: `markets`, `market_events_raw`, `market_snapshots_1s`, `btc_ticks`, `market_summaries`, `collector_health`
- [ ] Create `collector/` folder with `package.json`
- [ ] Create `packages/shared/` with type definitions
- [ ] Wire Convex provider in Next.js app layout

**Test:** `npm run dev` + `npx convex dev` both start. Convex dashboard shows tables.

---

## Step 2 — Discovery: Gamma polling + market catalog

- [ ] Implement `parseBtcFiveMinuteWindow()` in `packages/shared/src/market.ts`
- [ ] Write unit tests for the parser (various title formats, edge cases)
- [ ] Implement `convex/internal/discovery.ts` — Gamma API fetch, BTC 5m matching, market upsert
- [ ] Implement `convex/crons.ts` — 15-second discovery cron
- [ ] Implement `convex/markets.ts` — `listActiveBtc5m`, `getBySlug` queries

**Test:** Cron fires, real BTC 5m markets appear in `markets` table. Parser tests pass.

---

## Step 3 — Dashboard: show discovered markets

- [ ] Build dashboard (`app/page.tsx`) — list active + recent markets from Convex
- [ ] Show: slug, question, window times, status, outcome labels
- [ ] Add basic layout and nav components

**Test:** Visit `localhost:3000`, see live markets from the discovery cron.

---

## Step 4 — Polling collector MVP

- [ ] Implement `collector/src/config.ts` and `collector/src/convexClient.ts`
- [ ] Implement `collector/src/index.ts` — 1-second polling loop
- [ ] Poll CLOB `/midpoints` and `/last-trades-prices` for active market tokens
- [ ] Materialize `market_snapshots_1s` rows (display price logic, time bucketing, phase)
- [ ] Implement `convex/http.ts` — `POST /ingest/polymarket` with secret validation
- [ ] Implement `convex/internal/ingestion.ts` — snapshot + BTC tick mutations

**Test:** Start collector. Active market accumulates snapshot rows every second in Convex.

---

## Step 5 — Chainlink BTC via RTDS

- [ ] Implement `collector/src/rtds.ts` — WebSocket to RTDS for Chainlink `btc/usd`
- [ ] Store ticks in `btc_ticks` table
- [ ] Include `btcChainlink` in snapshot rows
- [ ] Add staleness detection (`stale_btc` quality flag)
- [ ] Implement `convex/btc.ts` — latest BTC price query

**Test:** `btc_ticks` fills with prices. Snapshots include BTC. Dashboard shows live BTC.

---

## Step 6 — Market replay page

- [ ] Build `/markets/[slug]/page.tsx`
- [ ] Market metadata, window, winner display
- [ ] Line chart: Up displayed probability over time (recharts or similar)
- [ ] Line chart: Chainlink BTC over same window
- [ ] Table of second-by-second snapshots
- [ ] Quality flags / capture mode indicator

**Test:** Navigate to a market with snapshots, charts and table render correctly.

---

## Step 7 — Summary finalizer

- [ ] Implement `convex/internal/finalize.ts` — compute all summary features
- [ ] Trigger on market close/resolution + reconciliation cron (every 5 min)
- [ ] Features: displayed prices at T0/T15/T30/T60/T120/T240/T295, max/min/range/stddev, first crossing times, BTC moves
- [ ] Write `market_summaries` row
- [ ] Update `markets` quality flags and final reference prices

**Test:** Resolved market produces correct `market_summaries` row. Manually verify against Polymarket page.

---

## Step 8 — Analytics page

- [ ] Implement `convex/analytics.ts` — threshold stats + calibration queries
- [ ] Build `/analytics/page.tsx`
- [ ] Win rate by Up probability threshold at T15/T30/T60/T120
- [ ] Calibration table
- [ ] Distribution of first crossing times
- [ ] Filters by date range and quality

**Test:** Analytics page shows meaningful tables from resolved markets.

---

## Step 9 — WebSocket collector (replace polling)

- [ ] `collector/src/marketWs.ts` — market WebSocket with subscribe/ping/reconnect
- [ ] `collector/src/state.ts` — in-memory orderbook state per market
- [ ] `collector/src/snapshotter.ts` — derive 1s snapshots from WS state
- [ ] Store raw events in `market_events_raw`
- [ ] `collector/src/reconnect.ts` — exponential backoff + jitter
- [ ] `collector/src/sender.ts` — batched writes to Convex
- [ ] Health reporting to `collector_health` table

**Test:** Raw events stored, snapshots survive reconnects, health status visible.

---

## Step 10 — Hardening + quality

- [ ] Gap detection: find markets missing snapshots
- [ ] Coarse repair tooling via `prices-history` backfill
- [ ] Dedupe safeguards on ingestion
- [ ] Historical backfill job (Gamma keyset pagination)
- [ ] Integration tests for full pipeline
- [ ] Unit tests: display-price derivation, bucketing, staleness, summary features

**Test:** Collector restart doesn't corrupt data. Gaps flagged, not silently ignored. Tests pass.

---

## Progress map

| Step | Name                    | Depends on | Status |
|------|-------------------------|------------|--------|
| 1    | Foundation + Convex     | —          | TODO   |
| 2    | Discovery + catalog     | 1          | TODO   |
| 3    | Dashboard               | 2          | TODO   |
| 4    | Polling collector       | 2          | TODO   |
| 5    | Chainlink BTC           | 4          | TODO   |
| 6    | Market replay page      | 4          | TODO   |
| 7    | Summary finalizer       | 4, 5       | TODO   |
| 8    | Analytics page          | 7          | TODO   |
| 9    | WebSocket collector     | 4          | TODO   |
| 10   | Hardening               | 9          | TODO   |

Steps 4 and 5 can be done together. Steps 3 and 4 can be parallelized. Step 6 can start as soon as step 4 has data.