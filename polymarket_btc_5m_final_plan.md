# Final implementation plan: Polymarket BTC Up/Down 5-minute tracker

## Purpose
Build a production-ready app that:
1. discovers every Polymarket BTC Up/Down 5-minute market,
2. captures its live price movement and orderbook state during the market window,
3. stores official settlement-aligned BTC reference prices,
4. materializes second-by-second features for analytics,
5. lets a researcher test whether the likely winner becomes clearer after 15s / 30s / 60s / 120s.

This plan assumes:
- frontend: Next.js
- database + reactive backend: Convex
- live collector: separate long-running Node.js process
- deployment target: Vercel (frontend) + Convex + one small worker/container for collector

## Final decisions
- Treat these markets as `Up` / `Down`, not hardcoded `Yes` / `No`.
- Treat Chainlink `btc/usd` as the canonical reference series for settlement-aligned analytics.
- Treat Binance `btcusdt` as optional secondary context only.
- Use Gamma as the source of truth for market discovery.
- Use a separate Node collector for live WebSockets.
- Use Convex for storage, cron jobs, internal mutations, and app queries.
- Ship in two phases:
  - Phase 1: polling MVP
  - Phase 2: websocket collector (target architecture)

## Why this design
Polymarket discovery lives in Gamma, live market updates live on the market WebSocket, and external live BTC prices live on RTDS. `prices-history` is aggregated and `fidelity` is minute-based, so it is useful for repair/backfill but not sufficient to capture every intraminute move in a 5-minute market. Convex actions and HTTP actions are useful glue, but actions time out after 10 minutes, so a long-running socket collector should live outside Convex.

## High-level architecture

### Services
- `web`: Next.js app
- `convex`: schema, queries, mutations, cron jobs, HTTP endpoint
- `collector`: long-running Node process

### Data flow
1. Convex cron polls Gamma for active BTC 5-minute markets and upserts catalog rows.
2. Collector loads active markets from Convex.
3. Collector subscribes to Polymarket market WebSocket for both outcome token IDs.
4. Collector subscribes to RTDS Chainlink `btc/usd`; optionally Binance `btcusdt`.
5. Collector writes raw events and 1-second snapshots into Convex in batches.
6. Convex finalizer writes one `market_summary` after market close / resolution.
7. Next.js reads Convex queries for dashboard, replay, and analytics.

## Repository layout

```txt
.
├── apps/
│   └── web/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── markets/[slug]/page.tsx
│       │   └── analytics/page.tsx
│       ├── components/
│       └── lib/
├── convex/
│   ├── schema.ts
│   ├── markets.ts
│   ├── snapshots.ts
│   ├── btc.ts
│   ├── analytics.ts
│   ├── ingest.ts
│   ├── crons.ts
│   ├── http.ts
│   └── internal/
│       ├── discovery.ts
│       ├── ingestion.ts
│       ├── finalize.ts
│       └── health.ts
├── collector/
│   ├── src/
│   │   ├── index.ts
│   │   ├── config.ts
│   │   ├── convexClient.ts
│   │   ├── gammaDiscoveryMirror.ts
│   │   ├── marketWs.ts
│   │   ├── rtds.ts
│   │   ├── state.ts
│   │   ├── snapshotter.ts
│   │   ├── sender.ts
│   │   ├── reconnect.ts
│   │   └── types.ts
│   └── package.json
├── packages/
│   └── shared/
│       ├── src/market.ts
│       ├── src/snapshot.ts
│       └── src/env.ts
├── package.json
└── turbo.json
```

A monorepo is preferred, but a single repo without Turborepo is acceptable if the coding agent keeps `collector/` isolated.

## Environment variables

### web
- `NEXT_PUBLIC_CONVEX_URL`

### convex
- `POLYMARKET_GAMMA_BASE=https://gamma-api.polymarket.com`
- `POLYMARKET_CLOB_BASE=https://clob.polymarket.com`
- `POLYMARKET_RTDS_WSS=wss://ws-live-data.polymarket.com`
- `POLYMARKET_MARKET_WSS=wss://ws-subscriptions-clob.polymarket.com/ws/market`
- `INGEST_SHARED_SECRET=<secret>`

### collector
- `CONVEX_URL`
- `INGEST_SHARED_SECRET`
- `POLYMARKET_MARKET_WSS`
- `POLYMARKET_RTDS_WSS`
- `COLLECTOR_BATCH_MS=1000`
- `COLLECTOR_HEARTBEAT_MS=10000`
- `RTDS_HEARTBEAT_MS=5000`
- `ENABLE_BINANCE_CONTEXT=false`
- `LOG_LEVEL=info`

## Core domain model

### Market identity rules
- Primary business key: `slug`
- Stable market references to store as well:
  - `marketId`
  - `conditionId`
  - `eventId`
- Outcome token map must be explicit, not implied:
  - `outcomeLabels: ["Up", "Down"]`
  - `tokenIdsByOutcome: { up: string, down: string }`

### Time rules
Do not assume a single Polymarket timestamp equals the actual 5-minute trading window.
Store these separately:
- `createdAt`
- `acceptingOrdersAt`
- `windowStartTs`
- `windowEndTs`
- `closedAt`
- `resolvedAt`

`windowStartTs` and `windowEndTs` should be derived from the market title/question when necessary, because the market page can show a trading window like `Apr 13, 2:15PM-2:20PM ET` while also showing a different `Market Opened` timestamp.

## Convex schema

### `markets`
One row per BTC 5-minute market.

Fields:
- `_id`
- `slug: string`
- `marketId: string`
- `conditionId: string | null`
- `eventId: string | null`
- `question: string`
- `title: string | null`
- `outcomeLabels: { upLabel: string, downLabel: string }`
- `tokenIdsByOutcome: { up: string, down: string }`
- `createdAt: number | null`
- `acceptingOrdersAt: number | null`
- `windowStartTs: number`
- `windowEndTs: number`
- `closedAt: number | null`
- `resolvedAt: number | null`
- `active: boolean`
- `closed: boolean`
- `resolved: boolean`
- `winningOutcome: "up" | "down" | null`
- `resolutionSourceUrl: string | null`
- `priceToBeatOfficial: number | null`
- `priceToBeatDerived: number | null`
- `closeReferencePriceOfficial: number | null`
- `closeReferencePriceDerived: number | null`
- `captureMode: "poll" | "ws" | "backfill"`
- `dataQuality: "good" | "partial" | "gap" | "unknown"`
- `notes: string | null`
- `createdAtDb: number`
- `updatedAtDb: number`

Indexes:
- by `slug`
- by `marketId`
- by `conditionId`
- by `windowStartTs`
- by `active, windowStartTs`
- by `resolved, windowEndTs`

### `market_events_raw`
Append-only raw socket event log.

Fields:
- `_id`
- `marketSlug: string`
- `marketId: string`
- `conditionId: string | null`
- `assetId: string`
- `outcome: "up" | "down"`
- `ts: number`
- `eventType: "book" | "price_change" | "tick_size_change" | "last_trade_price" | "best_bid_ask" | "new_market" | "market_resolved"`
- `eventHash: string | null`
- `payload: any`
- `ingestedAt: number`
- `collectorSeq: number`

Indexes:
- by `marketSlug, ts`
- by `assetId, ts`
- by `eventType, ts`

### `market_snapshots_1s`
Exactly one normalized snapshot per market per second.

Fields:
- `_id`
- `marketSlug: string`
- `marketId: string`
- `ts: number`
- `secondBucket: number`
- `secondsFromWindowStart: number`
- `phase: "pre" | "live" | "post"`
- `upBid: number | null`
- `upAsk: number | null`
- `upMid: number | null`
- `upLast: number | null`
- `upDisplayed: number | null`
- `upSpread: number | null`
- `upDepthBidTop: number | null`
- `upDepthAskTop: number | null`
- `downBid: number | null`
- `downAsk: number | null`
- `downMid: number | null`
- `downLast: number | null`
- `downDisplayed: number | null`
- `downSpread: number | null`
- `downDepthBidTop: number | null`
- `downDepthAskTop: number | null`
- `displayRuleUsed: "midpoint" | "last_trade" | "unknown"`
- `btcChainlink: number | null`
- `btcBinance: number | null`
- `marketImbalance: number | null`
- `sourceQuality: "good" | "stale_book" | "stale_btc" | "gap"`
- `writtenAt: number`

Unique constraint behavior:
- one row per `marketSlug + secondBucket`
- later writes may upsert/overwrite within a tolerance window until the bucket is finalized

Indexes:
- by `marketSlug, secondBucket`
- by `marketSlug, ts`

### `btc_ticks`
All incoming BTC reference prices.

Fields:
- `_id`
- `ts: number`
- `source: "chainlink" | "binance"`
- `symbol: string`
- `price: number`
- `receivedAt: number`
- `isSnapshot: boolean`

Indexes:
- by `source, ts`
- by `symbol, ts`

### `market_summaries`
One row per completed market.

Fields:
- `_id`
- `marketSlug: string`
- `marketId: string`
- `windowStartTs: number`
- `windowEndTs: number`
- `resolvedOutcome: "up" | "down"`
- `priceToBeatOfficial: number | null`
- `priceToBeatDerived: number | null`
- `closeReferencePriceOfficial: number | null`
- `closeReferencePriceDerived: number | null`
- `btcChainlinkAtStart: number | null`
- `btcChainlinkAtEnd: number | null`
- `btcBinanceAtStart: number | null`
- `btcBinanceAtEnd: number | null`
- `upDisplayedAtT0: number | null`
- `upDisplayedAtT15: number | null`
- `upDisplayedAtT30: number | null`
- `upDisplayedAtT60: number | null`
- `upDisplayedAtT120: number | null`
- `upDisplayedAtT240: number | null`
- `upDisplayedAtT295: number | null`
- `upMax: number | null`
- `upMin: number | null`
- `upRange: number | null`
- `upStdDev: number | null`
- `upMaxDrawdown: number | null`
- `firstTimeAbove60: number | null`
- `firstTimeAbove70: number | null`
- `firstTimeAbove80: number | null`
- `qualityFlags: string[]`
- `finalizedAt: number`

Indexes:
- by `windowStartTs`
- by `resolvedOutcome`

### `collector_health`
Fields:
- `_id`
- `collectorName: string`
- `status: "ok" | "degraded" | "down"`
- `lastHeartbeatAt: number`
- `lastMarketEventAt: number | null`
- `lastBtcTickAt: number | null`
- `lastBatchSentAt: number | null`
- `reconnectCount24h: number`
- `gapCount24h: number`
- `lastError: string | null`
- `updatedAt: number`

## Discovery logic

### Goal
Continuously discover all BTC 5-minute markets and keep the local catalog correct.

### Source of truth
Use Gamma for discovery, not the market WebSocket.

### Live discovery job
Run every 15 seconds via Convex cron:
1. Call `GET /events/keyset` with active/open filters where available.
2. Iterate through returned events and attached markets.
3. Keep only markets matching the BTC 5-minute family.
4. Upsert catalog rows.
5. Mark stale markets inactive when they are clearly ended.

### Matching rules for BTC 5-minute family
A market qualifies if at least one of these is true:
- slug starts with `btc-updown-5m-`
- title or question matches `Bitcoin Up or Down -` and contains a 5-minute window
- resolution source indicates Chainlink BTC/USD and market title indicates a 5-minute interval

### Historical backfill job
Use `GET /events/keyset` and `GET /markets/keyset` for stable historical pagination.
Do not use offset-based pagination for large backfills.

### Slug/window parsing
Implement `parseBtcFiveMinuteWindow(questionOrTitle: string): { windowStartTs, windowEndTs, timezone: 'America/New_York' }`.
Requirements:
- parse strings like `Bitcoin Up or Down - April 13, 2:15PM-2:20PM ET`
- normalize to UTC milliseconds for storage
- reject invalid or ambiguous strings
- unit test this heavily

## Collector design

### Phase 1: polling MVP
Purpose: prove ingestion + analytics quickly.

Every 1 second:
1. Load active markets from Convex.
2. Build token list for both outcomes.
3. Fetch `/midpoints` in batches.
4. Fetch `/last-trades-prices` in batches.
5. Optionally fetch `/prices` or `/books` if best bid/ask is needed for the MVP.
6. Fetch Chainlink BTC from RTDS if already implemented; if RTDS is not ready on day 1, add it immediately after.
7. Materialize a 1-second snapshot row per active market.

Notes:
- respect Polymarket rate limits
- batch up to the documented endpoint maximum where supported
- store `captureMode = poll`

### Phase 2: websocket collector
This is the target production design.

#### Market WebSocket
- connect to `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- subscribe using both token IDs per market
- set `custom_feature_enabled: true`
- send `PING` every 10 seconds
- reconnect with exponential backoff + jitter

#### RTDS
- connect to `wss://ws-live-data.polymarket.com`
- subscribe to Chainlink `btc/usd`
- optionally subscribe to Binance `btcusdt`
- send `PING` every 5 seconds
- keep latest tick from each source in memory

#### In-memory state per market
Maintain:
- current best bid/ask for up
- current best bid/ask for down
- current last trade for up/down
- last full book event seen per outcome
- current tick size per outcome
- last event timestamp
- latest Chainlink BTC
- latest Binance BTC

#### Event handling rules
- `book`: replace in-memory book for that outcome
- `price_change`: patch book levels; remove levels where size is `0`
- `best_bid_ask`: update top of book immediately
- `last_trade_price`: update last price and size
- `tick_size_change`: update market state
- `market_resolved`: mark market resolved and schedule finalization
- `new_market`: record raw event, but do not trust it as the sole discovery mechanism

#### Snapshot loop
Every 1 second:
- for each active market, derive one normalized snapshot from current in-memory state
- write snapshots in batches
- keep raw events separate from snapshots

## Snapshot derivation rules

### Displayed probability
For each outcome:
- if bid and ask exist and spread <= 0.10, displayed price = midpoint
- if spread > 0.10 and a last trade exists, displayed price = last trade
- otherwise use midpoint if available, else last trade, else `null`

Store both raw fields and derived `displayed` fields.

### Time bucketing
- second bucket = `Math.floor(ts / 1000) * 1000`
- `secondsFromWindowStart = floor((bucketTs - windowStartTs) / 1000)`
- phase:
  - `< 0` => `pre`
  - `0..299` => `live`
  - `>= 300` => `post`

### Staleness rules
Mark snapshot `sourceQuality` as:
- `good` if market state and BTC tick are both fresh
- `stale_book` if no market update in > 5s
- `stale_btc` if no BTC update in > 5s
- `gap` if either stream is missing long enough that the second cannot be trusted

## Write path into Convex

### Preferred pattern
Collector -> Convex HTTP action -> internal mutations

Reason:
- dedicated private ingest surface
- validates shared secret/HMAC
- keeps public function boundaries clean
- still allows internal mutation batching

### Acceptable alternative
Collector -> `ConvexHttpClient` directly

Use the alternative only if the coding agent wants fewer moving parts. The plan should still keep the write logic in internal helpers for reuse.

### HTTP route
`POST /ingest/polymarket`

Request body:
```ts
{
  secret: string;
  collectorName: string;
  sentAt: number;
  rawEvents?: RawEventInput[];
  snapshots?: SnapshotInput[];
  btcTicks?: BtcTickInput[];
  health?: CollectorHealthInput;
}
```

Validation rules:
- reject missing/invalid secret
- reject oversized payloads
- require monotonic-ish timestamps per batch
- dedupe by `(marketSlug, assetId, ts, eventType, eventHash?)` where possible

Batching rules:
- keep request size comfortably below Convex HTTP action limits
- keep mutation document counts well below Convex per-function limits
- flush every 1 second by default or sooner if a batch gets large

## Finalization logic

### Trigger
Run finalization when:
- market window is over and market is closed/resolved, or
- `market_resolved` event arrives, or
- a delayed cron sweep detects finished unresolved summaries

### Finalizer steps
1. Load `markets` row.
2. Load all `market_snapshots_1s` for that market.
3. Load nearest Chainlink BTC ticks to window start and end.
4. Resolve official winner if available from market metadata / lifecycle event.
5. Compute summary features.
6. Write `market_summaries` row.
7. Update `markets` quality flags and final reference prices.

### Feature set to compute
- displayed Up probability at T0/T15/T30/T60/T120/T240/T295
- max Up probability
- min Up probability
- realized range
- time first crossing 0.6 / 0.7 / 0.8
- max adverse excursion
- signed BTC move from window start to end
- signed BTC move in first 15 / 30 / 60 / 120 seconds
- final correctness label

## Backfill and repair strategy

### Backfill
Use historical Gamma pagination to catalog old markets.

### Repair
If collector downtime causes a gap:
- mark affected markets `dataQuality = gap`
- optionally use `prices-history` / `batch-prices-history` to fill coarse market history
- never pretend repaired minute-level history is equal to websocket-grade capture

### Reconciliation cron
Every 5 minutes:
- find active markets without recent snapshots
- find ended markets without summaries
- detect markets whose expected 300 live snapshots are missing too many seconds
- mark quality flags

## Frontend requirements

### Dashboard (`/`)
Show:
- currently active BTC 5-minute market(s)
- current Up/Down displayed probabilities
- live Chainlink BTC
- collector health
- recent resolved markets

### Market replay page (`/markets/[slug]`)
Show:
- metadata
- official market window
- winner
- line chart of Up displayed probability over time
- line chart of Chainlink BTC over time
- table of second-by-second snapshots
- quality flags / capture mode

### Analytics page (`/analytics`)
Show at minimum:
- win rate by Up probability threshold at T15/T30/T60/T120
- calibration table
- distribution of first time crossing thresholds
- number of markets per bucket
- filters by date range and quality

## API/query surface in Convex

### Public queries
- `markets.listActiveBtc5m`
- `markets.getBySlug`
- `snapshots.listByMarketSlug`
- `analytics.thresholdStats`
- `analytics.calibration`
- `health.getCollectorHealth`

### Internal mutations/actions
- `internal.discovery.upsertMarkets`
- `internal.ingestion.insertRawEvents`
- `internal.ingestion.upsertSnapshots`
- `internal.ingestion.insertBtcTicks`
- `internal.health.upsertCollectorHealth`
- `internal.finalize.finalizeMarket`

### HTTP actions
- `POST /ingest/polymarket`
- optionally `POST /internal/replay-gap-repair`

## Implementation order

### Milestone 1 — project bootstrap
Deliverables:
- Next.js app created
- Convex set up and connected
- monorepo folders in place
- schema stub committed

Acceptance:
- app boots locally
- Convex deploy/dev works
- one demo query returns static data

### Milestone 2 — discovery + catalog
Deliverables:
- Gamma discovery cron
- BTC 5-minute matching logic
- market upsert mutation
- slug/window parser with tests

Acceptance:
- active BTC 5-minute markets appear in DB automatically
- historical backfill can page older markets
- window parsing is correct for known examples

### Milestone 3 — polling MVP
Deliverables:
- batch midpoint polling
- batch last-trade polling
- Chainlink RTDS collector
- snapshot materializer

Acceptance:
- an active market accumulates second-by-second snapshots
- dashboard shows live market and BTC
- replay page renders the last active market

### Milestone 4 — summaries + analytics
Deliverables:
- market summary finalizer
- threshold analytics query
- analytics UI

Acceptance:
- resolved markets produce summaries automatically
- analytics page computes win rate tables from stored summaries

### Milestone 5 — websocket collector
Deliverables:
- market WebSocket client
- raw event storage
- in-memory orderbook state
- 1-second snapshotter from WS state
- reconnect and health reporting

Acceptance:
- raw events are stored for active markets
- snapshots continue through reconnects
- health page shows last event/tick times and reconnect count

### Milestone 6 — hardening
Deliverables:
- gap detection
- coarse repair tooling
- dedupe safeguards
- retention policy decisions
- integration tests

Acceptance:
- system tolerates transient disconnects
- affected markets are flagged instead of silently corrupted

## Non-goals
- placing orders
- authenticated user trading features
- personal Polymarket account integration
- comments ingestion
- sports/equities generalized support in v1
- perfect historical reconstruction from minute-level history

## Testing requirements

### Unit tests
- slug/window parser
- display-price derivation
- second bucketing
- staleness classification
- summary feature calculation

### Integration tests
- Gamma discovery -> market inserted
- RTDS tick -> `btc_ticks` row written
- market WS events -> raw event + snapshot row written
- market resolved -> summary row written

### Manual verification checklist
- compare one known market page against stored metadata
- verify stored window start/end equals title window
- verify Chainlink start/end prices match summary logic
- verify Up/Down winner matches Polymarket page

## Operational notes
- log every reconnect with reason
- log subscription set size
- emit warning if active market count changes unexpectedly
- batch writes at 1 second by default
- do not block collector on frontend concerns
- raw events are append-only; summaries are recomputable

## What the coding agent should do first
1. scaffold monorepo + Convex + Next.js
2. implement schema.ts
3. implement Gamma discovery cron + parser
4. build active markets dashboard from catalog only
5. add RTDS Chainlink BTC collector
6. add polling snapshots
7. add summary finalizer
8. add analytics page
9. replace polling market ingest with market WebSocket collector

## Definition of done
The project is done when:
- new BTC 5-minute markets appear automatically in `markets`
- active markets accumulate one snapshot per second during their window
- raw websocket events are stored for markets captured in WS mode
- Chainlink `btc/usd` ticks are stored continuously
- each resolved market produces a `market_summary`
- the analytics page can answer questions like “when Up is above 0.70 at T+60s, how often does Up win?”
- markets with missing data are explicitly flagged, not silently treated as complete

## Nice-to-have after v1
- downloadable CSV exports
- feature engineering jobs for model training
- alerting on collector downtime
- market similarity search / clustering
- support for ETH/SOL/XRP versions of the same product family
