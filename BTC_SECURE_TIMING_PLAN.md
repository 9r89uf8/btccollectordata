# BTC Secure Timing Plan

## Goal

Measure, for each finalized BTC 5-minute market, the earliest observed live bucket `T`
at which BTC is already on the eventual winning side of the anchor and never crosses
 back before the market closes.

This should let `/analytics` answer questions like:

- "By T+120s, what share of markets were already BTC-secured?"
- "What is the median first secure time?"
- "Do Up and Down markets secure at different times?"

## Important corrections

1. Snapshot precision is not always truly 1 second.
The storage table is `market_snapshots_1s`, but current precision depends on the
observed snapshot cadence. New data may be 1-second or 5-second sampled, and the
summary pipeline already infers cadence from observed snapshots. `firstBtcSecureSecond`
therefore means earliest observed live bucket, not guaranteed 1-second truth.

2. Anchor must be explicit.
Use:

`anchor = market.priceToBeatOfficial ?? startReference.chainlinkPrice`

This matches current summary behavior, where `priceToBeatDerived` is the start
boundary Chainlink reference.

3. Ties must follow the existing winner rule.
Current derived outcome logic is:

`endPrice >= startPrice ? "up" : "down"`

So the secure-side rule must be:

- winner `up` => `delta >= 0`
- winner `down` => `delta < 0`

4. Missing BTC buckets should not count as violations.
If a live snapshot has `btcChainlink = null`, skip it for the lock test. Do not treat
it as adverse movement. Confidence issues from sparse BTC should be surfaced through
quality flags, not by forcing a false unlock.

5. Outcome conflicts need a flag, not a separate algorithm.
If `market.winningOutcome` exists and disagrees with the BTC-derived end outcome,
`firstBtcSecureSecond` will naturally end up `null` because the close-side check fails.
Still add a quality flag such as `btc_path_conflicts_resolved` so analytics can count
those cases explicitly.

Also distinguish one anchor-specific mismatch:

- if `winner` is derived from start/end references but the end reference lands on the
  opposite side of `priceToBeatOfficial`, add `btc_secure_end_off_anchor_side`

Without that flag, markets where the official anchor differs from the derived start
reference can silently fall into `null` secure timing with no explanation.

6. Reuse existing checkpoint vocabulary for the first analytics cut.
For the dashboard, use the same checkpoint seconds already used elsewhere:

`[15, 30, 60, 120, 240, 295]`

We can add extra lock checkpoints later if needed, but the first version should stay
consistent with the current analytics surface.

7. Do not store redundant timestamps.
`firstBtcSecureBucketTs` is derivable from `windowStartTs + firstBtcSecureSecond * 1000`.
Store only `firstBtcSecureSecond`.

8. This repo already has automated summary and analytics tests.
This work should add coverage to `packages/shared/src/summary.test.js` and
`packages/shared/src/analytics.test.js`, not rely on manual verification alone.

## Definition

Let:

- `winner = market.winningOutcome ?? derivedOutcome`
- `anchor = market.priceToBeatOfficial ?? startReference.chainlinkPrice`
- `delta(snapshot) = snapshot.btcChainlink - anchor`

Define:

- `matchesWinner(delta, "up") = delta >= 0`
- `matchesWinner(delta, "down") = delta < 0`

A live snapshot at `T = snapshot.secondsFromWindowStart` is BTC-secured iff:

1. `snapshot.phase === "live"`
2. `snapshot.btcChainlink` is non-null
3. `matchesWinner(delta(snapshot), winner)` is true
4. Every later live snapshot with non-null `btcChainlink` also matches `winner`
5. The end boundary reference also matches `winner`

Then:

`firstBtcSecureSecond = min(T over all BTC-secured live snapshots)`

If no such live snapshot exists, store `null`.

## Null and conflict handling

- anchor missing:
  - `firstBtcSecureSecond = null`
  - add `btc_secure_missing_anchor`

- winner missing:
  - `firstBtcSecureSecond = null`
  - rely on existing `missing_resolved_outcome`

- no live snapshots with non-null BTC:
  - `firstBtcSecureSecond = null`
  - add `btc_secure_no_btc_data`

- official winner conflicts with BTC-derived end outcome:
  - `firstBtcSecureSecond = null`
  - add `btc_path_conflicts_resolved`

- derived winner matches start/end references but the end reference is on the wrong
  side of the official anchor:
  - `firstBtcSecureSecond = null`
  - add `btc_secure_end_off_anchor_side`

## Implementation

### 1. Summary pipeline

File: `packages/shared/src/summary.js`

Add:

- `matchesWinner(delta, winner)`
- `computeFirstBtcSecureSecond({ liveSnapshots, anchor, winner, endReferencePrice })`

Recommended logic:

1. Return `null` early if `anchor`, `winner`, or `endReferencePrice` is missing.
2. Return `null` if the end reference does not match `winner`.
3. Filter to live snapshots with non-null `btcChainlink`.
4. Find the last violating live snapshot, meaning the last one where BTC is on the
   losing side of the eventual winner.
5. The secure second is the first later matching live snapshot after that last
   violation. If no violation exists, it is the first matching live snapshot.
6. Measure how much of the remaining live tail has null BTC values after the chosen
   secure candidate. If that sparse tail exceeds a threshold such as 30%, add
   `btc_secure_sparse_tail`.

This gives the same result as a full suffix check, but is simpler and linear.

Use the scalar `endReferencePrice` in the helper signature and unwrap
`endReference.chainlinkPrice` at the call site. That keeps the helper focused on the
comparison inputs instead of summary-specific object shapes.

Integrate into `buildMarketSummary` and add:

- `summary.firstBtcSecureSecond`

Extend `buildQualityFlags` to append:

- `btc_secure_missing_anchor`
- `btc_secure_no_btc_data`
- `btc_path_conflicts_resolved`
- `btc_secure_end_off_anchor_side`
- `btc_secure_sparse_tail`

### 2. Schema

File: `convex/schema.js`

Add to `market_summaries`:

`firstBtcSecureSecond: optionalNullable(v.number())`

Use `optionalNullable` so existing rows stay valid.

### 3. Finalization

File: `convex/internal/finalize.js`

`finalizeOneMarket` does not need structural changes because it already writes the
entire `result.summary`.

### 4. Backfill

Do not rely on `reconcileRecentClosedMarkets` for deep backfill. It only works on a
recent candidate window today.

Use existing mutations instead:

- `internal/finalize:finalizeEligibleMarkets({ force: true, limit: 200 })`
- repeat until historical summaries are refreshed

For targeted rows:

- `internal/finalize:finalizeMarketsBySlug({ force: true, slugs })`

Keep this explicit. Do not teach `summaryNeedsRefresh` to backfill missing
`firstBtcSecureSecond`, because that would turn normal finalize scans into an
implicit historical sweep until every old row is refreshed.

### 5. Analytics

Primary file: `packages/shared/src/analytics.js`

Add a new BTC lock block based on `firstBtcSecureSecond`:

- share secured by `T+15`, `T+30`, `T+60`, `T+120`, `T+240`, `T+295`
- median `firstBtcSecureSecond`
- p25 and p75
- resolved outcome split (`up` vs `down`)
- count of rows flagged `btc_path_conflicts_resolved`
- count of rows flagged `btc_secure_end_off_anchor_side`
- count of rows with null `firstBtcSecureSecond`
- sample-cadence mix, so the UI can show whether the filtered rows are mostly 1s or 5s
  sampled

File: `convex/analytics.js`

Likely no structural change beyond returning the extended shared report, because
`getDashboard` already delegates to `buildAnalyticsReport`.

### 6. UI

Primary file: `components/AnalyticsDashboard.js`

Add a new section:

- title: `BTC-path lock timing`
- headline: `% secured by T+120`
- table or cards for checkpoint shares
- summary stats for median / p25 / p75
- outcome split and conflict count
- cadence note such as `1s rows: X%, 5s rows: Y%`, derived from the existing
  `sample_cadence_ms:*` quality flag data in summaries

`app/analytics/page.js` probably does not need logic changes beyond optional copy
updates, since the route already renders `AnalyticsDashboard`.

## Tests

### Summary tests

File: `packages/shared/src/summary.test.js`

Add at least:

1. locks at T+30 and never crosses back -> `firstBtcSecureSecond = 30`
2. crosses back at T+200, re-locks at T+240 -> `firstBtcSecureSecond = 240`
3. resolved outcome conflicts with BTC-derived close -> `firstBtcSecureSecond = null`
   and `btc_path_conflicts_resolved` present
4. missing anchor -> `null` + `btc_secure_missing_anchor`
5. all live BTC values null -> `null` + `btc_secure_no_btc_data`
6. tie at exactly `delta = 0` with winner `up` -> counts as secured
7. lock at `T+0` -> `firstBtcSecureSecond = 0`
8. official anchor mismatch case -> `null` + `btc_secure_end_off_anchor_side`

### Analytics tests

File: `packages/shared/src/analytics.test.js`

Add coverage for:

- checkpoint share computation from `firstBtcSecureSecond`
- percentile computation
- up/down split
- null secure rows and conflict rows

## Verification

1. Run:

- `npm test`
- `npm run build`

2. Backfill a recent batch with forced finalization and inspect a few summaries in
Convex to confirm `firstBtcSecureSecond` matches the underlying live BTC path.

3. Check `/analytics` and compare one or two markets manually against their
`market_snapshots_1s` rows.

## Scope

Included:

- BTC-path first secure time
- summary storage
- analytics surface
- test coverage

Deferred:

- market-confidence lock from displayed odds
- extra custom lock checkpoints like T+90 or T+180
- storing redundant timestamp fields
- collector-side changes
- session/hour split specifically for lock timing on the first pass

Note: the analytics system already supports ET hour/session slicing for other BTC
move analysis, so adding that later will be straightforward if the secure-timing
metric proves useful.
