# Recommended Paper Trading Agent Plan


The best version is a hybrid:

- Keep the first plan's replay-first discipline, pure engine module, richer audit fields, and support-floor caution.
- Keep the second plan's concrete risk-flag definitions, simple one-entry policy, `/paper` UI separation, and operational phasing.
- Fix the verified mismatches: path-risk features should mirror `marketStabilityAnalytics.js`, near-line-heavy uses `PRE_NEAR_LINE_BPS = 2`, stale BTC should default to the existing 30 second analytics freshness rule, and live paper state should use an explicit `status` instead of indexing a nullable `result` object.

## Verified Source Of Truth

The analytics page itself is only a shell:

```text
app/analytics/page.js
  -> components/AnalyticsDashboard.js
  -> api.analytics.getDashboard
  -> analytics_dashboard_rollups
  -> packages/shared/src/analyticsDashboard.js
```

The relevant analytics constants and feature definitions are in:

```text
packages/shared/src/analyticsDashboard.js
packages/shared/src/marketStabilityAnalytics.js
packages/shared/src/marketAnalytics.js
```

Current rollup checks from `npx convex run analytics:getLeaderAndDistance '{}'` and `npx convex run analytics:getDatasetHealth '{}'`:

- Rollup data through `2026-04-30 23:26:05 UTC`.
- `analyticsRows`: 4,222.
- `cleanAnalyticsCount`: 4,172.
- `cleanStabilityCount`: 4,169.
- T+220 `5-7.5 bps` leader win rate: 88.7%, N 636.
- T+220 `7.5-10 bps` leader win rate: 92.7%, N 450.
- T+220 `>10 bps` leader win rate: 97.9%, N 805.
- T+240 `4-5 bps` leader win rate: 89.8%, N 332.
- T+240 `5-7.5 bps` leader win rate: 89.7%, N 651.
- T+240 `>10 bps` leader win rate: 98.2%, N 839.

These support the simple threshold idea:

```text
T+220..239: require at least 5.0 bps before risk taxes.
T+240..285: require at least 4.0 bps before risk taxes.
```

Do not depend on unverified numeric claims copied into a plan. Re-check the Convex rollup before changing thresholds.

## V0 Strategy

The paper agent is a current-leader follower:

1. Watch BTC versus `priceToBeat`.
2. Wait until at least T+220.
3. If BTC is far enough above `priceToBeat`, paper-buy `up`.
4. If BTC is far enough below `priceToBeat`, paper-buy `down`.
5. Skip fragile paths.
6. Never turn a fragile `up` leader into a `down` bet or vice versa.

Market odds are logged for review and simulated PnL only. They are not entry criteria.

## V0 Decision Rule

Evaluate each live market once per second in the runner.

Inputs:

- `market.slug`
- `market.marketId`
- `market.windowStartTs`
- `market.windowEndTs`
- `market.priceToBeatOfficial`
- `market.priceToBeatDerived`
- recent `market_snapshots_1s`
- latest usable Chainlink BTC from snapshot or `btc_ticks`

Reference line:

```text
priceToBeat = priceToBeatOfficial ?? priceToBeatDerived
```

Distance:

```text
distanceBps = ((btc - priceToBeat) / priceToBeat) * 10000
absDistanceBps = abs(distanceBps)
```

Leader:

```text
absDistanceBps <= 0.5 => no decision
distanceBps > 0.5    => up
distanceBps < -0.5   => down
```

Hard skips:

- Already has a paper trade for this `marketSlug` and `strategyVersion`.
- Missing `priceToBeat`.
- Latest Chainlink BTC is missing or stale by more than `30_000 ms`.
- `secondsElapsed < 220`.
- `secondsElapsed > 285`.
- `absDistanceBps <= 0.5`.
- Pre-decision snapshot coverage is below 95%.
- Two or more V0 risk flags are true.

Threshold:

```text
baseRequiredBps =
  secondsElapsed >= 240 ? 4.0 : 5.0

requiredBps =
  baseRequiredBps + (riskCount === 1 ? 2.5 : 0)

if absDistanceBps >= requiredBps:
  paper-buy current leader
else:
  skip
```

## Risk Flags

V0 should use the three risk flags already encoded in the dashboard hourly definitions. Log momentum, but do not gate on it until replay proves it improves the rule.

| Flag | Exact V0 definition |
|---|---|
| `recentLock` | `preCurrentLeadAgeSeconds < 30` or `preLastFlipAgeSeconds < 30` |
| `multiFlipChop` | `preCrossCountLast60s >= 2` or `preFlipCount >= 3` |
| `nearLineHeavy` | `preNearLineSeconds >= 30` or `preNearLineSeconds / secondsElapsed >= 0.25` |

Important: `preNearLineSeconds` should mirror `marketStabilityAnalytics.js`, where near-line means `abs(marginBps) <= PRE_NEAR_LINE_BPS`, and `PRE_NEAR_LINE_BPS = 2`.

Do not compute near-line-heavy from the 0.5 bps no-decision band. The 0.5 bps value is for stable/noise state classification, not the pre-path near-line feature.

## Reuse The Analytics Feature Code

Do not duplicate path-feature logic loosely from either plan.

Refactor or export a small shared helper from `packages/shared/src/marketStabilityAnalytics.js` so the paper engine and analytics materializer agree on:

- `STABILITY_DEADBAND_BPS = 0.5`
- `PRE_NEAR_LINE_BPS = 2`
- `MOMENTUM_DEADBAND_BPS = 0.5`
- `MIN_PATH_COVERAGE_PCT = 0.95`
- pre-current lead age
- pre-last flip age
- pre-flip count
- pre-cross count last 60 seconds
- pre-near-line seconds
- 30s and 60s momentum fields

Suggested helper:

```text
buildLivePathFeatures({ market, snapshots, nowTs })
```

It should use only snapshots at or before `nowTs`. That keeps the no-lookahead contract identical between replay and live paper.

## Runtime Architecture

Use a three-part design.

### 1. Pure Engine

Create:

```text
packages/shared/src/paperTradingEngine.js
packages/shared/src/paperTradingEngine.test.js
```

Exports:

- `signedDistanceBps`
- `leaderFromDistance`
- `computeRiskFlags`
- `maybeCreatePaperDecision`
- `settlePaperTrade`

The engine accepts plain JavaScript objects and returns either:

```text
{ action: "skip", reason, diagnostics }
```

or:

```text
{ action: "paper_trade", trade }
```

### 2. Convex Storage And API

Create:

```text
convex/paperTrades.js
```

Add table:

```js
paper_trades: defineTable({
  marketSlug: v.string(),
  marketId: v.string(),
  runId: v.string(),
  strategyVersion: v.string(),
  engineVersion: v.number(),

  paper: v.boolean(),
  status: v.union(
    v.literal("open"),
    v.literal("settled"),
    v.literal("void")
  ),

  side: outcomeValue,
  stakeUsd: v.number(),
  entryTs: v.number(),
  entrySecond: v.number(),
  secondsRemaining: v.number(),

  windowStartTs: v.number(),
  windowEndTs: v.number(),
  priceToBeat: v.number(),
  priceToBeatSource: analyticsSourceValue,
  btcAtEntry: v.number(),
  btcTickTs: nullable(v.number()),
  btcAgeMs: nullable(v.number()),

  distanceBps: v.number(),
  absDistanceBps: v.number(),
  requiredDistanceBps: v.number(),
  baseRequiredDistanceBps: v.number(),

  riskFlags: v.object({
    recentLock: v.boolean(),
    multiFlipChop: v.boolean(),
    nearLineHeavy: v.boolean(),
  }),
  riskCount: v.number(),

  pathFeatures: v.object({
    preCurrentLeadAgeSeconds: nullable(v.number()),
    preLastFlipAgeSeconds: nullable(v.number()),
    preFlipCount: nullable(v.number()),
    preCrossCountLast60s: nullable(v.number()),
    preNearLineSeconds: nullable(v.number()),
    preSnapshotCoveragePct: nullable(v.number()),
    momentum30sAgreesWithLeader: optionalNullable(v.boolean()),
    leaderAlignedMomentum30sBps: optionalNullable(v.number()),
  }),

  entryMarketPrice: nullable(v.number()),
  upDisplayed: nullable(v.number()),
  downDisplayed: nullable(v.number()),
  upSpread: nullable(v.number()),
  downSpread: nullable(v.number()),

  closeBtc: nullable(v.number()),
  actualWinner: optionalNullable(v.union(outcomeValue, v.literal("tie"))),
  correct: nullable(v.boolean()),
  shares: nullable(v.number()),
  pnlUsd: nullable(v.number()),
  resultSource: optionalNullable(
    v.union(v.literal("official"), v.literal("derived"), v.literal("tie"))
  ),
  settledAt: nullable(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_marketSlug_strategyVersion", ["marketSlug", "strategyVersion"])
  .index("by_status_windowEndTs", ["status", "windowEndTs"])
  .index("by_entryTs", ["entryTs"])
  .index("by_runId", ["runId"]);
```

Mutation/query API:

- `getByMarketSlug({ marketSlug, strategyVersion })`
- `insertDecision({ trade })`
- `listOpen({ limit })`
- `listRecent({ limit })`
- `listSettled({ limit })`
- `settle({ id, result })`
- `getStats({ strategyVersion })`

Insert guardrails:

- Reject `paper !== true`.
- Reject missing core fields.
- Check `by_marketSlug_strategyVersion` before insert and return the existing trade if present.

### 3. Replay And Live Runner

Start with scripts, not Convex cron:

```text
scripts/paperAgentReplay.js
scripts/paperAgent.js
```

Reason: scripts are easier to stop, inspect, and iterate while this is still an experimental paper strategy. Convex crons can be added later by calling the same engine once replay and live soak are stable.

Replay script:

1. Load resolved clean markets.
2. Load each market's snapshots.
3. Simulate T+220 through T+285 using only snapshots available at each simulated second.
4. Enter at the first passing second.
5. Settle with known outcome/close reference.
6. Write a markdown/JSON report, not database rows by default.

Live script:

1. Query active BTC 5-minute markets.
2. For each live market, load recent snapshots.
3. Check existing paper trade.
4. Call `maybeCreatePaperDecision`.
5. Insert only paper trades, not every skip.
6. Settle open rows after close.

Optional later:

```text
convex/internal/paperTrades.js
convex/crons.js
```

Only add cron execution after the runner has produced stable paper logs.

## Settlement

Settlement priority:

1. Use `markets.winningOutcome` if official.
2. Else compare official close BTC to `priceToBeat`.
3. Else compare derived close BTC to `priceToBeat`.
4. Else leave `status = "open"` until data appears.

Winner:

```text
closeBtc > priceToBeat => up
closeBtc < priceToBeat => down
closeBtc == priceToBeat => tie
```

Pnl:

```text
if entryMarketPrice is missing or entryMarketPrice <= 0:
  shares = null
  pnlUsd = null
else:
  shares = stakeUsd / entryMarketPrice
  pnlUsd = correct ? shares - stakeUsd : -stakeUsd
```

`correct` should be `null` for ties or void rows.

## UI

Create a separate route:

```text
app/paper/page.js
components/PaperTradingDashboard.js
```

Do not put live paper state on `/analytics`; that page is intentionally labeled "Reference-only" and "No live signals".

V0 UI:

- Open paper trades.
- Recent settled paper trades.
- Aggregate win rate.
- Win rate by entry window: T+220-239 and T+240-285.
- Win rate by risk count.
- Average entry distance.
- Simulated PnL where market price existed.

## Defaults

```text
strategyVersion = leader_distance_v0
engineVersion = 1
stakeUsd = 5
decisionStartSecond = 220
decisionEndSecond = 285
noiseBps = 0.5
nearLineBps = 2.0
baseThreshold220To239 = 5.0
baseThreshold240Plus = 4.0
oneRiskTaxBps = 2.5
maxRiskCount = 1
staleBtcMs = 30000
minPreSnapshotCoveragePct = 0.95
```

## Implementation Order

1. Refactor/export shared live pre-path feature helpers from `marketStabilityAnalytics.js`.
2. Add `paperTradingEngine.js` and unit tests.
3. Add replay script and generate a report.
4. Review replay trade rate, win rate, risk breakdown, and PnL sanity.
5. Add `paper_trades` schema and `convex/paperTrades.js`.
6. Add live `scripts/paperAgent.js`.
7. Let it paper trade for a soak period.
8. Add `/paper` dashboard.
9. Decide whether to keep the runner, fold it into the collector, or move execution to Convex cron.

## Acceptance Criteria Before Live Paper

- Replay uses no post-decision fields for entry.
- Live and replay use the same pure engine.
- Path-risk fields match the analytics definitions, especially `PRE_NEAR_LINE_BPS = 2`.
- No more than one paper trade per market and strategy version.
- Every trade row has enough fields to explain why it fired.
- Settlement can be rerun idempotently.

## Non-Goals

- No real orders.
- No order sizing.
- No averaging in.
- No exits.
- No reversal bets.
- No ML model.
- No dynamic self-tuning in V0.
- No market-odds-based entry criteria.
