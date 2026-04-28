# Decision Algorithm Implementation Plan - Combined Canonical Version

This is the merged implementation plan for the BTC 5-minute deterministic decision engine.

Review update:

- The alternate plan remains the stronger base because it has holdout validation, path-buffer work, operational flags, and shadow validation.
- The original plan remains useful for the exact rule contract, gate ordering, EV logic, and threshold tables.
- The external review was directionally correct. This version folds in the actionable corrections: runtime kill switch, explicit dedupe tie-breaker, stricter shadow exit criteria, anti-contamination replay rules, paper-trading subphases, p-candidate audit shape, explicit leave-one-day-out holdout, derived-price diagnostics behavior, schema-evolution guidance, path-buffer freshness caveat, clock consistency, idempotency, parallelizable work, and reason-code registry tests.

This file is planning only. No code should be written until Phase 0 is accepted.

## Project Constraints

- JavaScript only. No TypeScript.
- No ESLint.
- This repo uses Next.js with breaking changes vs. normal assumptions. Read local Next docs before UI changes.
- Convex is the durable store and query layer.
- The collector is the freshest live-data process.
- Chainlink BTC is the primary BTC source.
- Poll-backed CLOB snapshots are the v0 market-data source.
- Market WebSocket remains shadow-only until parity is proven.
- Current recent persisted snapshot cadence appears to be 5 seconds, though the code can support 1-second buckets.

## Core Goal

Build a deterministic, logged, shadow-running decision engine that evaluates active BTC 5-minute markets and emits exactly one action for each evaluated market/checkpoint:

```text
WAIT
SCOUT_SMALL
ENTER_UP
ENTER_DOWN
ADD_SMALL
EXIT_OR_DE_RISK
```

V0 should emit only:

```text
WAIT
ENTER_UP
ENTER_DOWN
```

The other actions are reserved in the output contract for paper trading and position management.

V0 places no real orders. It logs would-be decisions.

## Core Rule

At T+180, T+200, T+210, T+220, or T+240:

Enter the current BTC leader only when:

1. Collector data is healthy.
2. Chainlink BTC is fresh.
3. Latest snapshot is fresh and `sourceQuality` is `good`.
4. Official price-to-beat exists.
5. BTC is outside the 0.5 bps noise band.
6. Recent lock is false.
7. Weak or unknown path is false.
8. Soft risk count is 2 or less.
9. Distance clears the risk-adjusted threshold.
10. Estimated probability is at least 0.80.
11. Leader ask is at least the required edge below estimated probability.
12. Spread is 0.03 or less.
13. Visible top ask depth can fill intended size.

## Main Architecture

The engine has six layers:

```text
Live context builder
  -> data-quality gate
  -> pre-T feature builder
  -> risk flags and threshold gate
  -> conservative probability estimator
  -> EV and execution-quality gate
  -> action and durable decision log
```

Runtime split:

```text
packages/shared/src/
  pure decision math and tests

collector/src/
  live context, path buffer, priors cache, shadow runner

convex/
  decision signal schema, ingestion, queries, dashboard reads
```

The decision engine runs in the collector. Convex stores logs and serves UI/read models.

## Non-Goals For V0

- No live order placement.
- No wallet/private-key integration.
- No market orders.
- No book sweeping.
- No averaging down.
- No ML model.
- No WebSocket-primary market data.
- No Binance dependency.
- No T+60/T+90 entry rule.
- No full 4-way custom rule cube.
- No raw WebSocket event dependency.
- No real position sizing beyond shadow/paper math.

## Pre-T Invariant

Live predictors must be computable from observations at or before checkpoint T.

Never use these as live features:

```text
didCurrentLeaderWin
leaderWonAtClose
stableLeaderWin
noisyLeaderWin
recoveredLeaderWin
flipLoss
resolvedOutcome
closeReferencePriceOfficial
closeReferencePriceDerived
any post* stability field
final market summary stats
```

Those fields are labels or future information.

## Logging Policy

The suggestion and alternate plan both say "log every WAIT." That is directionally right, but the volume needs precision.

V0 should persist:

1. Every target-checkpoint evaluation.
2. Every candidate ENTER decision.
3. Every hard-veto WAIT at a target checkpoint.
4. Optional sampled off-checkpoint WAITs for diagnostics, behind a config flag.

Do not persist every off-checkpoint poll by default. At 5-second cadence and multiple active markets, that creates avoidable volume. At 1-second cadence it becomes much larger. The engine can still evaluate every poll internally, but durable rows should focus on checkpoint decisions unless diagnostics require more.

## Phase 0 - Planning Freeze

Goal: settle assumptions before code.

Status: accepted for v0 implementation planning. Reopen these only through an explicit written change or Phase 1 holdout evidence.

Accepted decisions:

1. V0 requires official price-to-beat for ENTER decisions.
2. Unknown path is a hard veto.
3. `sourceQuality !== "good"` is a hard veto.
4. Max spread is 0.03.
5. BTC max age is 3000 ms.
6. Snapshot max age is 7500 ms.
7. Target checkpoints are `[180, 200, 210, 220, 240]`.
8. Checkpoint tolerance is 3 seconds.
9. V0 persists checkpoint evaluations, not every off-checkpoint poll.
10. V0 has no live orders.
11. Derived price-to-beat is allowed only as shadow diagnostics. Derived-only markets still produce a decision row with action `WAIT` and reason `no_official_price_to_beat`, so they appear in dashboards but can never trigger ENTER in v0.

Exit criteria:

- These assumptions are accepted in this file.
- The first implementation phase can start without reopening core policy questions.

## Phase 1 - Holdout Validation Before Encoding Constants

Goal: verify the discovery-tier priors before they become production constants.

Why this phase exists:

- The thresholds and p_est examples come from the same dataset used to discover them.
- We need a chronological holdout before trusting them.
- This is the alternate plan's strongest improvement and should not be skipped.

Deliverables:

- A Node holdout/replay script that can:
  - read `market_analytics`
  - read `market_stability_analytics`
  - read the dashboard rollup inputs
  - split by leave-one-day-out folds
  - rebuild priors on training days
  - score the held-out day
- Implement the holdout as a local Node script, preferably `scripts/decisionHoldout.js`; use `packages/shared/src/decisionHoldout.js` only if package-local imports make that cleaner.
- Do not use a Convex internal action as the primary holdout loop. Local iteration is faster and matches the existing shared-package test/script workflow.
- A report with:
  - in-sample vs. out-of-sample leader win rate
  - support N by cell
  - absolute drift by cell
  - calibration by p_est bucket
  - which cells are usable live
  - which cells are warning-only
  - which cells are ignored

Report artifact:

- Store the holdout report as a repo-root Markdown file:
  - `decision_priors_holdout_report.md`
- If later useful for the UI, add a small Convex table for queryable holdout summaries, but the Markdown artifact is required so the validation result is durable and reviewable in git.

Fold method:

- Use leave-one-day-out validation as the default.
- With about 12 clean days and roughly 3,300 markets, every day should serve as holdout once.
- Average drift and calibration error across folds.
- Do not use a single last-N-days split as the primary validation gate because one unusual day can dominate the result.

Minimum validation checks:

```text
checkpoint x distance base priors
checkpoint x distance x chop
checkpoint x distance x momentum agreement
checkpoint x distance x leader age
checkpoint x pre-path shape
recent-lock performance
near-line-heavy performance
momentum-against performance
```

Exit criteria:

- V0 thresholds are confirmed or revised.
- Support floors are confirmed.
- The initial recent-lock rule is confirmed as hard veto or adjusted.
- Cells with weak holdout support are marked ignored or warning-only.

Default until proven otherwise:

```text
N >= 100: usable
50 <= N < 100: warning-only
N < 50: ignored
```

## Phase 2 - Shared Decision Contract And Config

Goal: define the stable contract and threshold config.

Files:

```text
packages/shared/src/decisionConfig.js
packages/shared/src/decisionTypes.js
packages/shared/src/decisionBuckets.js
```

`decisionTypes.js` should use JSDoc typedefs only. No TypeScript.

Action values:

```text
WAIT
SCOUT_SMALL
ENTER_UP
ENTER_DOWN
ADD_SMALL
EXIT_OR_DE_RISK
```

Side values:

```text
up
down
none
```

Reason-code rules:

- lowercase snake case
- centralized constants
- stable enough for dashboards
- specific enough for debugging

Reason-code registry:

- Define `REASON_CODES` in `packages/shared/src/decisionConfig.js`.
- The engine may emit only codes from that registry.
- Tests must assert that every emitted reason code is registered.
- The Phase 2 fixture must include these v0 operational codes from day one:
  - `runtime_actions_muted`
  - `missed_checkpoint_window_no_snapshot`

Base config:

```js
export const DECISION_CONFIG = {
  version: "decision-v0.1",

  targetCheckpoints: [180, 200, 210, 220, 240],
  checkpointToleranceSec: 3,

  noiseBandBps: 0.5,

  requireOfficialPriceToBeat: true,
  maxBtcAgeMs: 3000,
  maxSnapshotAgeMs: 7500,
  requireSourceQualityGood: true,

  minProbabilityDefault: 0.80,

  cleanDistanceThresholdBps: {
    180: 5.0,
    200: 5.0,
    210: 4.0,
    220: 4.0,
    240: 4.0,
  },

  oneSoftRiskDistanceThresholdBps: {
    180: 7.5,
    200: 7.5,
    210: 5.0,
    220: 5.0,
    240: 5.0,
  },

  twoSoftRiskDistanceThresholdBps: {
    180: 10.0,
    200: 10.0,
    210: 7.5,
    220: 7.5,
    240: 7.5,
  },

  requiredEdge: {
    180: 0.06,
    200: 0.05,
    210: 0.05,
    220: 0.05,
    240: 0.04,
  },

  softRiskEdgeTax: {
    one: 0.01,
    twoOrMore: 0.02,
  },

  maxSpread: 0.03,
  maxSoftRiskCount: 2,

  strongSupportN: 100,
  warningSupportN: 50,
  shrinkageK: 200,
};
```

Important:

- Do not hardcode empirical chop/near-line/oscillation rank thresholds in config unless Phase 1 freezes them.
- Prefer loading rank thresholds from the current rollup and logging them with the decision.

Exit criteria:

- Contract and config are deterministic.
- Changing a threshold means bumping the decision version.

## Phase 3 - Pure Decision Engine

Goal: build and test the deterministic engine in shared code.

Files:

```text
packages/shared/src/decisionFeatures.js
packages/shared/src/decisionPriors.js
packages/shared/src/decisionEngine.js
packages/shared/src/decisionFeatures.test.js
packages/shared/src/decisionPriors.test.js
packages/shared/src/decisionEngine.test.js
packages/shared/src/index.js
```

Feature functions:

```text
computeLeader
signedDistanceBps
bucketDistance
nearestDecisionCheckpoint
buildPreTFeatures
computeRiskFlags
requiredDistanceBps
requiredEdge
executionGate
```

Pre-T features:

```text
preCurrentLeadAgeSeconds
preLastFlipAgeSeconds
preFlipCount
preCrossCountLast60s
preNearLineSeconds
preNearLinePct
preSnapshotCoveragePct
preMaxSnapshotGapMs
preRange60sBps
preRange120sBps
preRealizedVolatility60s
preRealizedVolatility120s
momentum30sBps
momentum60sBps
momentum30sSide
momentum60sSide
momentum30sAgreesWithLeader
momentum60sAgreesWithLeader
leaderAlignedMomentum30sBps
leaderAlignedMomentum60sBps
nearLineRank
oscillationRank
pooledChopRank
```

Naming caveat:

- These pre-T feature names intentionally match similar `market_stability_analytics` fields.
- Live decisions must compute them online from the collector path buffer.
- They may differ slightly from historical analytics rows because of poll cadence and timing, so the engine must not read historical stability rows as live feature inputs.

Risk flags:

```text
recentLock
highChop
nearLineHeavy
oscillationHigh
momentumAgainstLeader
weakCoverage
unknownPath
softRiskCount
```

Hard vetoes:

```text
recentLock
weakCoverage
unknownPath
```

Soft risks:

```text
highChop
nearLineHeavy
oscillationHigh
momentumAgainstLeader
```

Gate order:

1. Data quality.
2. Checkpoint match.
3. Leader and noise band.
4. Pre-T feature build.
5. Hard vetoes.
6. Distance threshold.
7. Probability estimate.
8. EV gate.
9. Execution-quality gate.
10. Action result.

Clock rule:

- Each `decide()` call receives one `ctx.nowMs`.
- All gates in that call must use that value.
- Do not call `Date.now()` inside individual gates, because per-gate clock drift can create inconsistent BTC age, snapshot age, and checkpoint matching in the same decision.

Probability method:

```text
p_base = checkpoint x distance leader win rate
p_split = supported split prior, shrunk toward p_base
p_est = min(p_base, supported shrunk split priors) - risk penalty
```

Shrinkage:

```text
p_shrunk = (N * p_cell + K * p_base) / (N + K)
K = 200
```

V0 rule:

- Split priors can reduce confidence.
- Split priors cannot increase confidence above base.
- `p_est` must be at least 0.80.

Exit criteria:

- `decide(context, priors, config)` is deterministic.
- Tests cover all gates and reason codes.
- Post-checkpoint mutations do not change pre-T features.

## Phase 4 - Decision Priors Loader

Goal: convert dashboard rollups into compact decision priors.

Source:

```text
analytics_dashboard_rollups
```

Input sections:

```text
v1.leader
v2.stability.pathRiskByChop
v2.stability.momentumAgreement
v2.stability.leaderAgeByDistance
v2.stability.prePathShapes
v2.stability.preChopBucketDefinitions
```

Output shape:

```js
{
  computedAt,
  rollupVersion,
  analyticsVersion,
  stabilityAnalyticsVersion,
  distanceBuckets,
  rankThresholds,
  baseByCheckpointDistance,
  chopByCheckpointDistance,
  momentumByCheckpointDistance,
  leaderAgeByCheckpointDistance,
  prePathShapeByCheckpoint
}
```

Implementation choices:

1. Add pure mapper in `packages/shared/src/decisionPriors.js`.
2. Add Convex query only if needed:
   - `convex/internal/decisionPriors.js`
   - or public `convex/decisionSignals.js` helper query.
3. Collector caches priors in memory.
4. Collector refreshes priors periodically, default 30 minutes.
5. Every decision row logs prior version/timestamp and priors used.

Exit criteria:

- Decision logic never scans raw analytics tables live.
- Sparse cells are ignored or marked warning-only according to support rules.
- Priors are auditable from decision logs.

## Phase 5 - Convex Decision Signal Storage

Goal: add durable decision logs.

New table:

```text
decision_signals
```

Fields:

```text
marketSlug
marketId
windowStartTs
windowEndTs
evaluatedAt
secondBucket
checkpointSecond
secondsFromWindowStart
decisionVersion
engineRunId

action
actionPreMute
reasonCodes

priceToBeat
priceToBeatSource
btcPrice
btcTickTs
btcReceivedAt
btcAgeMs

signedDistanceBps
absDistanceBps
distanceBucket
leader

pBase
pEst
pCandidates
priorsComputedAt
priorsRollupVersion

leaderBid
leaderAsk
leaderSpread
leaderTopAskDepth
edge
requiredEdge
requiredDistanceBps

flags
features

intendedSize
limitPrice

snapshotTs
snapshotAgeMs
sourceQuality
captureMode
collectorStatus

createdAt
```

Mandatory vs. optional schema fields:

- Mandatory fields:
  - `marketSlug`
  - `evaluatedAt`
  - `action`
  - `reasonCodes`
  - `decisionVersion`
- For v0 persisted checkpoint and missed-window rows, `checkpointSecond` and `secondBucket` are also required because they form the logical dedupe identity.
- If later off-checkpoint diagnostic rows are persisted, define a separate dedupe policy for those rows before enabling them.
- Most other fields should be optional and nullable in Convex so future additions do not force painful migrations for existing rows.
- A missing optional field should mean "not computed before the failing gate" or "not available in this decision version."

Action muting audit rule:

- `action` stores the effective emitted action after runtime controls are applied.
- `actionPreMute` is optional and normally null.
- When `decision_emit_actions: "wait_only"` downgrades `ENTER_UP` or `ENTER_DOWN` to `WAIT`, set `actionPreMute` to the original enter action and add `runtime_actions_muted` to `reasonCodes`.
- This preserves the would-have-entered audit trail for Phase 11 calibration and dashboards.

`pCandidates` shape:

```js
{
  source: "base",
  p: 0.87,
  n: 184,
  shrunk: 0.86,
  accepted: true,
  rejectionReason: null
}
```

Rules:

- `source` is one of `base`, `chop`, `momentum`, `leaderAge`, or `prePathShape`.
- `rejectionReason` is `sparse`, `missing`, `not_applicable`, or null.
- The base candidate should have `source: "base"` and `accepted: true` when available.
- Split candidates with insufficient support should still be logged with `accepted: false` and `rejectionReason: "sparse"` when practical.
- This field is the audit trail for why `p_est` was reduced or left at base.

Related runtime control storage:

- Add a small `runtime_flags` table or equivalent singleton document in Phase 5 with safe default values.
- Required keys:
  - `decision_engine_enabled`
  - `decision_emit_actions`
- This can be modeled as a generic key/value table or a single known row. The collector must be able to read it without redeploying or restarting.
- Phase 5 owns the schema/defaults. Phase 7 owns the collector reader and behavior.

Collector health additions:

- Add optional nullable decision heartbeat fields to `collector_health`:
  - `lastDecisionAt`
  - `lastDecisionAction`
  - `decisionsEmittedLastBatch`
- Phase 7 should write these fields when decision evaluation runs. This gives an at-a-glance "is the decision engine alive" signal without querying `decision_signals`.

Indexes:

```text
by_marketSlug_evaluatedAt
by_evaluatedAt
by_action_evaluatedAt
by_marketSlug_checkpointSecond
by_decisionVersion_evaluatedAt
by_dedupe_key: marketSlug, decisionVersion, checkpointSecond, secondBucket
```

Volume policy:

- Persist target-checkpoint evaluations by default.
- Optional sampled off-checkpoint WAIT logging can be added later.
- Add retention only if write volume proves high.

Exit criteria:

- A decision signal can be inserted and queried.
- WAIT and ENTER rows share the same schema.

## Phase 6 - Collector Path Buffer And Context Builder

Goal: give the engine live pre-T path data without querying Convex per decision.

Files:

```text
collector/src/decisionPathBuffer.js
collector/src/decisionRunner.js
collector/src/decisionPathBuffer.test.js
collector/src/decisionRunner.test.js
```

Path buffer:

- One buffer per active market.
- Push each built snapshot into that market's buffer.
- Store:
  - `ts`
  - `secondBucket`
  - `secondsFromWindowStart`
  - `btcChainlink`
  - `sourceQuality`
- Keep full active window plus grace.
- Clear buffers for removed markets.
- If collector restarts mid-window, path coverage is weak/unknown and the engine should WAIT.

Freshness caveat:

- The path buffer is fed by snapshots, so at the current deployment cadence its latest BTC sample can be about 5 seconds old by construction.
- Live BTC freshness must be checked against the latest Chainlink tick in collector memory, not against the buffer's last path row.
- The buffer is for pre-T path shape and momentum; the current leader and data-quality BTC freshness gate use the live Chainlink tick.

Decision context:

```text
nowMs
collector health
market metadata
latest Chainlink tick
latest market snapshot
recentPath from buffer
cached priors
```

Exit criteria:

- Collector can build a context without a Convex read.
- Missing context becomes WAIT, not an exception.
- Collector collection continues if decision logic fails.

## Phase 7 - Collector Shadow Runner

Goal: evaluate active markets and queue decision signals.

Runtime behavior:

1. After snapshot capture, update path buffers.
2. For each active market with a latest snapshot, build context.
3. If near a target checkpoint, evaluate and retain the checkpoint candidate.
4. Optionally evaluate off-checkpoint but do not persist by default.
5. When the checkpoint tolerance window closes, queue exactly one winning decision row or one missed-checkpoint synthetic WAIT row.
6. Batch decision rows to Convex.
7. Never place orders.

Dedupe tie-breaker:

- For each market and target checkpoint, persist at most one row for the tolerance window.
- If multiple snapshots qualify, choose the snapshot whose `secondsFromWindowStart` is closest to the target checkpoint.
- If there is an exact tie, choose the earlier snapshot to stay closer to the historical checkpoint prior and avoid using more post-target drift.
- For v0 shadow mode, the runner must always hold checkpoint candidates until the tolerance window closes, then persist the winning row.
- The persisted row's `evaluatedAt` and `secondsFromWindowStart` must come from the chosen snapshot/context, not from the later flush time.

Missed-checkpoint diagnostic:

- If the tolerance window closes with no qualifying snapshot for an active market/checkpoint, persist a synthetic decision row.
- Synthetic row:
  - `action: "WAIT"`
  - `reasonCodes: ["missed_checkpoint_window_no_snapshot"]`
  - `checkpointSecond`: target checkpoint
  - `secondBucket`: deterministic target checkpoint millisecond bucket
  - `evaluatedAt`: the time the runner detects the closed missed window
- Compute synthetic `secondBucket` as `Math.floor((windowStartTs + checkpointSecond * 1000) / 1000) * 1000`.
- This follows the existing millisecond `secondBucket` convention and must be identical across retries, restarts, and overlapping collectors.
- This makes dropped polls, overruns, gaps, or decision-runner misses visible instead of indistinguishable from "engine was not running."
- This is one row per missed target window per market, so it is low volume and allowed in v0.

Runtime kill switch:

- The env var only controls whether the decision system can start.
- The collector must also read runtime flags each tick or on a short interval so behavior can be changed without restart.
- Required runtime flags:
  - `decision_engine_enabled`: boolean. When false, skip evaluation and emit no decision rows except an optional health log.
  - `decision_emit_actions`: `"all"` or `"wait_only"`. When set to `"wait_only"`, still evaluate and log, but downgrade `ENTER_UP` and `ENTER_DOWN` to `WAIT` with reason `runtime_actions_muted`.
- When muting an enter action, preserve the original action in `actionPreMute`.
- These flags should land with Phase 7, not later live-execution work.

Engine run identity:

- Generate `engineRunId` once per collector process start.
- Do not regenerate it on priors refresh.
- Include `engineRunId` on every decision row for that process lifetime.

Env/config:

```text
ENABLE_DECISION_ENGINE=false by default
DECISION_PRIORS_REFRESH_MS=1800000
DECISION_BANKROLL=1.0
DECISION_REQUIRE_OFFICIAL_PRICE_TO_BEAT=true
DECISION_PERSIST_OFF_CHECKPOINT_WAITS=false
DECISION_RUNTIME_FLAGS_REFRESH_MS=5000
```

Exit criteria:

- Running collector with decision engine enabled writes shadow decision logs.
- Running collector with decision engine disabled behaves exactly as before.
- Runtime flags can mute ENTER actions without restarting the collector.
- Decision engine errors do not stop BTC/snapshot collection.

## Phase 8 - Ingestion

Goal: persist decision rows through Convex.

Preferred approach:

- Extend existing ingest batch if it stays simple.
- Otherwise add a dedicated internal mutation/client method for decision signals.

Files:

```text
convex/internal/decisionSignalIngestion.js
convex/decisionSignals.js
convex/http.js if extending existing ingest
packages/shared/src/ingest.js if extending existing ingest
```

Rules:

- Validate all rows.
- Deduplicate by stable key:
  - `marketSlug`
  - `decisionVersion`
  - `checkpointSecond`
  - `secondBucket`
- Return inserted/skipped counts.

Idempotency:

- The collector should assign the decision row's `evaluatedAt` before queueing it, but `evaluatedAt` is an audit field, not the idempotency key.
- Retries must resend the same row with the same `engineRunId`, `marketSlug`, `decisionVersion`, `checkpointSecond`, and `secondBucket`.
- Convex ingestion dedupes against that stable identity so a retry does not create duplicate decision rows.
- Do not use flush time as part of the dedupe key.
- Do not use wall-clock `evaluatedAt` as part of the dedupe key, because a collector restart could re-evaluate the same logical checkpoint at a different wall-clock time.

Exit criteria:

- Local/dev collector can write decision rows.
- Query can list recent rows.

## Phase 9 - Historical Replay And Backtest

Goal: run the engine on historical markets before relying on live shadow output.

This differs from Phase 1:

- Phase 1 validates priors and thresholds.
- Phase 9 tests the complete engine policy, including gates, EV, spread/depth, and reason codes.

Inputs:

```text
markets
market_snapshots_1s
btc_ticks
market_summaries
market_analytics
market_stability_analytics
dashboard rollups or rebuilt priors
```

Replay memory rule:

- Replay must iterate per market and stream/load only that market's snapshots and ticks needed for the replay window.
- Do not bulk-load all historical snapshots into memory; even the current dataset is large enough that a naive full load is unnecessary and fragile.

Anti-contamination rule:

- Replay must use the priors fitted on the Phase 1 training fold.
- Held-out markets must be scored with priors that did not include those held-out markets.
- Do not replay closed markets against the latest all-data rollup and treat that as validation; that leaks the answer into the prior.
- Latest rollup replay is allowed only as a smoke test of code paths, not as evidence of edge.

Reports:

```text
total evaluations
WAIT count by reason
ENTER_UP count
ENTER_DOWN count
average p_est
average ask
average edge
win rate
calibration by p_est bucket
win rate by checkpoint
win rate by distance bucket
win rate by risk flag
estimated gross PnL
estimated fee/slippage-adjusted PnL
max losing streak
missed entries due to no official price-to-beat
missed entries due to stale/gap snapshots
```

Exit criteria:

- Full policy works on closed historical markets.
- Reason-code distribution makes sense.
- No live shadow run starts until the replay output is reviewed.

## Phase 10 - Decision UI And Observability

Goal: make shadow decisions inspectable.

Convex queries:

```text
decisionSignals:listRecent
decisionSignals:listRecentEnters
decisionSignals:getReasonCodeStats
decisionSignals:listByMarketSlug
```

Query semantics:

- `decisionSignals:listRecentEnters` must include rows where `action` is `ENTER_UP` or `ENTER_DOWN`.
- It must also include rows where `actionPreMute` is `ENTER_UP` or `ENTER_DOWN`, because those are muted would-have-entered decisions.

UI:

```text
components/DecisionsDashboard.js
app/decisions/page.js
```

Panels:

1. Recent decisions table.
2. Recent ENTER candidates.
3. Reason-code histogram.
4. Active market decision state.
5. Data-quality blockers.
6. Calibration by p_est bucket once outcomes are available.

Exit criteria:

- A user can tell why the engine waited.
- A user can tell why it would have entered.
- ENTER candidates are visible without reading logs.

## Phase 11 - Live Shadow Validation

Goal: run the engine live without trading.

Minimum run:

```text
14 days
```

Track:

```text
would-be entries
would-be wins/losses after summaries finalize
hit rate by checkpoint
hit rate by distance bucket
hit rate by risk flag
average p_est
average ask
average edge
reason-code distribution
data-quality blocker rates
calibration by p_est bucket
```

Aggregation method:

- Checkpoint-level and distance-bucket-level calibration groups are pooled by entries, not computed as unweighted means of child cells.
- For each group, compute `empiricalHitRate = wins / entries` across all would-be entries in that group.
- Compute `averagePEst` as the mean `pEst` across those same entries.
- Treat rows with `actionPreMute` of `ENTER_UP` or `ENTER_DOWN` as would-be entries for calibration, even if the effective `action` is `WAIT` because runtime actions were muted.

Exit criteria:

- Per-cell sample tiers for `(checkpoint, distance bucket)`:
  - `N >= 30`: judged
  - `10 <= N < 30`: preliminary
  - `N < 10`: not judged
- For judged cells, absolute calibration error should be at most 0.03:
  - `abs(empiricalHitRate - averagePEst) <= 0.03`
- For preliminary cells, absolute calibration error should be at most 0.05 and should be treated as directional evidence, not a final verdict.
- Not-judged cells are reported but do not block Phase 11 exit.
- Phase 11 can close when:
  - all checkpoint-level aggregate groups with `N >= 30` pass the 0.03 calibration band
  - all distance-bucket aggregate groups with `N >= 30` pass the 0.03 calibration band
  - at least half of judged-or-preliminary `(checkpoint, distance bucket)` cells pass their tier's calibration band
  - no judged cell misses calibration by more than 0.05 without an explicit written explanation
- Reason-code distribution should be dominated by expected strategy reasons:
  - `outside_decision_checkpoint`
  - `inside_noise_band`
  - `no_ev_against_top_ask`
  - `distance_too_small`
  - `recent_lock`
- Data-quality WAIT reasons at target checkpoints should not exceed about 5% of target-checkpoint WAITs:
  - `bad_snapshot_quality:*`
  - `btc_too_old`
  - `snapshot_too_old`
  - `missing_btc_tick`
- If data-quality WAITs exceed that threshold, fix the collector/data path before judging the engine.
- No position-management action is emitted in v0.

If shadow validation fails:

- Use reason codes to decide whether the issue is priors, thresholds, data quality, EV cushion, or feature classification.
- Do not proceed to paper trading until fixed.

## Phase 12 - Paper Trading

Goal: simulate entries, exits, and PnL without real orders.

Split this phase into three shippable increments.

### Phase 12a - Paper Position State

Deliverables:

```text
paper_positions table
decisionPositions.js
```

Rules:

```text
fill at leader ask at decision time
use fixed unit size for 12a
never average down after leader flips
do not add if BTC returns inside noise band
exit_or_de_risk if opposite leader appears outside noise band
add only if same leader persists, edge improves, and max paper exposure is not reached
```

Exit criteria:

- ENTER decisions can open fixed-unit paper positions.
- HOLD, ADD, and EXIT_OR_DE_RISK state transitions are deterministic in tests.
- No real orders are placed.

### Phase 12b - Paper Sizing

Deliverables:

```text
capped Kelly sizing
soft-risk size dampers
top-depth clamp
```

Rules:

- Use configured paper bankroll.
- Use tiny capped fractional Kelly.
- Max 0.5% bankroll per trade.
- One soft risk halves size.
- Two soft risks quarters size.
- Never exceed top ask depth.

Exit criteria:

- Size is reproducible from the decision row.
- Paper size never exceeds visible top ask depth.
- Riskier setups are smaller.

### Phase 12c - Paper Settlement

Deliverables:

```text
settlement flow after market_summaries finalizes
paper PnL rollups
paper position dashboard fields
```

Rules:

- Settle only after `market_summaries.resolvedOutcome` exists.
- Use paper entry price, paper side, and resolved outcome to calculate PnL.
- Keep settlement idempotent by `paperPositionId`.
- Once a paper position has non-null `settledAt`, subsequent settlement calls are no-ops.

Exit criteria:

- Paper positions settle automatically.
- Paper PnL can be reviewed by checkpoint, distance, risk flags, and p_est bucket.
- No real funds are touched.

## Phase 13 - Live Execution Preparation

Goal: write a separate live-order plan after paper trading passes.

Do not implement live execution in this phase of work.

Required before real orders:

```text
order client
secure secret handling
runtime kill switch
max spend per market
max spend per hour/day
max simultaneous positions
max loss limit
idempotency keys
limit orders only
no order if top ask moved above allowed limit
fill/reject logging
position reconciliation
manual approval option for first N trades
emergency disable runbook
```

Live dedupe note:

- V0 shadow mode can hold checkpoint candidates until the tolerance window closes because it is not placing orders.
- Live execution cannot trade in the past. The live-execution plan must define different semantics, likely "decide on the first qualifying snapshot" or a deliberately delayed non-trading confirmation mode.
- Do not assume the v0 shadow dedupe/hold behavior is directly reusable for live orders.

Exit criteria:

- A separate live-execution implementation plan exists.
- Every real order would map back to one `decision_signals` row.

## Test Strategy

Shared tests:

```text
leader calculation handles up, down, and noise band
checkpoint matching respects tolerance
data-quality gate rejects stale BTC
data-quality gate rejects stale/gap snapshots
official price-to-beat requirement works
distance threshold gate works for 0, 1, 2, and 3+ soft risks
recent lock hard veto works
weak coverage hard veto works
unknown path hard veto works
momentum-against adds risk
p_est uses min-of-priors
p_est cannot increase above base from splits
shrinkage formula works
sparse priors are ignored
EV gate uses top ask
execution gate rejects wide spread
execution gate rejects insufficient top ask depth
decision output always includes version and reason codes
every emitted reason code is a member of centralized REASON_CODES
```

Leakage tests:

```text
mutating post-checkpoint rows does not change pre-T features
mutating post-checkpoint rows does not change risk flags
mutating post-checkpoint rows does not change p_est except through static historical priors
```

Collector tests:

```text
path buffer trims by market window
path buffer does not cross-contaminate markets
decision runner builds contexts from active market and snapshot data
decision runner dedupes checkpoint logs
decision runner emits missed_checkpoint_window_no_snapshot when a target window closes without a qualifying snapshot
decision runner failure does not stop snapshot collection
decision signals are queued and written through ingestion
```

Backtest/paper tests:

```text
historical replay evaluates a known closed market
paper fill uses ask, not displayed price
settlement uses resolved outcome only after close
paper PnL calculation is reproducible
```

## Cumulative File Map

```text
packages/shared/src/
  decisionConfig.js
  decisionTypes.js
  decisionBuckets.js
  decisionFeatures.js
  decisionFeatures.test.js
  decisionPriors.js
  decisionPriors.test.js
  decisionEngine.js
  decisionEngine.test.js
  decisionPositions.js
  decisionPositions.test.js
  index.js

collector/src/
  decisionPathBuffer.js
  decisionPathBuffer.test.js
  decisionRunner.js
  decisionRunner.test.js
  index.js
  config.js

convex/
  schema.js
  decisionSignals.js
  runtimeFlags.js
  http.js
  internal/decisionPriors.js
  internal/decisionSignalIngestion.js

components/
  DecisionsDashboard.js

app/
  decisions/page.js

scripts/ or packages/shared/src/
  decisionHoldout.js
  decisionReplay.js

repo root:
  decision_priors_holdout_report.md
```

## Key Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Priors do not survive holdout | Phase 1 is a hard gate. |
| 5-second cadence misses checkpoint tolerance | Use nearest checkpoint tolerance first; if shadow misses too often, evaluate closest snapshot per target checkpoint. |
| Cells may not reach N=30 in the shadow run | Use 14-day minimum run plus judged/preliminary/not-judged tiers and aggregate checkpoint/distance validation. |
| Collector restart loses path buffer | WAIT on weak/unknown path until coverage rebuilds. |
| Decision log volume grows too much | Persist checkpoint evaluations by default; sample off-checkpoint WAITs only if needed. |
| Reason codes become inconsistent | Centralize reason-code constants and test emitted codes. |
| Split priors overfit correlated risks | V0 uses min-of-priors and shrinkage, never additive boosts. |
| WebSocket data looks tempting but parity is weak | Keep WS out of v0 decision source. |
| Execution assumptions are wrong | No real execution until paper trading and separate execution plan. |

## Resolved Defaults Before Phase 1

These questions are no longer blockers for implementation planning.

1. V0 requires official price-to-beat for ENTER decisions.
2. Unknown path is a hard veto.
3. Source quality issues are hard vetoes.
4. Max spread is 0.03 for v0.
5. Snapshot age limit is 7500 ms while cadence is 5 seconds.
6. Decision rows do not persist every off-checkpoint WAIT by default.
7. Phase 1 holdout happens before pure engine coding so unstable constants are not encoded.
8. First implementation does not include paper positions. Decision logs come first.

## Final Build Order

1. Run Phase 1 holdout validation.
2. Finalize Phase 2 shared contract and config from holdout results.
3. Build shared pure decision engine.
4. Add priors loader.
5. Add `decision_signals` schema and ingestion.
6. Add collector path buffer and shadow runner.
7. Add historical replay.
8. Add UI/observability.
9. Run 14-day shadow validation.
10. Add paper trading.
11. Only then design live execution.

Parallelizable work:

- Phase 2 config/contract skeleton can be drafted while Phase 1 holdout is running, as long as constants are not frozen until holdout results are reviewed.
- Phase 3 pure engine and Phase 5 schema can overlap after the output contract is stable.
- Phase 10 UI can start once the `decision_signals` query contract exists, even before a full 14-day shadow run completes.
