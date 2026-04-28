# BTC 5M Path Risk Analytics Plan

## Decision Summary

The feedback is accurate on the major design risks. Incorporate these decisions:

- Accept the field-definition, sign-convention, support-count, leakage-test, Convex, and ratio-denominator fixes.
- Add a partial path-shape feature, but do not reuse full-window names like `early-lock` unless the value is computed only from data available before the checkpoint.
- Do not build the full checkpoint x distance x chop x momentum cube on day one. Build two focused 3-way reports first, then add a narrow 4-way slice only after support counts justify it.
- Compute durability priors without distance in the prior key. Distance is the numerator, so conditioning the denominator on distance would mostly re-encode distance buckets.
- Use globally comparable, elapsed-time-normalized chop buckets for the target checkpoint range. Per-checkpoint terciles would hide part of the T+200 to T+220 elbow this work is trying to find.
- Use a two-component chop rank: oscillation and near-line time. Keep direction changes and recent crosses as diagnostic fields, but do not give correlated oscillation measures multiple votes in the main chop bucket.
- Derive `prePathShape` from established bucket fields after chop buckets exist. Do not materialize it in Phase 2 with undefined "high" thresholds.
- Apply support floors to durability priors. A sparse p90 denominator is too noisy to drive a ratio.
- Keep the stability document close to raw measurements. Compute deterministic rates, percentages, adverse drawdown, chop rank, and durability in the rollup builder instead of adding avoidable schema fields.

The core invariant for this work:

```text
Pre-checkpoint fields are predictors.
Post-checkpoint fields are labels/outcomes.
No field used as a predictor may read rows after checkpoint T.
```

Add this as a short code comment near the pre-feature builder in `packages/shared/src/marketStabilityAnalytics.js`.

## Current Implementation Baseline

The analytics route shell is already thin:

- `app/analytics/page.js` renders the header, intro copy, Convex setup notice, and `AnalyticsDashboard`.

The implementation work belongs in:

- `packages/shared/src/marketAnalytics.js`
- `packages/shared/src/marketStabilityAnalytics.js`
- `packages/shared/src/analyticsDashboard.js`
- `convex/schema.js`
- `convex/internal/marketAnalytics.js`
- `convex/internal/marketStabilityAnalytics.js`
- `convex/internal/analyticsRollups.js`
- `convex/analytics.js`
- `components/AnalyticsDashboard.js`

Existing relevant behavior:

- V1 market analytics materializes checkpoint leader and distance.
- V2 stability analytics already separates post-checkpoint stable wins, noisy wins, recovered wins, flip losses, unknown path, and adverse movement.
- Some pre-checkpoint fields already exist: `preFlipCount`, `preCurrentLeadAgeSeconds`, `preLeaderDwellPct`, `preLongestLeadStreakSeconds`, `preLastFlipAgeSeconds`, `preRealizedVolatility60s`, and `preRealizedVolatility120s`.
- Dashboard rollups are stored in `analytics_dashboard_rollups`, so new tables should be precomputed in the rollup rather than scanned live from the client.

## Phase 1 - Add Intermediate Checkpoints

Update `CHECKPOINT_SECONDS` in `packages/shared/src/marketAnalytics.js`.

Current:

```text
30, 60, 90, 120, 180, 240, 270, 285, 295
```

Add:

```text
200, 210, 220
```

New ordered list:

```text
30, 60, 90, 120, 180, 200, 210, 220, 240, 270, 285, 295
```

Reason:

- The likely elbow for current-leader durability is probably around T+210 to T+230, not exactly T+240.
- The report should focus on T+180, T+200, T+210, T+220, and T+240.

Required updates:

- Shared constants and tests.
- Any hardcoded dashboard checkpoint list in `components/AnalyticsDashboard.js`.
- `market_analytics` materialization and backfill.
- `market_stability_analytics` materialization and backfill.
- Rollup refresh.

Versioning:

- Bump `ANALYTICS_VERSION` because v1 checkpoint shape changes.
- Bump `STABILITY_ANALYTICS_VERSION` because checkpoint arrays change.
- Bump `DASHBOARD_ROLLUP_VERSION` because rollup output changes.

## Phase 2 - Define And Materialize Pre-T Features

All fields in this phase must be computed only from observations at or before checkpoint T.

### Sign Conventions

Use the existing signed margin convention:

```text
marginBps = 10000 * (btcPrice - priceToBeat) / priceToBeat
```

Meaning:

- Positive margin favors UP.
- Negative margin favors DOWN.
- `distanceBps` remains signed.
- Distance bucket reports use `abs(distanceBps)`.

Leader sign:

```text
leaderSign = +1 when leader is UP
leaderSign = -1 when leader is DOWN
leaderSign = null when there is no leader
```

### Momentum Fields

Use signed drift, not unsigned movement.

Fields:

```text
momentum30sBps
momentum60sBps
momentum30sSide
momentum60sSide
momentum30sAgreesWithLeader
momentum60sAgreesWithLeader
leaderAlignedMomentum30sBps
leaderAlignedMomentum60sBps
```

Definitions:

```text
momentumNsBps =
  marginBps(latest observed row at or before T)
  - marginBps(latest observed row at or before T-N)
```

Endpoint eligibility:

- If either endpoint is missing, the momentum field is null.
- Endpoint target seconds must be inside `[0, checkpointSecond]`. Do not use pre-window rows.
- Use the latest observed row at or before each endpoint target.
- If either selected endpoint is older than `MOMENTUM_MAX_ENDPOINT_AGE_MS`, the momentum field is null.
- At T+30 for 30s momentum, the start endpoint is exactly window start. If there is no in-window row at or before window start, `momentum30sBps` is null.
- Do not interpolate across missing snapshot ranges in the first implementation.

Initial endpoint age rule:

```text
MOMENTUM_MAX_ENDPOINT_AGE_MS = max(12_000, inferredSnapshotCadenceMs * 2)
```

This matches the existing path-gap tolerance used by `getCoverage`.

`momentumNsBps` is signed:

- Positive means BTC moved upward over the lookback.
- Negative means BTC moved downward over the lookback.

Momentum side:

```text
momentumNsSide = "up" when momentumNsBps > MOMENTUM_DEADBAND_BPS
momentumNsSide = "down" when momentumNsBps < -MOMENTUM_DEADBAND_BPS
momentumNsSide = "flat" otherwise
```

Initial constant:

```text
MOMENTUM_DEADBAND_BPS = 0.5
```

Agreement:

```text
momentumNsAgreesWithLeader = true when momentumNsSide equals leader
momentumNsAgreesWithLeader = false when momentumNsSide is the opposite side
momentumNsAgreesWithLeader = null when leader is null or momentum side is flat/null
```

Leader-aligned momentum:

```text
leaderAlignedMomentumNsBps = leaderSign * momentumNsBps
```

Meaning:

- Positive value means recent drift moved in the leader's direction.
- Negative value means recent drift moved against the leader.

### Chop And Path-Chaos Fields

Keep path chaos separate from leader stability. Do not mix lead age or dwell into the chop score.

Stored raw fields:

```text
preFlipCount
preNearLineSeconds
preDirectionChangeCount
preCrossCountLast60s
preRange60sBps
preRange120sBps
prePathGood
preSnapshotCoveragePct
preMaxSnapshotGapMs
```

Derived in the rollup builder, not persisted in `market_stability_analytics`:

```text
preFlipRatePerMinute
preNearLinePct
preDirectionChangeRatePerMinute
preChopRank
preChopBucket
prePathShape
```

`preFlipCount`:

- Existing field.
- Counts hard flips before T using the stable-state deadband.
- Stable UP is `marginBps >= STABILITY_DEADBAND_BPS`.
- Stable DOWN is `marginBps <= -STABILITY_DEADBAND_BPS`.
- Noise rows do not create flips.

`preFlipRatePerMinute`:

```text
preFlipCount / (checkpointSecond / 60)
```

This is derived in the rollup and is the oscillation input for the main chop bucket because it remains comparable across T+180, T+200, T+210, T+220, and T+240.

`preNearLineSeconds`:

```text
Total observed-duration seconds before T where abs(marginBps) <= PRE_NEAR_LINE_BPS
```

Attribution convention:

- Match the existing pre-feature loop.
- Attribute each duration interval `[currentRow.second, nextRow.second)` to the current row's margin/state.
- Do not use endpoint averaging or trapezoidal integration.

Initial constant:

```text
PRE_NEAR_LINE_BPS = 2.0
```

Reason:

- `STABILITY_DEADBAND_BPS = 0.5` is the no-decision/noise boundary.
- `PRE_NEAR_LINE_BPS = 2.0` captures broader chop around the line without making the value proportional to each market's own range.
- A fixed bps threshold is easier to compare across markets because all values are already normalized to price-to-beat bps.

`preNearLinePct`:

```text
preNearLineSeconds / checkpointSecond
```

This is derived in the rollup, not stored in the stability checkpoint document.

`preDirectionChangeCount`:

- Counts thresholded peaks/troughs in the pre-T margin path.
- Maintain the last tracked extreme margin and current direction.
- Small moves below threshold do not reset state and do not accumulate a direction.
- Once direction is established, update the tracked extreme while movement continues in that direction.
- Count one reversal only when price moves at least `DIRECTION_CHANGE_MIN_DELTA_BPS` away from the tracked extreme in the opposite direction.
- Measure direction from the previous tracked extreme, not necessarily the immediately previous row.

Initial constant:

```text
DIRECTION_CHANGE_MIN_DELTA_BPS = 0.5
```

`preDirectionChangeRatePerMinute`:

```text
preDirectionChangeCount / (checkpointSecond / 60)
```

This is derived in the rollup, not stored in the stability checkpoint document.

`preCrossCountLast60s`:

- Counts hard side changes in the last 60 seconds before T.
- Use stable states, not raw zero crossings, so small line noise does not inflate the count.
- If checkpointSecond is less than 60, use available in-window rows from `[0, checkpointSecond]`.

`preRange60sBps` and `preRange120sBps`:

```text
max(marginBps in lookback) - min(marginBps in lookback)
```

For lookback windows that start before the market begins, use available in-window rows:

```text
[max(0, checkpointSecond - lookbackSeconds), checkpointSecond]
```

These measure range, not chop. Directional volatility and chop must remain separable in the report.

Keep both realized volatility and range in the first diagnostic pass:

- `preRealizedVolatility60s/120s` is standard deviation and describes typical dispersion.
- `preRange60sBps/120sBps` is max-min and describes the largest recent excursion.
- Neither is part of `preChopRank`; prune one later if the reports show they are redundant.

`prePathGood`, `preSnapshotCoveragePct`, and `preMaxSnapshotGapMs`:

- Measure snapshot coverage from window start through checkpoint T.
- Use the same cadence and gap logic as existing post-checkpoint path coverage.
- If `prePathGood` is false, pre-T predictor fields should be null or bucketed as `unknown` in rollups.

Do not materialize `prePathShape` in Phase 2. It depends on chop and lead-age buckets, so it should be derived in the rollup after bucket definitions exist.

### Leader-Stability Fields

Keep these separate from path-chaos fields:

```text
preCurrentLeadAgeSeconds
preLeaderDwellPct
preLongestLeadStreakSeconds
preLastFlipAgeSeconds
```

These answer:

```text
How established is the current leader?
```

The chop fields answer:

```text
How chaotic was the tape before T?
```

Do not combine these until the diagnostic tables show whether they are additive or interactive.

### Phase 2 Tests

Add tests at the same time each pre-T field is added.

Concrete leakage fixture:

1. Build a path with known pre-T values.
2. Compute checkpoint features at T.
3. Mutate only post-T rows, for example by adding a synthetic spike at T+1.
4. Recompute.
5. Assert every `pre*`, `momentum*`, and `leaderAlignedMomentum*` field is unchanged.

Add targeted tests for:

- Positive `momentum30sBps` means upward drift.
- Negative `leaderAlignedMomentum30sBps` means drift against the current leader.
- Mutating pre-T rows outside a momentum lookback does not change that momentum field.
- `preNearLineSeconds` uses `PRE_NEAR_LINE_BPS`, not the 0.5 bps noise band.
- Direction changes ignore deltas smaller than `DIRECTION_CHANGE_MIN_DELTA_BPS`.
- Noise does not create hard flips.
- Pre-T feature fields become null or `unknown` when pre-T path coverage is insufficient.

## Phase 3 - Diagnostic Chop Buckets

Do not start with fixed integer thresholds like `0 / 1-2 / 3+` for the main chop bucket. They may produce skewed cells.

Use distribution-based diagnostic buckets first:

```text
low chop
medium chop
high chop
```

Method:

1. Use only rows from the target checkpoint set:
   - T+180
   - T+200
   - T+210
   - T+220
   - T+240
2. Exclude rows where `prePathGood` is false from threshold fitting.
3. Compute global percentile ranks across the pooled target-checkpoint rows for two conceptually different components:
   - oscillation: `preFlipRatePerMinute`
   - line proximity: `preNearLinePct`
4. Compute:

```text
preChopRank = (oscillationRank + nearLineRank) / 2
```

5. Compute empirical 1/3 and 2/3 quantile thresholds over pooled `preChopRank`.
6. Split pooled `preChopRank` with those concrete thresholds:
   - low: `preChopRank < lowThreshold`
   - medium: `preChopRank >= lowThreshold` and `< highThreshold`
   - high: `preChopRank >= highThreshold`
7. Store the empirical thresholds in the dashboard rollup so the UI can display the bucket definition used.

Percentile-rank details:

- Use mid-rank for ties.
- Bucket sizes are approximate because `preChopRank` can tie when oscillation is discrete and many rows have zero flips.
- Expect `preNearLinePct` to carry more discrimination among zero-flip rows; this is acceptable for the diagnostic phase and should be visible in the bucket definitions.

Rows where `prePathGood` is false go into the `unknown` bucket and are not used to compute ranks.

Do not compute chop ranks separately per checkpoint. The goal is to compare T+200, T+210, and T+220 directly, so `high chop` needs the same meaning across those checkpoints.

Only target-checkpoint rows receive `preChopBucket` in the first build. Non-target checkpoint rows should report `preChopBucket = null` or `unknown` and should not appear in the path-risk diagnostic panels.

Do not include these in `preChopRank`:

- `preCurrentLeadAgeSeconds`
- `preLeaderDwellPct`
- `preLongestLeadStreakSeconds`
- `preLastFlipAgeSeconds`
- `preDirectionChangeCount`
- `preDirectionChangeRatePerMinute`
- `preCrossCountLast60s`
- `preRange60sBps`
- `preRange120sBps`
- `momentum30sBps`
- `momentum60sBps`

Reason:

- Lead age is leader stability, not tape chaos.
- Range is volatility, not necessarily chop.
- Momentum is direction of travel, not chop.
- Direction changes and recent crosses are correlated oscillation diagnostics; including them with `preFlipRatePerMinute` would give oscillation multiple votes.

### Derived Pre-Path Shape

After `preChopBucket` and lead-age buckets exist, derive `prePathShape` in the rollup, not in the Phase 2 materialized checkpoint document.

Initial derived values:

```text
clean-lock
recent-lock
multi-flip-chop
near-line-heavy
unresolved
unknown
```

Initial mapping:

- Evaluate in order. First match wins.
- `unknown`: `prePathGood` is false, no leader is present, or checkpoint is not in the target set.
- `multi-flip-chop`: `preChopBucket = high`.
- `clean-lock`: `preChopBucket = low`, lead age is at least 60 seconds, and `nearLineRank` is below the high threshold.
- `recent-lock`: leader exists and lead age is below 30 seconds.
- `near-line-heavy`: `nearLineRank` is at or above the high threshold and `oscillationRank` is below the high threshold.
- `unresolved`: everything else.

Threshold semantics:

```text
low threshold = empirical 1/3 quantile of pooled preChopRank
high threshold = empirical 2/3 quantile of pooled preChopRank
rank is high when rank >= high threshold
rank is not high when rank < high threshold
```

Use component-specific high thresholds for component ranks:

```text
nearLineHighThreshold = empirical 2/3 quantile of pooled nearLineRank
oscillationHighThreshold = empirical 2/3 quantile of pooled oscillationRank
```

Do not reuse the `preChopRank` high threshold as a generic rank threshold for `nearLineRank` or `oscillationRank`.

Precedence rationale:

- High chop wins over recent-lock because path chaos is the main danger signal.
- Clean-lock requires not-high near-line exposure; a long-led market that stayed pinned near the line is not clean.

This is a checkpoint-time shape label. It must not reuse or depend on full-window path types like `early-lock`, `mid-lock`, or `chop`.

Later freeze step:

- After the diagnostic shape is clear, consider replacing rank cuts with raw fixed thresholds.
- Bump `DASHBOARD_ROLLUP_VERSION` if raw thresholds are frozen.
- Document the frozen thresholds in this file or a follow-up plan.

## Phase 4 - Rollup Reports

Build three 3-way reports first.

Target checkpoints:

```text
T+180
T+200
T+210
T+220
T+240
```

Target distance bands:

```text
0.5-1 bps
1-2 bps
2-3 bps
3-4 bps
4-5 bps
5-7.5 bps
7.5-10 bps
>10 bps
```

Exclude the `<=0.5 bps` no-decision band from leader-win diagnostic rates, but keep its counts visible in dataset-health/decomposition panels. The current stability code treats leaders as decision-eligible once they are outside the 0.5 bps deadband, so dropping 0.5-3 bps would hide the most failure-prone valid leader cohort.

### Report A - Distance x Chop

Dimensions:

```text
checkpointSecond
distanceBucket
preChopBucket
```

Metrics:

```text
N
leaderEligibleN
leaderWinRate
stableLeaderWinRate
fragileWinRate
flipLossRate
anyFlipAfterTRate
medianMaxAdverseBps
p90MaxAdverseBps
medianMaxAdverseDrawdownBps
p90MaxAdverseDrawdownBps
```

Purpose:

```text
Does pre-checkpoint chop explain leader failures at the same distance and checkpoint?
```

### Report B - Distance x Momentum Agreement

Dimensions:

```text
checkpointSecond
distanceBucket
momentum30sAgreementBucket
```

Agreement buckets:

```text
agrees
disagrees
flat
unknown
```

Metrics:

```text
N
leaderEligibleN
leaderWinRate
stableLeaderWinRate
fragileWinRate
flipLossRate
anyFlipAfterTRate
medianMaxAdverseBps
p90MaxAdverseBps
medianMaxAdverseDrawdownBps
p90MaxAdverseDrawdownBps
```

Purpose:

```text
Does recent drift against the leader explain failures, especially at 3-5 bps?
```

### Report C - Distance x Lead Age

Dimensions:

```text
checkpointSecond
distanceBucket
leadAgeBucket
```

Use the existing lead-age bucket definitions:

```text
<10s
10-30s
30-60s
60-120s
120s+
```

Metrics:

```text
N
leaderEligibleN
leaderWinRate
stableLeaderWinRate
fragileWinRate
flipLossRate
anyFlipAfterTRate
medianMaxAdverseDrawdownBps
p90MaxAdverseDrawdownBps
```

Purpose:

```text
Does leader age add signal after checkpoint and distance are controlled?
```

Implementation note:

- Existing `buildLeadAgeTables` is hardcoded to T+270 and T+285.
- For this work, create a target-checkpoint lead-age report for T+180, T+200, T+210, T+220, and T+240.

### Focused 4-Way Slice

Do not ship the full 4-way cube initially.

The full cube would be roughly:

```text
5 checkpoints x 8 distance buckets x 3 chop buckets x 4 momentum buckets = 480 cells
```

With about 2,576 markets, that averages around 5.4 rows per cell before corner sparsity.

Only add a focused 4-way slice after Reports A and B identify high-signal areas.

Candidate first slice:

```text
checkpoints: T+200, T+210, T+220
distance: 3-4 bps, 4-5 bps, 5-7.5 bps
chop: high vs not-high
momentum: agrees vs disagrees
```

### Support Rules

For these diagnostic reports:

```text
N is always shown.
N < 30 is marked sparse and not colored.
30 <= N < 100 is visible but not colored.
N >= 100 is color-eligible.
```

This is slightly different from the existing stability heatmap behavior and is intentional. These are diagnostic tables where counts matter as much as rates.

## Phase 5 - Durability Ratio

The headline statistic:

```text
durability = abs(distanceBps) / expectedAdverseBps
```

Interpretation:

```text
Is the current leader ahead by enough to survive this cohort's remaining path risk?
```

### Expected Adverse Movement

For the first descriptive dashboard version, compute cohort adverse movement by state:

```text
checkpointSecond
preChopBucket
momentumAgreementBucket
```

Do not include `distanceBucket` in the expected-adverse prior key. Distance is the numerator. If distance is also part of the denominator cohort, durability mostly becomes a re-labeling of the same distance bucket.

Only rows with finite `postMaxAdverseDrawdownBps` are eligible for prior estimation.

Durability prior support:

```text
MIN_DURABILITY_PRIOR_N = 50
```

Use a hierarchical fallback rather than an unstable sparse p90:

1. Primary prior: `checkpointSecond + preChopBucket + momentumAgreementBucket`.
2. If primary N is below 50, fallback to `checkpointSecond + preChopBucket` with momentum pooled.
3. If fallback N is below 50, fallback to `checkpointSecond` with chop and momentum pooled.
4. If checkpoint N is below 50, fallback to the pooled target-checkpoint prior.
5. If every fallback is below support, mark durability unknown.

Store the selected prior's:

```text
durabilityPriorN
durabilityPriorSource
```

Allowed `durabilityPriorSource` values:

```text
checkpoint-chop-momentum
checkpoint-chop
checkpoint
target-global
unknown
```

Store:

```text
expectedAdverseP50Bps
expectedAdverseP75Bps
expectedAdverseP90Bps
```

Use a new post-checkpoint label for the adverse movement outcome:

```text
checkpointSignedMarginBps = abs(distanceBps)
postMaxAdverseDrawdownBps =
  max(0, checkpointSignedMarginBps - postMinSignedMarginBps)
```

This field is null when leader, distance, or post-path coverage is missing.

Reason:

- Existing `postMaxAdverseBps` measures how far the path went underwater after crossing the line.
- Durability needs adverse drawdown from the checkpoint margin, including adverse moves that approached the line but did not cross it.

Aggregation note:

- Report A aggregates adverse drawdown by checkpoint, distance, and chop.
- Report B aggregates adverse drawdown by checkpoint, distance, and momentum.
- Durability priors aggregate adverse drawdown by checkpoint, chop, and momentum, with hierarchical fallback.
- These are three separate rollup passes over the same derived field. Do not try to derive one from the others.

Default durability denominator:

```text
expectedAdverseP90Bps
```

Survival is a tail question, so p90 is the default. The rollup should also store p50 and p75, and the UI may expose a percentile toggle, but it should not silently default to p75.

Denominator guard:

```text
DURABILITY_DENOMINATOR_FLOOR_BPS = 0.5
denominator = max(selectedExpectedAdverseBps, DURABILITY_DENOMINATOR_FLOOR_BPS)
```

Do not emphasize raw ratios in the UI. Display buckets:

```text
<1x
1-2x
2-3x
3x+
```

Bucket boundaries:

```text
<1x: durability < 1
1-2x: 1 <= durability < 2
2-3x: 2 <= durability < 3
3x+: durability >= 3
```

Reason:

- Small expected-adverse denominators can blow up raw ratios.
- Buckets are easier to compare and less likely to imply false precision.

Readout:

```text
Within each distance bucket, compare durability buckets.
Example: inside 4-5 bps, did >=2x durability markets hold better than <1x durability markets?
```

### Leakage Rules

Descriptive cohort view:

- It is acceptable for a market to be part of the cohort statistic shown for its state, as long as the UI labels it as a cohort statistic.
- The UI must not call it a predictor or signal.

Predictive validation view:

- Use leave-one-out or held-out time windows.
- A row's expected adverse prior must not include that same row.
- Prefer chronological holdout over random split because markets are time-series adjacent.

Dashboard label:

```text
Cohort durability, not a live predictor
```

## Phase 6 - Convex Schema And Materialization

### Schema

Update `convex/schema.js` for new checkpoint fields in `market_stability_analytics`.

Use optional nullable fields during migration so existing rows do not break reads:

```text
momentum30sBps
momentum60sBps
momentum30sSide
momentum60sSide
momentum30sAgreesWithLeader
momentum60sAgreesWithLeader
leaderAlignedMomentum30sBps
leaderAlignedMomentum60sBps
preNearLineSeconds
preDirectionChangeCount
preCrossCountLast60s
preRange60sBps
preRange120sBps
prePathGood
preSnapshotCoveragePct
preMaxSnapshotGapMs
```

Do not add required fields to existing strict checkpoint objects. `market_stability_analytics.checkpoints` is a strict array of objects, so every new checkpoint field must be `optionalNullable(...)` during the migration window.

Do not add schema fields for deterministic derived values:

```text
preFlipRatePerMinute
preNearLinePct
preDirectionChangeRatePerMinute
postMaxAdverseDrawdownBps
preChopRank
preChopBucket
prePathShape
durabilityRatio
durabilityBucket
```

Compute these in `packages/shared/src/analyticsDashboard.js` during rollup construction. This avoids rematerializing every stability row when formulas change.

`analytics_dashboard_rollups.v2` is already `v.any()`, so new rollup tables do not require schema growth. Still bump `DASHBOARD_ROLLUP_VERSION` because the payload contract changes.

### Materializers

Update:

- `convex/internal/marketAnalytics.js` for the new v1 checkpoint list.
- `convex/internal/marketStabilityAnalytics.js` to write new stability fields.
- Any repair/backfill helpers that materialize stale analytics docs.

Backfill sequence:

1. Deploy schema and shared builder changes.
2. Materialize stale or missing `market_analytics`.
3. Materialize stale or missing `market_stability_analytics`.
4. Refresh dashboard rollup.
5. Verify dashboard query payload shape.

During the schema-deployed/backfill-incomplete window, rollup builders and UI code must defensively handle missing new fields as null/unknown. Backfill order should improve completeness, not be required for read safety.

### Rollups

Update `packages/shared/src/analyticsDashboard.js` and `convex/internal/analyticsRollups.js` so rollups include:

```text
stability.pathRiskByChop
stability.momentumAgreement
stability.durability
stability.durabilityPriorDefinitions
stability.leaderAgeByDistance
stability.prePathShapes
stability.preChopBucketDefinitions
```

Keep client reads on `api.analytics.getDashboard`. Do not add live dashboard scans.

## Phase 7 - Dashboard UI

Keep `app/analytics/page.js` as the route shell.

Add panels in `components/AnalyticsDashboard.js`:

1. `Path Risk By Chop`
   - checkpoint x distance x chop bucket
   - shows N, leader win, flip loss, stable win, p90 adverse drawdown

2. `Momentum Agreement`
   - checkpoint x distance x momentum agreement
   - defaults to 30s momentum
   - later can allow 60s toggle

3. `Cohort Durability`
   - durability buckets
   - expected adverse p50, p75, and p90
   - defaults to p90 for survival framing
   - shows prior N and prior source for every durability cell
   - clear label: cohort statistic, not predictor

4. `Leader Age`
   - checkpoint x distance x lead-age bucket
   - covers T+180, T+200, T+210, T+220, and T+240
   - shows N, leader win, stable win, flip loss, and p90 adverse drawdown

5. `Pre-Path Shape`
   - derived from chop bucket and lead age
   - used as a cross-check, not as the primary model
   - table shape by checkpoint, with N, share of checkpoint cohort, leader win, stable win, flip loss, median distance, and p90 adverse drawdown
   - optional drilldown by distance only if support remains healthy

UI support display:

- Show N in every cell.
- Mark sparse cells with `N < 30`.
- Do not color cells below `N = 100`.
- Include the chop bucket thresholds used by the rollup.

Copy/export:

- Extend existing markdown export helpers for the new reports.
- Include rollup timestamp, clean sample size, support rules, and bucket definitions.

## Phase 8 - Verification

Shared tests:

```text
packages/shared/src/marketAnalytics.test.js
packages/shared/src/marketStabilityAnalytics.test.js
packages/shared/src/analyticsDashboard.test.js
```

Required assertions:

- New checkpoints are present in v1 analytics rows.
- New checkpoints are present in stability rows.
- Momentum sign convention is correct.
- Momentum agreement handles `flat` and null leader cases.
- Pre-T fields are unchanged after mutating post-T rows.
- Momentum fields are unchanged after mutating pre-T rows outside the momentum lookback.
- Near-line seconds use `PRE_NEAR_LINE_BPS`.
- Direction changes ignore sub-threshold deltas.
- Chop buckets use empirical pooled target-checkpoint terciles over `preChopRank` on elapsed-time-normalized inputs.
- Chop percentile ranks use mid-rank tie handling.
- Non-target checkpoints do not receive target diagnostic `preChopBucket` values.
- `prePathShape` precedence is first-match-wins and classifies high-chop recent leaders as `multi-flip-chop`.
- `prePathShape` uses component-specific high thresholds for near-line-heavy classification.
- Short lookbacks use available in-window rows from `[max(0, T-N), T]`.
- `preNearLineSeconds` uses current-row interval attribution.
- Sparse cells are marked at `N < 30`.
- Color eligibility starts at `N >= 100`.
- Durability prior fallback chooses the first supported hierarchy level and records prior N/source.
- Durability denominator uses the 0.5 bps floor.
- Durability priors do not include distance bucket in the cohort key.
- Durability uses adverse drawdown, not only underwater adverse distance.
- Adverse drawdown derivation is `max(0, abs(distanceBps) - postMinSignedMarginBps)`.
- Durability is bucketed in the UI/rollup.
- Durability bucket boundaries are `[0,1)`, `[1,2)`, `[2,3)`, and `>=3`.

Convex verification:

```text
npx convex dev --once
npx convex run internal/marketAnalytics:materializeMissingOrStale '{"limit":50,"includeResults":true}'
npx convex run internal/marketStabilityAnalytics:materializeMissingOrStale '{"limit":50,"includeResults":true}'
npx convex run internal/analyticsRollups:refreshNow '{}'
npx convex run analytics:getDashboard '{}'
```

Build verification:

```text
npm test
npm run build
```

## Phase 9 - Readout Questions

The first dashboard pass should answer these, in order:

1. Around T+200 to T+220, does leader win rate improve sharply at the same distance?
2. At 3-5 bps, does high pre-checkpoint chop explain most leader failures?
3. At 3-5 bps, does 30s momentum disagreement explain failures after controlling for checkpoint and distance?
4. Does chop still matter above 7.5 bps?
5. Does momentum disagreement stop mattering above 7.5 or 10 bps?
6. Does leader age add signal after chop and momentum are shown separately?
7. Within the same distance bucket, do durability buckets separate outcomes better than raw distance alone?

## Non-Goals For The First Build

- No full 480-cell 4-way cube in the first UI.
- No claim that durability is a live signal.
- No random train/test split across checkpoint rows from the same market.
- No market-price or odds features.
- No raw WebSocket event dependency.
- No rewrite of `app/analytics/page.js` beyond copy changes if needed.
