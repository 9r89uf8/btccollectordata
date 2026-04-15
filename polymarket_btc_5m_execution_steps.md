# Step-by-step implementation plan for `polymarket_btc_5m_final_plan.md`

## Goal
Turn the architecture plan into a sequence of small implementation slices that can be shipped and verified one at a time.

## Current repo baseline
- Current state: single Next.js app at repo root.
- Missing today: Convex, collector process, shared domain types, ingestion pipeline, analytics UI.
- Recommended approach: do **not** start with a full monorepo refactor. Keep the root app working, add `convex/` and `collector/` incrementally, and only introduce `apps/` / `packages/` later if the codebase starts fighting that layout.

## Working rules
- Each step must end in a runnable state.
- Each step should have a clear acceptance check before moving on.
- Build the polling MVP before the market WebSocket collector.
- Build catalog-only UI before live ingest UI.
- Store raw timestamps and explicit outcome mappings early; avoid “fixing it later” in analytics.
- Add tests for parsers and feature derivation as soon as those utilities exist.

## Recommended execution order

### Step 1 - Project bootstrap and dependency setup
Scope:
- install and configure Convex
- add baseline env handling
- create initial folders: `convex/`, `collector/`, `lib/` or `src/lib/`
- replace the starter homepage with a project shell

Tasks:
- add Convex packages and local scripts
- add `.env.local.example` and collector env example
- create a minimal Convex query that returns static data
- create a simple dashboard page proving Next.js can read Convex

Done when:
- `npm run dev` boots the app
- Convex dev runs locally
- the homepage renders data from one Convex query

Notes:
- keep the root app in place for now
- do not add WebSocket code yet

### Step 2 - Schema and shared domain types
Scope:
- implement the core storage model from the final plan
- define shared types/constants for outcomes, capture modes, quality flags, and snapshot shapes

Tasks:
- create `convex/schema.ts`
- add tables for `markets`, `market_events_raw`, `market_snapshots_1s`, `btc_ticks`, `market_summaries`, `collector_health`
- define indexes from the final plan
- create shared parsing/normalization helpers for market identity and timestamps

Done when:
- Convex schema deploys cleanly
- a seed or demo mutation can insert and read one market row
- type definitions exist for market rows and snapshot rows

### Step 3 - Discovery parser and market catalog ingest
Scope:
- discover active BTC 5-minute markets from Gamma
- parse slug/title/window data safely
- upsert catalog rows into `markets`

Tasks:
- implement BTC 5-minute matching rules
- implement slug/window parser with unit tests
- write discovery action/internal mutation pair
- add a cron job for active discovery
- add a one-off backfill entrypoint for older markets

Done when:
- active BTC 5-minute markets appear in `markets`
- rerunning discovery updates existing rows instead of duplicating them
- parser tests cover known title/slug examples

Blockers to resolve before moving on:
- ambiguous `windowStartTs` / `windowEndTs` derivation
- missing explicit token mapping for `Up` and `Down`

### Step 4 - Catalog-only dashboard
Scope:
- build the first useful UI before live ingest exists

Tasks:
- replace the placeholder homepage with an active/recent markets table
- show slug, question, window start/end, active/resolved state, token IDs, and capture mode
- add empty-state and loading-state handling
- add simple market detail route scaffold at `/markets/[slug]`

Done when:
- the homepage is useful with catalog data only
- clicking a market opens a detail page scaffold
- no collector is required for the UI to function

### Step 5 - BTC reference price ingestion
Scope:
- ingest canonical BTC reference ticks independently from market data

Tasks:
- create the collector app skeleton under `collector/`
- implement RTDS Chainlink `btc/usd` subscription
- batch-write `btc_ticks` rows into Convex
- record collector heartbeat / health status

Done when:
- `btc_ticks` grows continuously while the collector runs
- health data shows last tick time and process heartbeat
- disconnect/reconnect events are logged

Why this step comes first:
- finalization depends on BTC reference prices
- this isolates RTDS work from market microstructure work

### Step 6 - Polling MVP for market snapshots
Scope:
- create the first live market capture path using polling, not sockets

Tasks:
- load active markets from Convex
- fetch midpoint and last-trade data in batches from Polymarket
- derive one normalized snapshot per market per second
- write `market_snapshots_1s` rows
- mark capture mode as `poll`

Done when:
- at least one active market accumulates 1-second snapshots during its window
- dashboard can show current displayed probability and latest BTC value
- snapshot rows have correct `secondsFromWindowStart`

Testing focus:
- second bucketing
- displayed probability derivation
- staleness handling

### Step 7 - Replay page and live market detail
Scope:
- make the stored polling data explorable

Tasks:
- implement `/markets/[slug]`
- show price path, BTC path, and summary stats for the selected market
- show recent snapshots in a compact debug table
- surface data quality and capture mode clearly

Done when:
- the latest active or recent market can be replayed from stored snapshots
- missing data is visible rather than hidden

### Step 8 - Market finalizer and summary generation
Scope:
- compute end-of-market summary features after close/resolution

Tasks:
- implement finalizer logic from the final plan
- derive official/nearest start and end BTC references
- compute threshold-ready features for T+15s / 30s / 60s / 120s
- write `market_summaries`
- flag incomplete markets as `partial` or `gap`

Done when:
- resolved markets automatically produce one summary row
- summary output is reproducible from stored snapshots and BTC ticks
- winner and reference prices are stored explicitly

Testing focus:
- summary feature calculation
- winner derivation
- nearest-tick lookup logic

### Step 9 - Analytics page
Scope:
- make the stored summaries answer the core research question

Tasks:
- implement Convex queries for threshold analytics
- build `/analytics`
- allow filters such as threshold, time offset, date range, and minimum sample size
- show counts and win-rate tables for `Up` and `Down`

Done when:
- the app can answer questions like:
  - when `Up >= 0.70` at `T+60s`, how often does `Up` win?
- analytics reads only stored summaries/query outputs, not live recomputation in the browser

### Step 10 - Replace polling market ingest with WebSocket collector
Scope:
- move the market capture path to the target architecture

Tasks:
- subscribe to the Polymarket market WebSocket for both outcome token IDs
- persist raw events into `market_events_raw`
- maintain in-memory market state
- produce 1-second snapshots from WebSocket state
- add reconnect logic and resubscription logic
- keep polling as a fallback or repair path

Done when:
- raw events are stored for active markets
- snapshots continue through reconnects
- `captureMode` can distinguish WS-captured data from poll/backfill data

Important:
- do not remove the polling code until WS snapshots match expected output on real markets

### Step 11 - Backfill, repair, and reconciliation
Scope:
- harden the system for gaps and restarts

Tasks:
- build historical market backfill flow
- add coarse repair using `prices-history` only where explicitly acceptable
- implement dedupe safeguards for snapshot and raw-event writes
- add reconciliation cron for missing summaries / stale active markets

Done when:
- transient collector outages leave visible flags instead of silent corruption
- stale or partially captured markets can be repaired or clearly marked

### Step 12 - Operational hardening and deployment
Scope:
- make the system practical to run continuously

Tasks:
- finalize logging, heartbeat, and reconnect metrics
- decide retention policy for raw events
- document local dev and deployment steps
- deploy web, Convex, and collector separately

Done when:
- there is a documented path to run all services locally
- production env vars are defined
- failures are observable through health data and logs

## Suggested PR/task breakdown
Use these as the actual implementation chunks:

1. bootstrap Convex and replace starter UI
2. add schema and shared market types
3. add Gamma discovery parser with tests
4. build catalog dashboard and market detail scaffold
5. add collector skeleton plus RTDS BTC ingest
6. add polling snapshot pipeline
7. build replay/detail UI from snapshots
8. add finalizer and market summaries
9. build analytics page
10. add market WebSocket ingest
11. add repair/reconciliation tooling
12. add deployment docs and ops hardening

## What to avoid
- do not start with a broad refactor to Turborepo
- do not build analytics before summary rows exist
- do not depend on minute-level history for second-level inference
- do not infer `Up`/`Down` token identity from position alone
- do not silently overwrite gaps; mark quality explicitly

## Immediate next step
Start with Steps 1 and 2 together:
- set up Convex
- add the schema
- replace the placeholder homepage with a Convex-backed project shell

That gives the project a real backbone without taking on discovery or collector complexity yet.
