# Paper Trading Engine Report

Last updated: 2026-05-02

This report explains how the paper trading engine works, what data it consumes, how it decides to enter a simulated trade, how it sizes the trade in paper mode, how settlement and PnL are calculated, and where the current implementation lives in the repo.

## Executive Summary

The paper trading engine is a rule-based BTC 5-minute current-leader strategy.

It does not place real orders. It creates simulated paper trades when BTC is far enough above or below the market's `priceToBeat` late in the 5-minute window. The core idea is:

1. Wait until the market is mature enough, starting at `T+220s`.
2. Determine whether BTC is clearly above or below the line.
3. Treat the current leader as the side to buy: above means `up`, below means `down`.
4. Reject noisy, stale, low-quality, or fragile paths.
5. Require a larger distance when the path has one risk flag.
6. Insert at most one paper trade per market and strategy version.
7. Settle the simulated trade after the market resolves.

The strategy is intentionally simple. It follows the current leader only. It does not reverse the signal, average in, exit early, place real orders, or self-tune thresholds.

## Source Files

The current paper trading system is split into pure logic, persistence, live execution, replay, and UI.

| Area | File |
|---|---|
| Pure decision engine | `packages/shared/src/paperTradingEngine.js` |
| Engine tests | `packages/shared/src/paperTradingEngine.test.js` |
| Shared path features | `packages/shared/src/marketStabilityAnalytics.js` |
| Convex schema | `convex/schema.js` |
| Convex paper trade API | `convex/paperTrades.js` |
| Live runner | `scripts/paperAgent.js` |
| Replay runner | `scripts/paperAgentReplay.js` |
| Dashboard route | `app/paper/page.js` |
| Dashboard component | `components/PaperTradingDashboard.js` |

## Runtime Data Flow

The live paper agent does not talk directly to Polymarket or Chainlink. It reads normalized data from Convex, which is written by the collector.

```text
Collector
  -> markets
  -> market_snapshots_1s
  -> btc_ticks
  -> Convex

Paper agent
  -> queries Convex active BTC 5m markets
  -> queries latest Chainlink BTC
  -> queries recent 1s market snapshots
  -> calls pure engine
  -> writes accepted paper trades to paper_trades
  -> settles open paper trades after close

/paper UI
  -> queries paper_trades stats and recent rows
  -> displays open and settled paper trades
```

This design is useful because live paper, replay, UI review, and audit all use the same normalized rows. The collector's job is data capture and normalization. The agent's job is strategy evaluation. That separation makes every paper decision reproducible from stored market and snapshot data.

## Strategy Versions

Current strategy constants:

| Constant | Value |
|---|---|
| Flat paper strategy | `leader_distance_v0` |
| Dynamic sizing paper strategy | `leader_distance_v0_dynamic_sizing` |
| Engine version | `1` |

The live runner defaults to the flat strategy unless started with `--sizing-mode dynamic`.

The `/paper` dashboard summary currently filters stats to `leader_distance_v0`. The open and recent settled tables call list queries that are not strategy-filtered, so if flat and dynamic are both running, the summary and tables can represent different scopes unless the UI is adjusted.

## Inputs

The engine accepts plain JavaScript objects. This is important because both live mode and replay mode call the same pure function.

Primary inputs:

| Input | Purpose |
|---|---|
| `market.slug` | Stable market key |
| `market.marketId` | Polymarket market id |
| `market.windowStartTs` | Start of the 5-minute market |
| `market.windowEndTs` | End of the 5-minute market |
| `market.priceToBeatOfficial` | Preferred reference line |
| `market.priceToBeatDerived` | Fallback reference line |
| `snapshots` | 1-second market snapshots up to the decision time |
| `latestBtcTick` | Latest Chainlink BTC tick in live mode |
| `existingTrade` | Existing paper trade for this market and strategy |

The reference line is:

```text
priceToBeat = priceToBeatOfficial ?? priceToBeatDerived
```

If neither exists, the engine skips the market.

## Timing Window

The market is 5 minutes long, or 300 seconds.

The engine only considers entries in this window:

```text
decisionStartSecond = 220
decisionEndSecond = 285
```

That means entries are allowed from `T+220s` through `T+285s`.

The engine skips before `T+220s` because the earlier part of the market has more unresolved path risk. It skips after `T+285s` because the market is too close to settlement and the displayed market price/PnL assumptions become less reliable.

Replay simulates every second from `T+220s` to `T+285s` and enters at the first second that passes the rule. Live mode checks active markets on an interval, currently defaulting to once per second.

## BTC Source And Freshness

The engine resolves the latest BTC value from these candidates:

1. `latestBtcTick`, usually from `btc:getLatestChainlinkBtc` in live mode.
2. `latestBtc`, if passed.
3. Latest market snapshot at or before `nowTs`.

The selected BTC candidate must be at or before the decision time.

Freshness rule:

```text
staleBtcMs = 30000
```

If the latest BTC value is more than 30 seconds old, the market is skipped with `stale_btc`.

In replay mode, the script does not pass a live BTC tick. The engine uses the latest available snapshot at the simulated second, which keeps replay from seeing future data.

## Distance And Leader

The core signal is BTC distance from the reference line in basis points.

```text
distanceBps = ((btcAtEntry - priceToBeat) / priceToBeat) * 10000
absDistanceBps = abs(distanceBps)
```

Leader rule:

```text
absDistanceBps <= 0.5 => no leader, skip
distanceBps > 0.5    => current leader is up
distanceBps < -0.5   => current leader is down
```

The `0.5 bps` zone is the noise band. Inside that band the engine does not trust either side enough to enter.

## Path Features

The engine uses `buildLivePathFeatures` from `marketStabilityAnalytics.js`. This is the same shared feature logic used for analytics, so the live paper agent and replay are not using a separate definition of path risk.

Important constants:

| Constant | Value |
|---|---:|
| `STABILITY_DEADBAND_BPS` | `0.5` |
| `PRE_NEAR_LINE_BPS` | `2.0` |
| `MIN_PATH_COVERAGE_PCT` | `0.95` |
| Minimum snapshot cadence | `1000 ms` |
| Maximum snapshot cadence | `10000 ms` |

The path-feature helper only uses snapshots at or before the decision time. It caps snapshots at `nowTs`, normalizes them against `priceToBeat`, computes the BTC margin in bps for each snapshot, and labels each snapshot as:

```text
up     if margin >= 0.5 bps
down   if margin <= -0.5 bps
noise  otherwise
```

The engine requires the pre-decision path to be good enough:

```text
preSnapshotCoveragePct >= 0.95
prePathGood === true
```

`prePathGood` also depends on snapshot cadence, maximum gap size, and latest snapshot age. This prevents the engine from entering on paths where the stored data is too sparse to describe what happened before the decision.

## Risk Flags

The engine computes three V0 risk flags from the pre-decision path.

| Flag | Definition | Meaning |
|---|---|---|
| `recentLock` | `preCurrentLeadAgeSeconds < 30` or `preLastFlipAgeSeconds < 30` | The current leader became leader recently or there was a recent flip. |
| `multiFlipChop` | `preCrossCountLast60s >= 2` or `preFlipCount >= 3` | The market crossed the line multiple times and may be choppy. |
| `nearLineHeavy` | `preNearLineSeconds >= 30` or `preNearLineSeconds / secondsElapsed >= 0.25` | The market spent too much time close to the line. |

Near-line uses `PRE_NEAR_LINE_BPS = 2`, not the smaller `0.5 bps` no-decision band.

Risk count:

```text
riskCount = count(true risk flags)
```

The engine allows:

```text
maxRiskCount = 1
```

If two or three risk flags are true, the engine skips with `too_many_risk_flags`.

## Required Distance

The engine uses a base threshold based on the entry time.

```text
baseRequiredBps =
  secondsElapsed >= 240 ? 4.0 : 5.0
```

Then it adds a risk tax if exactly one risk flag is present.

```text
requiredDistanceBps =
  baseRequiredBps + (riskCount === 1 ? 2.5 : 0)
```

Current threshold table:

| Entry time | Risk count | Required distance |
|---|---:|---:|
| `T+220s` to `T+239s` | `0` | `5.0 bps` |
| `T+220s` to `T+239s` | `1` | `7.5 bps` |
| `T+240s` to `T+285s` | `0` | `4.0 bps` |
| `T+240s` to `T+285s` | `1` | `6.5 bps` |

If:

```text
absDistanceBps < requiredDistanceBps
```

the engine skips with `below_required_distance`.

If:

```text
absDistanceBps >= requiredDistanceBps
```

the engine creates a paper trade on the current leader.

## Decision Tree

This is the current entry decision in order.

1. If there is no market, skip `missing_market`.
2. Resolve `marketSlug`.
3. Resolve `priceToBeat` from official, then derived.
4. If an existing paper trade exists for this market and strategy, skip `existing_paper_trade`.
5. If `priceToBeat` is missing, skip `missing_price_to_beat`.
6. If market start or end timestamp is missing, skip `missing_market_window`.
7. Resolve the latest BTC value.
8. If BTC is missing, skip `missing_btc`.
9. If BTC is stale by more than 30 seconds, skip `stale_btc`.
10. If before `T+220s`, skip `before_decision_window`.
11. If after `T+285s`, skip `after_decision_window`.
12. Compute `distanceBps`.
13. If distance is inside the `0.5 bps` noise band, skip `inside_noise_band`.
14. Build pre-decision path features using only snapshots at or before `nowTs`.
15. If pre-snapshot coverage is below 95%, skip `insufficient_pre_snapshot_coverage`.
16. If pre-path quality is not good, skip `insufficient_pre_path_quality`.
17. Compute risk flags and `riskCount`.
18. If `riskCount > 1`, skip `too_many_risk_flags`.
19. Compute required distance from entry time and risk count.
20. If distance is below required, skip `below_required_distance`.
21. Resolve the displayed market price for the selected side.
22. Resolve paper stake size.
23. Return `{ action: "paper_trade", trade }`.

## Entry Side

The side is always the current BTC leader:

```text
distanceBps > 0 => side = up
distanceBps < 0 => side = down
```

The engine does not fade the move. It does not say "BTC is above the line, so bet down." It follows the current leader if the current leader is far enough from the line and the path is acceptable.

## Market Price At Entry

The engine records the displayed Polymarket price at entry for the chosen side.

For an `up` trade, it checks:

```text
upDisplayed
upAsk
upMid
upLast
```

For a `down` trade, it checks:

```text
downDisplayed
downAsk
downMid
downLast
```

The first finite value is used as `entryMarketPrice`.

In flat mode, market price is not an entry criterion. It is used later for simulated share count and PnL.

In dynamic sizing mode, market price affects stake size. If the price is too high, the dynamic sizing function uses a smaller stake even if the signal passes the entry rule.

## Position Sizing

Flat sizing is the default.

```text
sizingMode = flat
stakeUsd = 5
```

In flat mode, every paper trade uses the configured stake, defaulting to `$5`.

Dynamic sizing is available in paper mode only:

```text
--sizing-mode dynamic
```

Dynamic sizing rules:

| Tier | Rule | Stake |
|---|---|---:|
| High | `riskCount === 0`, clearance at least `3 bps`, entry price `<= 0.90` | `$5` |
| Medium | `riskCount <= 1`, clearance at least `1 bps`, entry price `<= 0.95` | `$3` |
| Low | Any other trade that passed the entry rule | `$1` |

Where:

```text
clearanceBps = absDistanceBps - requiredDistanceBps
```

Dynamic sizing does not change whether the engine buys. It changes only how much paper money is assigned to the accepted trade.

## Paper Trade Record

When the engine accepts a trade, it returns a full audit row. Key fields include:

| Field | Meaning |
|---|---|
| `marketSlug` | Market identifier |
| `strategyVersion` | Strategy variant |
| `engineVersion` | Engine version |
| `status` | Starts as `open` |
| `side` | `up` or `down` |
| `stakeUsd` | Simulated dollars used |
| `entryTs` | Entry timestamp |
| `entrySecond` | Seconds from market start |
| `secondsRemaining` | Seconds until market end |
| `priceToBeat` | Reference line |
| `btcAtEntry` | BTC value used for decision |
| `distanceBps` | Signed distance from line |
| `absDistanceBps` | Absolute distance from line |
| `requiredDistanceBps` | Required threshold after risk tax |
| `baseRequiredDistanceBps` | Required threshold before risk tax |
| `riskFlags` | The three risk booleans |
| `riskCount` | Number of active risk flags |
| `pathFeatures` | Pre-decision path diagnostics |
| `entryMarketPrice` | Displayed market price at entry |
| `upDisplayed`, `downDisplayed` | Snapshot prices at entry |
| `upSpread`, `downSpread` | Snapshot spread fields |
| `pnlUsd` | Filled at settlement when possible |

This is why the UI can show not just that a trade happened, but why it happened.

## Convex Insert Rules

Paper trades are stored in the `paper_trades` table.

Important indexes:

```text
by_marketSlug_strategyVersion
by_status_windowEndTs
by_entryTs
by_runId
```

`insertDecision` enforces:

1. The row must be a paper trade: `paper === true`.
2. New rows must start as `status === "open"`.
3. Core fields like market slug, market id, strategy version, and run id must be present.
4. If a row already exists for the same `marketSlug` and `strategyVersion`, the mutation returns the existing row instead of inserting another one.

That gives the system a one-paper-entry-per-market-per-strategy policy.

## Settlement

The live paper agent settles open trades after the market window ends.

Settlement priority:

1. Use `market.winningOutcome` if available.
2. Else compare `market.closeReferencePriceOfficial` against `priceToBeat`.
3. Else compare `market.closeReferencePriceDerived` against `priceToBeat`.
4. Else leave the trade open until result data exists.

Winner calculation:

```text
closeBtc > priceToBeat => up
closeBtc < priceToBeat => down
closeBtc == priceToBeat => tie
```

Correctness:

```text
correct = trade.side === actualWinner
```

For ties, `correct` is `null`.

## PnL Calculation

PnL is gross simulated PnL. It does not currently subtract fees, account for maker/taker classification, slippage, partial fills, or failed fills.

Share count:

```text
shares = stakeUsd / entryMarketPrice
```

PnL:

```text
if correct:
  pnlUsd = shares - stakeUsd
else:
  pnlUsd = -stakeUsd
```

Example:

```text
stakeUsd = 5
entryMarketPrice = 0.80
shares = 6.25

if correct:
  pnlUsd = 6.25 - 5 = 1.25

if wrong:
  pnlUsd = -5
```

If `entryMarketPrice` is missing or invalid, `shares` and `pnlUsd` are `null`.

## Live Runner

The live runner is:

```text
scripts/paperAgent.js
```

Package script:

```text
npm run paper:agent
```

Default options:

| Option | Default |
|---|---|
| `--interval-ms` | `1000` |
| `--limit-open` | `100` |
| `--run-id` | `paper-agent-{timestamp}` |
| `--sizing-mode` | `flat` |
| `--stake-usd` | `5` |
| `--strategy-version` | `leader_distance_v0` |

If dynamic mode is used and no explicit strategy version is passed, the runner switches the strategy version to:

```text
leader_distance_v0_dynamic_sizing
```

Each loop:

1. Query open paper trades and settle any whose market has ended.
2. Query active BTC 5-minute markets.
3. Query latest Chainlink BTC.
4. For each active market, skip upcoming or ended markets.
5. Check for an existing paper trade for the same market and strategy.
6. Load up to 400 snapshots for that market.
7. Call `maybeCreatePaperDecision`.
8. Insert only accepted paper trades.
9. Log counts and skip reasons.

Log shape:

```text
[timestamp] scanned=3 inserted=0 settled=0 skipped=3 skipReasons=below_required_distance:2,existing_paper_trade:1
```

## Replay Runner

The replay runner is:

```text
scripts/paperAgentReplay.js
```

Package script:

```text
npm run paper:replay
```

Default replay mode is `compare`, which compares flat sizing to dynamic sizing side by side.

Replay behavior:

1. Load resolved BTC 5-minute markets from Convex.
2. Load up to 400 snapshots per market.
3. For each market, simulate every second from `T+220s` through `T+285s`.
4. At each simulated second, call the same pure engine used by live mode.
5. Enter at the first passing second.
6. Settle immediately using the known market result.
7. Write markdown and JSON reports.

Useful commands:

```text
npm run paper:replay -- --limit 432 --replay-mode compare --output paper_trading_replay_sizing_compare.md --json-output paper_trading_replay_sizing_compare.json
```

Replay is the main way to test threshold changes before letting them run live.

## Current Replay Baseline

The last baseline with `oneRiskTaxBps = 2.5` over 432 resolved markets produced:

| Strategy | Trades | Win rate | Dollars risked | Gross PnL | ROI | Avg distance | Avg price |
|---|---:|---:|---:|---:|---:|---:|---:|
| Flat `$5` | `183` | `96.2%` | `$915.00` | `$20.60` | `2.3%` | `10.41 bps` | `0.945` |
| Dynamic `$1/$3/$5` | `183` | `96.2%` | `$243.00` | `$7.24` | `3.0%` | `10.41 bps` | `0.945` |

A test change to reduce the one-risk tax from `2.5 bps` to `1.5 bps` increased trades from `183` to `202`, but reduced ROI in this sample. That is why the current engine was changed back to `2.5 bps`.

## Dashboard

The `/paper` page displays:

1. Total paper trades.
2. Open and settled counts.
3. Win rate.
4. Average entry distance.
5. Average entry price.
6. Gross PnL.
7. Dollars risked and ROI.
8. Breakdown by entry window.
9. Breakdown by risk count.
10. Open paper trades.
11. Recent settled trades.

The recent settled trade table links the market slug to:

```text
/markets/[slug]
```

This lets you click from a paper trade into the individual market page for more detailed review.

## Skip Reason Glossary

| Skip reason | Meaning |
|---|---|
| `missing_market` | The engine was called without a market. |
| `existing_paper_trade` | A paper trade already exists for this market and strategy. |
| `missing_price_to_beat` | No official or derived reference line exists. |
| `missing_market_window` | Missing start or end timestamp. |
| `missing_btc` | No usable BTC value at or before the decision time. |
| `stale_btc` | Latest BTC is older than 30 seconds. |
| `before_decision_window` | Market has not reached `T+220s`. |
| `after_decision_window` | Market is past `T+285s`. |
| `inside_noise_band` | BTC is within `0.5 bps` of the line. |
| `insufficient_pre_snapshot_coverage` | Less than 95% pre-decision snapshot coverage. |
| `insufficient_pre_path_quality` | Pre-path data has unacceptable gaps or stale endpoint. |
| `too_many_risk_flags` | Two or more risk flags are active. |
| `below_required_distance` | Current leader is not far enough from the line. |
| `missing_result` | Settlement cannot find official or derived outcome yet. |

## Why Convex Is The Consumption Source

The collector is the source-facing component. It deals with upstream APIs, event timing, raw payloads, snapshots, BTC ticks, and persistence.

The paper agent consumes from Convex because:

1. Replay and live mode need the same inputs.
2. Decisions must be auditable after the fact.
3. The engine needs normalized market windows, prices, and snapshots, not raw event payloads.
4. Convex gives the paper agent a stable, queryable state model.
5. The collector can change how it talks to upstream sources without changing strategy logic.
6. The strategy can be replayed on historical rows without needing upstream APIs to behave identically later.

So the collector is not just saving data for offline analysis. It is building the normalized market state that the agent can safely consume.

## Current Limitations

1. PnL is gross only. It does not subtract fees.
2. The engine assumes the paper entry can be filled at the recorded displayed price.
3. There is no slippage model.
4. There is no maker/taker distinction in PnL.
5. There are no real orders.
6. There is no exit before market settlement.
7. There is no averaging in.
8. There is no stop loss.
9. There is no reversal logic.
10. A missing `entryMarketPrice` allows the row to be created, but PnL becomes `null`.
11. `paperTrades.getStats` reads up to the latest 5000 paper rows, so long-term stats are effectively recent-window stats once the table grows past that.
12. The dashboard summary filters to the flat strategy, while open and settled tables currently list all strategies.

## What To Review When Changing The Strategy

For any threshold or sizing change, run replay before live deployment.

Review:

1. Trade count.
2. Win rate.
3. Gross PnL.
4. ROI on dollars risked.
5. Average entry price.
6. Average entry distance.
7. Performance by entry window.
8. Performance by risk count.
9. Skip reason changes.
10. Individual losers, especially near the threshold.

The one-risk tax experiment is a good example. Lowering the tax admitted more trades, but the added trades lowered ROI in the replay sample.

## Current Default Configuration

```text
strategyVersion = leader_distance_v0
engineVersion = 1
stakeUsd = 5
sizingMode = flat
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

