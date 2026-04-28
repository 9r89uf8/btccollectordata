# Decision Algorithm Data Inventory

This file documents what the project currently collects, stores, and derives for the future BTC 5-minute decision algorithm. It is an inventory, not the algorithm plan. Use `decision_algorithm.md` for the current strategy notes and use this file later to decide which inputs are safe to use live.

## Sources Checked

Repo files:

- `convex/schema.js`
- `collector/src/index.js`
- `collector/src/snapshotter.js`
- `collector/src/rtds.js`
- `collector/src/clob.js`
- `collector/src/marketWs.js`
- `collector/src/state.js`
- `convex/http.js`
- `convex/internal/ingestion.js`
- `convex/internal/discovery.js`
- `convex/internal/finalize.js`
- `convex/internal/marketAnalytics.js`
- `convex/internal/marketStabilityAnalytics.js`
- `convex/internal/analyticsRollups.js`
- `packages/shared/src/marketAnalytics.js`
- `packages/shared/src/marketStabilityAnalytics.js`
- `packages/shared/src/analyticsDashboard.js`
- `packages/shared/src/summary.js`
- `packages/shared/src/snapshot.js`

Live Convex queries run on 2026-04-27:

- `analytics:getDatasetHealth`
- `health:getCollectorHealth`
- `status:getProjectShell`
- `markets:listActiveBtc5m`
- `summaries:listRecent {"limit":3}`
- `btc:getLatestChainlinkBtc`

## Current Deployment Snapshot

At query time on 2026-04-27:

- Collector status: `ok`
- Active BTC 5-minute markets: 3
- Poll-backed active markets: 3
- WS-backed active markets: 0
- Persisted snapshot capture mode: `poll`
- Raw event persistence: `false`
- Latest Chainlink BTC tick: fresh, about 1.4 seconds old at query time
- Latest BTC source: `chainlink`, symbol `btc/usd`
- Binance context in recent summaries: not present, `btcBinanceAtStart` and `btcBinanceAtEnd` were null

Analytics dataset:

| Metric | Value |
| --- | ---: |
| `market_analytics` rows | 3337 |
| Clean analytics rows | 3308 |
| `market_stability_analytics` rows | 3336 |
| Clean stability rows | 3308 |
| Resolved markets | 3336 |
| Official resolved outcomes | 3323 |
| Derived-only resolved outcomes | 13 |
| Excluded analytics rows | 29 |
| Complete fresh checkpoints | 3309 |

Clean sample by day:

| Day | Clean rows |
| --- | ---: |
| 2026-04-16 | 270 |
| 2026-04-17 | 288 |
| 2026-04-18 | 288 |
| 2026-04-19 | 288 |
| 2026-04-20 | 288 |
| 2026-04-21 | 288 |
| 2026-04-22 | 288 |
| 2026-04-23 | 285 |
| 2026-04-24 | 278 |
| 2026-04-25 | 288 |
| 2026-04-26 | 288 |
| 2026-04-27 | 171 |

Price-to-beat source:

| Source | Count | Share |
| --- | ---: | ---: |
| Official | 3314 | 99.31% |
| Derived | 23 | 0.69% |
| Missing | 0 | 0.00% |

Summary data quality:

| Quality | Count | Share |
| --- | ---: | ---: |
| `good` | 1945 | 58.29% |
| `partial` | 1375 | 41.20% |
| `gap` | 16 | 0.48% |
| `unknown` | 1 | 0.03% |

Freshness by checkpoint:

| Checkpoint | Missing BTC | Stale BTC |
| ---: | ---: | ---: |
| T+30 | 24 | 3 |
| T+60 | 24 | 3 |
| T+90 | 24 | 3 |
| T+120 | 24 | 3 |
| T+180 | 24 | 2 |
| T+200 | 24 | 1 |
| T+210 | 23 | 1 |
| T+220 | 23 | 1 |
| T+240 | 23 | 1 |
| T+270 | 22 | 1 |
| T+285 | 22 | 1 |
| T+295 | 22 | 1 |

Recent finalized summaries showed `qualityFlags: ["sample_cadence_ms:5000"]`, so the current deployment appears to be collecting recent persisted snapshots at 5-second cadence even though the table stores second buckets and the code can support 1-second polling.

## Collection Pipeline

### Market Discovery

Source:

- Polymarket Gamma API, `/events/keyset`
- Active sync runs from Convex cron every 60 seconds
- Closed-market reconciliation/finalization runs every 15 minutes

Collected into `markets`:

- Market identity: `slug`, `marketId`, `conditionId`, `eventId`
- Human text: `question`, `title`
- Outcome mapping: `outcomeLabels`, `tokenIdsByOutcome`
- Window timing: `windowStartTs`, `windowEndTs`
- Lifecycle: `active`, `closed`, `resolved`, `createdAt`, `acceptingOrdersAt`, `closedAt`, `resolvedAt`
- Resolution references: `winningOutcome`, `resolutionSourceUrl`, `priceToBeatOfficial`, `closeReferencePriceOfficial`
- Derived references: `priceToBeatDerived`, `closeReferencePriceDerived`
- Runtime metadata: `captureMode`, `dataQuality`, `notes`, `createdAtDb`, `updatedAtDb`

Decision relevance:

- Gives the algorithm the active market window, UP/DOWN token IDs, and the reference price.
- `priceToBeatOfficial` is preferred when available.
- `priceToBeatDerived` is populated from Chainlink start ticks when official price-to-beat is missing.

### Chainlink And Optional Binance BTC

Source:

- Polymarket RTDS WebSocket
- Chainlink topic: `crypto_prices_chainlink`, symbol `btc/usd`
- Optional Binance topic: `crypto_prices`, symbol `btcusdt`

Collected into `btc_ticks`:

- `ts`
- `source`
- `symbol`
- `price`
- `receivedAt`
- `isSnapshot`

Current state:

- Chainlink BTC is live and fresh.
- Binance context is optional and appears disabled in the current deployment.

Decision relevance:

- Chainlink is the primary BTC reference for distance-to-beat and current leader.
- Tick freshness is critical. Current analytics treats BTC older than 30 seconds at a checkpoint as stale.

### CLOB Polling Snapshots

Source:

- Polymarket CLOB HTTP endpoints:
  - `/books`
  - `/last-trades-prices`
  - `/midpoints`
- Collector polls active market token IDs using `SNAPSHOT_POLL_MS`.

Collected into `market_snapshots_1s`:

- Market and timing: `marketSlug`, `marketId`, `ts`, `secondBucket`, `secondsFromWindowStart`, `phase`
- UP top-of-book and displayed values:
  - `upBid`
  - `upAsk`
  - `upMid`
  - `upLast`
  - `upDisplayed`
  - `upSpread`
  - `upDepthBidTop`
  - `upDepthAskTop`
- DOWN top-of-book and displayed values:
  - `downBid`
  - `downAsk`
  - `downMid`
  - `downLast`
  - `downDisplayed`
  - `downSpread`
  - `downDepthBidTop`
  - `downDepthAskTop`
- Display logic and context:
  - `displayRuleUsed`
  - `btcChainlink`
  - `btcBinance`
  - `marketImbalance`
  - `sourceQuality`
  - `writtenAt`

Derived snapshot rules:

- Displayed price prefers midpoint when bid, ask, and mid exist and spread is at most 0.10.
- Falls back to last trade, then midpoint, then unknown.
- `sourceQuality` can be `good`, `stale_book`, `stale_btc`, or `gap`.
- Book stale threshold is 5 seconds.
- Snapshot BTC stale threshold is 10 seconds.
- Snapshot rows can be overwritten only within the 5-second finalization grace period for that bucket.

Decision relevance:

- This is the main live market-price input.
- It gives top ask for the current leader:
  - UP leader uses `upAsk`
  - DOWN leader uses `downAsk`
- It gives spread and top ask size/depth, but not the full depth ladder in normalized snapshot rows.
- `marketImbalance` is `upDisplayed + downDisplayed - 1`.

### Market WebSocket Shadow Capture

Source:

- Polymarket market WebSocket
- Subscribes to active UP/DOWN asset IDs.

State maintained in collector memory:

- Books
- Price changes
- Best bid/ask
- Last trade
- Tick-size changes

Optional persisted raw events in `market_events_raw`:

- `marketSlug`
- `marketId`
- `conditionId`
- `assetId`
- `outcome`
- `ts`
- `eventType`
- `eventHash`
- `payload`
- `ingestedAt`
- `collectorSeq`

Current state:

- WebSocket is shadow mode, not primary persisted snapshot source.
- `rawEventPersistenceEnabled` is currently `false`.
- `parityMismatchCount24h` was high at query time, so WS data should not be treated as production-primary yet.

Decision relevance:

- Not a dependable live algorithm input yet.
- Useful for future latency/order-book work once parity and persistence are deliberately enabled.

### Collector Health

Collected into `collector_health`:

- Collector identity and status:
  - `collectorName`
  - `status`
  - `lastHeartbeatAt`
  - `lastError`
- Feed freshness:
  - `lastMarketEventAt`
  - `lastBtcTickAt`
  - `lastBatchSentAt`
  - `lastWsEventAt`
  - `lastWsSnapshotAt`
- Batch counts:
  - `lastBatchRawEvents`
  - `lastBatchSnapshots`
  - `lastBatchBtcTicks`
- Reliability counters:
  - `reconnectCount24h`
  - `gapCount24h`
  - `marketWsReconnectCount24h`
  - `parityMismatchCount24h`
  - `pollOverrunCount24h`
  - `pollFailureCount24h`
  - `partialPollCount24h`
- Poll diagnostics:
  - `lastPollStartedAt`
  - `lastPollCompletedAt`
  - `lastPollDurationMs`
  - `lastPollStatus`
  - `lastPollEndpointErrors`
- Mode flags:
  - `rawEventPersistenceEnabled`
  - `snapshotCaptureMode`

Decision relevance:

- Should be a hard data-quality gate before live trading.
- If collector status is degraded/down, latest BTC is stale, polling failed, or snapshot mode is not trusted, the algorithm should wait.

## Stored Historical Outputs

### Market Summaries

Table: `market_summaries`

Built after markets close by `convex/internal/finalize.js` using snapshots plus boundary BTC references.

Fields:

- Market identity and window: `marketSlug`, `marketId`, `windowStartTs`, `windowEndTs`
- Outcome: `resolvedOutcome`
- Quality: `dataQuality`, `qualityFlags`
- Price references:
  - `priceToBeatOfficial`
  - `priceToBeatDerived`
  - `closeReferencePriceOfficial`
  - `closeReferencePriceDerived`
  - `btcChainlinkAtStart`
  - `btcChainlinkAtEnd`
  - `btcBinanceAtStart`
  - `btcBinanceAtEnd`
- Displayed UP prices:
  - `upDisplayedAtT0`
  - `upDisplayedAtT15`
  - `upDisplayedAtT30`
  - `upDisplayedAtT60`
  - `upDisplayedAtT120`
  - `upDisplayedAtT240`
  - `upDisplayedAtT295`
- Summary stats:
  - `upMax`
  - `upMin`
  - `upRange`
  - `upStdDev`
  - `upMaxDrawdown`
  - `firstTimeAbove60`
  - `firstTimeAbove70`
  - `firstTimeAbove80`
- `finalizedAt`

Decision relevance:

- Historical training/evaluation only.
- Do not use summary fields as live features except as historical priors.

### Market Analytics

Table: `market_analytics`

Built from `markets`, `market_summaries`, and Chainlink `btc_ticks`.

Analytics version:

- `ANALYTICS_VERSION = 3`

Checkpoints:

- T+30
- T+60
- T+90
- T+120
- T+180
- T+200
- T+210
- T+220
- T+240
- T+270
- T+285
- T+295

Per-checkpoint fields:

- `checkpointSecond`
- `checkpointTs`
- `btcAtCheckpoint`
- `btcTickTs`
- `btcTickReceivedAt`
- `btcTickAgeMs`
- `distanceToBeatBps`
- `currentLeader`
- `didCurrentLeaderWin`

Row fields:

- `marketSlug`
- `marketId`
- `windowStartTs`
- `windowEndTs`
- `analyticsVersion`
- `resolvedOutcome`
- `outcomeSource`
- `priceToBeat`
- `priceToBeatSource`
- `summaryPresent`
- `summaryDataQuality`
- `excludedReasons`
- `completeFreshCheckpoints`
- `createdAt`
- `updatedAt`

Exclusion reasons:

- `missing-outcome`
- `derived-only-outcome`
- `missing-price-to-beat`
- `missing-checkpoint-btc`
- `stale-btc`

Decision relevance:

- This is the core historical leader/distance dataset.
- It gives empirical win rates by checkpoint and distance.
- `didCurrentLeaderWin` is a label and must not be used as a live feature.

### Market Stability Analytics

Table: `market_stability_analytics`

Built from `market_analytics` plus full-window market snapshots.

Stability analytics version:

- `STABILITY_ANALYTICS_VERSION = 4`

Important constants:

- Stable/noise deadband: `STABILITY_DEADBAND_BPS = 0.5`
- Near-line threshold: `PRE_NEAR_LINE_BPS = 2`
- Momentum deadband: `MOMENTUM_DEADBAND_BPS = 0.5`
- Minimum path coverage: `MIN_PATH_COVERAGE_PCT = 0.95`
- Valid snapshot cadence range: 1 second to 10 seconds

Path summary fields:

- `closeMarginBps`
- `hardFlipCount`
- `lastSnapshotAgeMsAtClose`
- `maxDistanceBps`
- `maxSnapshotGapMs`
- `noiseTouchCount`
- `pathGood`
- `pathType`
- `postCheckpointSnapshotCoveragePct`
- `snapshotCadenceMs`
- `snapshotCoveragePct`
- `winnerLockAgeAtClose`
- `winnerLockSecond`

Path types:

- `early-lock`
- `mid-lock`
- `late-lock`
- `final-second-flip`
- `chop`
- `near-line-unresolved`
- `unknown`

Per-checkpoint label fields:

- `checkpointInNoise`
- `distanceBps`
- `leader`
- `leaderWonAtClose`
- `stableLeaderWin`
- `noisyLeaderWin`
- `recoveredLeaderWin`
- `flipLoss`
- `unknownPath`

Per-checkpoint post-T fields:

- `postAnyHardFlip`
- `postFirstHardFlipSecond`
- `postHardFlipCount`
- `postLastHardFlipSecond`
- `postMaxAdverseBps`
- `postMinSignedMarginBps`
- `postPathGood`
- `postLastSnapshotAgeMsAtClose`
- `postSnapshotCoveragePct`
- `postTimeUnderwaterSeconds`
- `postTouchedNoise`
- `postMaxSnapshotGapMs`

Per-checkpoint pre-T predictor fields:

- `preCurrentLeadAgeSeconds`
- `preCrossCountLast60s`
- `preDirectionChangeCount`
- `preFlipCount`
- `preLastFlipAgeSeconds`
- `preLeaderDwellPct`
- `preLongestLeadStreakSeconds`
- `preMaxSnapshotGapMs`
- `preNearLineSeconds`
- `prePathGood`
- `preRange60sBps`
- `preRange120sBps`
- `preRealizedVolatility60s`
- `preRealizedVolatility120s`
- `preSnapshotCoveragePct`

Momentum fields:

- `momentum30sBps`
- `momentum30sSide`
- `momentum30sAgreesWithLeader`
- `leaderAlignedMomentum30sBps`
- `momentum60sBps`
- `momentum60sSide`
- `momentum60sAgreesWithLeader`
- `leaderAlignedMomentum60sBps`

Decision relevance:

- Pre-T fields are potential live features if they can be computed from live snapshots through the current checkpoint.
- Post-T fields are historical labels/outcomes only.
- The invariant from the analytics plan applies: predictor fields must use only snapshots at or before checkpoint T.

### Dashboard Rollups

Table: `analytics_dashboard_rollups`

Current key:

- `btc-5m-analytics-dashboard`

Rollup version:

- `DASHBOARD_ROLLUP_VERSION = 5`

Stored payload:

- `v1.health`
- `v1.leader`
- `v2.stability`

Leader rollup includes:

- Dataset health
- Base rates
- Checkpoint baseline win rates
- Checkpoint x distance heatmap
- Distance buckets
- Support floors

Stability rollup includes:

- Stability by checkpoint
- Stability heatmap
- Path type distribution
- Lead-age tables
- Target path-risk checkpoint reports
- Distance x chop diagnostics
- Distance x momentum agreement diagnostics
- Distance x leader age diagnostics
- Durability diagnostics
- Pre-path-shape diagnostics
- Chop bucket definitions and thresholds

Decision relevance:

- Useful as historical priors for estimating `p_est`.
- Some rollup metrics are descriptive cohort statistics, not validated live predictors.
- Cohort durability is explicitly not yet a live predictor.

## Live Decision-Time Inputs Available Now

These can be read or computed while a market is active:

- Active market metadata:
  - `slug`
  - `windowStartTs`
  - `windowEndTs`
  - `tokenIdsByOutcome`
  - `priceToBeatOfficial`
  - `priceToBeatDerived`
  - `captureMode`
  - `dataQuality`
- Latest snapshot for the active market:
  - current phase
  - seconds from window start
  - UP/DOWN bid, ask, midpoint, last, displayed price
  - UP/DOWN spread
  - UP/DOWN top bid/ask depth
  - Chainlink BTC attached to the snapshot
  - source quality
  - market imbalance
- Latest Chainlink BTC tick:
  - price
  - tick timestamp
  - received timestamp
  - age/staleness
- Collector health:
  - feed status
  - polling status
  - reconnect/error counters
  - batch counts
  - capture mode
- Historical priors:
  - checkpoint/distance win rates
  - path-risk splits
  - momentum splits
  - lead-age splits
  - pre-path-shape splits

Live values the algorithm can compute from current inputs:

- Current checkpoint/elapsed seconds
- Current leader:
  - UP if Chainlink BTC is above price-to-beat by more than the noise band
  - DOWN if below by more than the noise band
  - no trade if inside the noise band
- Signed distance:
  - `10000 * (btcPrice - priceToBeat) / priceToBeat`
- Absolute distance bucket
- Current leader ask:
  - UP leader -> `upAsk`
  - DOWN leader -> `downAsk`
- Current leader spread and top depth
- 30s and 60s momentum if enough recent snapshot path exists
- Pre-T lead age, recent flips, near-line time, volatility/range, and coverage if the algorithm builds the same feature calculation online

## Data Not Currently Strong Enough

These are missing, partial, or not reliable enough for first-pass automated decisions:

- No trade execution records:
  - no orders
  - no fills
  - no realized slippage
  - no rejected orders
  - no position sizing history
- No normalized full order-book depth ladder in snapshots:
  - snapshots store top bid/ask prices and top sizes only
  - full raw WS payloads are optional and currently not persisted
- No quote-age field persisted per snapshot:
  - source quality records stale/gap state
  - underlying book timestamp is not stored as its own snapshot field
- Binance BTC context is optional and appears disabled.
- WebSocket market data is shadow mode and currently not primary.
- Raw event persistence is currently disabled.
- Current deployment's recent summary cadence appears to be 5 seconds, not 1 second.
- Dashboard priors are discovery-tier and should not be treated as validated live signals without holdout validation.
- The current analytics do not include fees, market fees, balance constraints, order-placement latency, or available executable size beyond top ask size.

## Decision Algorithm Implications

The first decision algorithm can safely start from these live gates:

- Collector health must be `ok`.
- Latest Chainlink BTC must be fresh.
- Active market must have a usable price-to-beat.
- Latest snapshot must be fresh enough and not `gap`.
- Current leader must be outside the 0.5 bps noise band.
- Entry checkpoint should be in the intended window, likely T+180 to T+240 from `decision_algorithm.md`.
- Use top ask for EV checks, not displayed price.
- Use spread and top ask depth as execution-quality gates.

Historical priors can supply `p_est` candidates:

- Base checkpoint x distance win rate from `market_analytics`
- Stability-adjusted rates from `market_stability_analytics`
- Diagnostic splits from dashboard rollups:
  - chop
  - momentum agreement
  - leader age
  - pre-path shape
  - durability bucket

Do not use these as live predictors without care:

- `didCurrentLeaderWin`
- `leaderWonAtClose`
- `stableLeaderWin`
- `noisyLeaderWin`
- `recoveredLeaderWin`
- `flipLoss`
- any `post*` field
- `resolvedOutcome`
- `closeReferencePrice*`
- final summary stats from `market_summaries`

## Open Questions For Later Planning

- Should the live algorithm read from Convex queries only, or should it run inside the collector process where the freshest CLOB and BTC state already exists?
- Do we want 1-second persisted snapshots in production, or is 5-second cadence acceptable for T+180 to T+240 decisions?
- Should raw market WebSocket persistence be re-enabled for better execution/depth analysis?
- What minimum top ask depth is required for an entry to be actionable?
- What spread threshold should veto a trade?
- Should `sourceQuality = stale_book` be a hard veto or a size/edge tax?
- Should `priceToBeatDerived` be allowed live, or should the algorithm require official price-to-beat once Gamma provides it?
- How should fees and expected slippage be incorporated into `ask <= p_est - cushion`?
- What holdout method will validate the priors before live use:
  - chronological day-level holdout
  - rolling forward test
  - leave-one-market-out for cohort durability

## Short File Map

- Market and snapshot schema: `convex/schema.js`
- Collector runtime: `collector/src/index.js`
- CLOB polling: `collector/src/clob.js`
- Snapshot construction: `collector/src/snapshotter.js`
- BTC RTDS: `collector/src/rtds.js`
- Market WS: `collector/src/marketWs.js`, `collector/src/state.js`
- Ingest route: `convex/http.js`
- Ingest mutations: `convex/internal/ingestion.js`
- Market discovery: `convex/internal/discovery.js`
- Finalization and summaries: `convex/internal/finalize.js`, `packages/shared/src/summary.js`
- Checkpoint analytics: `convex/internal/marketAnalytics.js`, `packages/shared/src/marketAnalytics.js`
- Stability analytics: `convex/internal/marketStabilityAnalytics.js`, `packages/shared/src/marketStabilityAnalytics.js`
- Rollups: `convex/internal/analyticsRollups.js`, `packages/shared/src/analyticsDashboard.js`
- Public queries for live data: `convex/markets.js`, `convex/snapshots.js`, `convex/btc.js`, `convex/health.js`, `convex/analytics.js`
