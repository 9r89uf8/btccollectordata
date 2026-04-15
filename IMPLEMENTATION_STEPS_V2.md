# Merged Implementation Plan: Polymarket BTC Up/Down 5m Tracker

This is the execution plan to use.

It combines:
- `polymarket_btc_5m_final_plan.md` as the architecture and data-model source of truth
- `IMPLEMENTATION_STEPS.md` as the original task/checkpoint draft
- `polymarket_btc_5m_execution_steps.md` as the repo-aware sequencing guide

## Why this version is better
- It keeps the strong architecture decisions from the final plan.
- It avoids an early monorepo/Turbo refactor that would slow delivery in the current repo.
- It moves BTC RTDS work earlier so summaries and snapshots do not need to be retrofitted later.
- It treats polling as the MVP and WebSocket ingest as a parity-based replacement, not an immediate rewrite.
- It adds explicit blockers, dependencies, and acceptance gates.

## Non-negotiable decisions
- Market family: Polymarket BTC `Up` / `Down` 5-minute markets only.
- Discovery source of truth: Gamma.
- Canonical BTC reference: Chainlink `btc/usd` from RTDS.
- Optional context only: Binance `btcusdt`.
- Storage/backend: Convex.
- Live collector: separate long-running Node process.
- Delivery phases:
  - Phase 1: discovery + polling MVP + summaries + analytics
  - Phase 2: market WebSocket collector + hardening

## Repo strategy
- Keep the current root Next.js app in place.
- Add `convex/` and `collector/` immediately.
- Add `packages/shared/` only for real shared types/parsers.
- Do not introduce `apps/web/` or Turborepo first.
- Stay in JavaScript unless a later step creates a strong reason to migrate.

## Critical blockers to resolve early
- `windowStartTs` and `windowEndTs` must be derived correctly from title/question, not assumed from a single Polymarket timestamp.
- `Up` and `Down` token IDs must be stored explicitly, never inferred by position.
- Snapshot uniqueness/upsert behavior must be defined before live ingest starts.
- Data quality flags must be written explicitly for stale/gap/partial states.

## Step 0 - Preflight and framework guardrails

Status: complete

- [x] Read the relevant local Next.js docs under `node_modules/next/dist/docs/` before changing app structure or data fetching
- [x] Inspect current `package.json`, app layout, and routing baseline
- [x] Decide the minimal JS-only structure for the current repo

**Output:** a short implementation note in the PR or commit message describing any Next.js-specific constraints discovered.

**Test:** No code yet. Team has confirmed the local Next.js guidance before implementation starts.

---

## Step 1 - Foundation: JavaScript + Convex + project skeleton

Status: complete

- [x] Keep the app in plain JavaScript
- [x] Install and initialize Convex
- [x] Add `convex/`
- [x] Add `collector/` with its own `package.json`
- [x] Add `packages/shared/` for shared domain types and parser utilities
- [x] Add env examples for web, Convex, and collector
- [x] Wire Convex provider into the app layout
- [x] Replace the starter homepage with a minimal project shell

Suggested files:
- `app/layout.js`
- `app/page.js`
- `convex/`
- `collector/package.json`
- `packages/shared/src/`
- `.env.local.example`

**Acceptance test:**
- `npm run dev` starts the web app
- `npx convex dev` starts successfully
- homepage renders data from a trivial Convex query

**Depends on:** Step 0

---

## Step 2 - Schema and shared domain model

Status: complete

- [x] Implement `convex/schema.js`
- [x] Add all 6 tables:
  - `markets`
  - `market_events_raw`
  - `market_snapshots_1s`
  - `btc_ticks`
  - `market_summaries`
  - `collector_health`
- [x] Add indexes from `polymarket_btc_5m_final_plan.md`
- [x] Define shared constants/contracts for:
  - outcomes
  - capture modes
  - data quality states
  - snapshot/source quality states
- [x] Define snapshot uniqueness behavior for `marketSlug + secondBucket`
- [x] Add seed/demo query and mutation for one `markets` row

Suggested files:
- `convex/schema.js`
- `convex/markets.js`
- `packages/shared/src/market.js`
- `packages/shared/src/snapshot.js`

**Acceptance test:**
- Convex schema deploys cleanly
- one market row can be inserted and queried
- shared contracts are reusable in both web and collector code

**Depends on:** Step 1

---

## Step 3 - Discovery: Gamma polling + parser + catalog

Status: complete

- [x] Implement `parseBtcFiveMinuteWindow()`
- [x] Add unit tests for title/slug parsing edge cases
- [x] Implement Gamma fetch + BTC 5m matching
- [x] Implement market upsert logic
- [x] Add active-market discovery cron
- [x] Add one-off historical backfill entrypoint
- [x] Expose queries:
  - `listActiveBtc5m`
  - `listRecentBtc5m`
  - `getBySlug`

Suggested files:
- `packages/shared/src/market.js`
- `convex/internal/discovery.js`
- `convex/crons.js`
- `convex/markets.js`

**Acceptance test:**
- real BTC 5m markets appear in `markets`
- rerunning discovery updates instead of duplicating
- parser tests pass for known examples

**Depends on:** Step 2

---

## Step 4 - Catalog dashboard

Status: complete

- [x] Build dashboard on `/`
- [x] Show active + recent markets
- [x] Show slug, question, window times, status, outcome labels, capture mode
- [x] Add basic layout/nav
- [x] Add `/markets/[slug]` scaffold

Suggested files:
- `app/page.js`
- `app/markets/[slug]/page.js`
- `components/`

**Acceptance test:**
- visiting `localhost:3000` shows discovered markets from Convex
- clicking a market opens a detail scaffold

**Depends on:** Step 3

---

## Step 5 - Collector skeleton + ingest path + BTC RTDS

Status: complete

- [x] Implement collector config and Convex client
- [x] Implement Convex HTTP ingest route with shared-secret validation
- [x] Implement Convex ingestion mutations/actions for snapshots, raw events, BTC ticks, and health
- [x] Implement RTDS WebSocket client for Chainlink `btc/usd`
- [x] Write `btc_ticks`
- [x] Update `collector_health`
- [x] Expose latest BTC query for the UI

Suggested files:
- `collector/src/config.js`
- `collector/src/convexClient.js`
- `collector/src/index.js`
- `collector/src/rtds.js`
- `convex/http.js`
- `convex/internal/ingestion.js`
- `convex/btc.js`
- `convex/internal/health.js`

**Acceptance test:**
- collector starts independently
- `btc_ticks` fills with live Chainlink prices
- health table shows heartbeat and last BTC tick time
- dashboard can show latest BTC value

**Depends on:** Step 2

**Can run in parallel with:** Step 4 after Step 3 is done

---

## Step 6 - Polling collector MVP for market snapshots

Status: complete

- [x] Load active markets from Convex
- [x] Batch poll CLOB `/midpoints`
- [x] Batch poll CLOB `/last-trades-prices`
- [x] Poll `/books` for best bid/ask and top-of-book depth in the initial display logic
- [x] Derive normalized `market_snapshots_1s`
- [x] Include:
  - `secondsFromWindowStart`
  - phase
  - displayed-price rule used
  - `btcChainlink`
  - source quality / staleness flags
- [x] Mark `captureMode = poll`

Suggested files:
- `collector/src/index.js`
- `collector/src/clob.js`
- `collector/src/snapshotter.js`
- `convex/snapshots.js`
- `convex/internal/ingestion.js`
- `packages/shared/src/snapshot.js`

**Acceptance test:**
- an active market accumulates one snapshot per second during its window
- snapshots include Chainlink BTC when available
- `secondsFromWindowStart` and phase logic are correct

**Depends on:** Steps 3 and 5

---

## Step 7 - Replay page and live market detail

Status: complete

- [x] Implement full `/markets/[slug]`
- [x] Show market metadata, window, capture mode, and quality state
- [x] Show displayed-probability chart over time
- [x] Show Chainlink BTC chart over the same window
- [x] Show a second-by-second snapshot table
- [x] Show latest debug fields for stale/gap conditions

Suggested files:
- `app/markets/[slug]/page.js`
- `components/charts/`
- `components/marketReplay.js`
- `components/MarketDetailScaffold.js`

**Acceptance test:**
- a market with snapshots renders charts and the snapshot table correctly
- missing data is visible, not hidden

**Depends on:** Step 6

---

## Step 8 - Summary finalizer

Status: complete

- [x] Implement market finalizer logic
- [x] Trigger on market close/resolution plus reconciliation cron
- [x] Compute summary features, including:
  - displayed prices at T0 / T15 / T30 / T60 / T120
  - optional later checkpoints such as T240 / T295 if available and useful
  - max / min / range / stddev
  - first crossing times by threshold
  - BTC move features
- [x] Resolve/store winner explicitly
- [x] Store official/derived start and end BTC references
- [x] Write `market_summaries`
- [x] Update `markets` quality flags and final reference fields

Suggested files:
- `convex/internal/finalize.js`
- `convex/internal/discovery.js`
- `convex/crons.js`
- `convex/summaries.js`
- `packages/shared/src/summary.js`

**Acceptance test:**
- resolved markets automatically produce one `market_summaries` row
- summary output matches manual checks on at least one real market
- incomplete markets are marked `partial` or `gap`

**Depends on:** Steps 5 and 6

---

## Step 9 - Analytics page

Status: complete

- [x] Implement analytics queries for threshold stats and calibration
- [x] Build `/analytics`
- [x] Show win rate by Up/Down probability threshold at T15 / T30 / T60 / T120
- [x] Show calibration table
- [x] Show first-crossing-time distributions
- [x] Add filters for date range, quality, and minimum sample size

Suggested files:
- `convex/analytics.js`
- `app/analytics/page.js`

**Acceptance test:**
- analytics page answers questions like:
  - when `Up >= 0.70` at `T+60s`, how often does `Up` win?
- analytics uses stored summaries, not browser-side recomputation

**Depends on:** Step 8

---

## Step 10 - Market WebSocket collector rollout

Status: complete

- [x] Implement market WebSocket client
- [x] Subscribe for both outcome token IDs per active market
- [x] Persist raw events to `market_events_raw`
- [x] Maintain in-memory market state/orderbook state
- [x] Derive 1-second snapshots from WebSocket state
- [x] Implement reconnect, backoff, jitter, and resubscription
- [x] Batch writes through a sender module
- [x] Expand `collector_health` reporting
- [x] Run polling and WebSocket side-by-side until snapshot parity is acceptable
- [x] Keep polling as the default live capture mode while parity is measured

Suggested files:
- `collector/src/marketWs.js`
- `collector/src/state.js`
- `collector/src/snapshotter.js`
- `collector/src/reconnect.js`
- `collector/src/sender.js`

**Acceptance test:**
- raw events are stored
- snapshots survive reconnects
- health status shows reconnect count and last event times
- WebSocket snapshots are trusted before polling is demoted to fallback/repair mode

**Depends on:** Steps 5 and 6

---

## Step 11 - Backfill, repair, and hardening

Status: in progress

- [ ] Implement Gamma historical backfill
- [ ] Implement coarse repair using `prices-history` only where acceptable
- [x] Add dedupe safeguards to snapshot/raw-event ingest
- [x] Add reconciliation for stale active markets and missing summaries
- [ ] Add integration tests for the full ingest/finalize flow
- [x] Add unit tests for:
  - display-price derivation
  - second bucketing
  - staleness
  - summary features
- [x] Decide retention policy for raw events
- [x] Document local dev and deployment flow

**Acceptance test:**
- collector restarts do not silently corrupt data
- gaps are flagged instead of ignored
- tests pass
- local runbook exists for web + Convex + collector

**Depends on:** Steps 8 and 10

---

## Progress map

| Step | Name | Depends on | Notes |
|------|------|------------|-------|
| 0 | Preflight | — | read local Next.js docs first |
| 1 | Foundation | 0 | JS + Convex + skeleton |
| 2 | Schema | 1 | storage and shared contracts |
| 3 | Discovery | 2 | parser + cron + catalog |
| 4 | Dashboard | 3 | catalog-only UI |
| 5 | BTC ingest | 2 | collector skeleton + RTDS + health |
| 6 | Polling snapshots | 3, 5 | first full live MVP |
| 7 | Replay page | 6 | charts + detail |
| 8 | Finalizer | 5, 6 | summaries |
| 9 | Analytics | 8 | research UI |
| 10 | WebSocket rollout | 5, 6 | do not remove polling early |
| 11 | Hardening | 8, 10 | repair, tests, ops |

## Recommended implementation chunks

1. Step 0 + Step 1
2. Step 2
3. Step 3 + Step 4
4. Step 5
5. Step 6
6. Step 7
7. Step 8
8. Step 9
9. Step 10
10. Step 11

## Feedback on the older plans

`polymarket_btc_5m_final_plan.md`:
- Best for architecture, schema, and system boundaries.
- Too broad to act as the day-to-day execution checklist by itself.

`IMPLEMENTATION_STEPS.md`:
- Best for momentum because it is concrete and testable.
- Too optimistic about early structure changes.
- Puts BTC RTDS too late in the flow.
- Says “replace polling” too directly; this should be a parity-based rollout.
- Missing the explicit early blockers and source-of-truth decisions.

## Immediate next step

Start with:
- start Step 11 by hardening the collector around restart safety, repair, and retention
- add integration coverage for the full ingest and finalization flow
- leave Gamma historical backfill out until the repair path is stable

That keeps momentum focused on making the rollout durable before polling is ever demoted from primary capture.
