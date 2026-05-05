# Last 10 Seconds Market Collection

This document describes what the collector stores for the final seconds of each BTC 5 minute market, where it is stored, and which fields are used by the market detail page.

## Goal

The final seconds are the highest value part of each market because this is where late flips, stale feeds, book gaps, and BTC provider differences matter most. Instead of collecting dense one second CLOB snapshots for every active market for the full market lifetime, the collector has a separate final-window poll that targets only markets near close.

For a normal 5 minute market, the useful window is the close bucket and the 10 seconds before close. With one second buckets this is usually `T+290` through `T+300` inclusive.

This design is also about saving Convex bandwidth. We want to keep high-value final-window evidence while avoiding expensive reads and writes for data that is less useful early in each market.

## When We Collect

The collector runs two snapshot paths:

- Regular snapshots: `SNAPSHOT_POLL_MS`, for all active markets.
- Final-window snapshots: `FINAL_SNAPSHOT_POLL_MS`, only for markets whose `windowEndTs` is inside `FINAL_SNAPSHOT_WINDOW_MS`.

Defaults:

- `FINAL_SNAPSHOT_POLL_MS=1000`
- `FINAL_SNAPSHOT_WINDOW_MS=10000`

The final-window selector includes a market when:

```text
secondBucket >= windowEndTs - FINAL_SNAPSHOT_WINDOW_MS
secondBucket <= windowEndTs
```

This includes the close second itself. If the poll lands slightly after close but still rounds to the close bucket, that close bucket is still captured.

## Data Sources

For each selected final-window market, the collector polls Polymarket CLOB for both outcome token IDs:

- `/books`
- `/last-trades-prices`
- `/midpoints`

The collector also attaches the latest BTC RTDS ticks it has in memory:

- Chainlink BTC/USD, always subscribed.
- Binance BTC/USDT, only when `ENABLE_BINANCE_CONTEXT=true`.

BTC ticks are collected continuously by RTDS. The final-window snapshot stores the latest known tick values and, during the final window only, extra timing fields that show how fresh each provider was when the snapshot was written.

## Snapshot Rows

Rows are stored in Convex table `market_snapshots_1s`.

Each row is keyed by:

- `marketSlug`
- `secondBucket`

The collector dedupes pending rows by that key before sending them to Convex. Convex also upserts by the same key and can overwrite a row for a short grace period after the second bucket. After the write grace expires, later duplicate writes are skipped.

## Core Fields Stored On Every Snapshot

Market timing:

- `marketSlug`
- `marketId`
- `ts`: collector write timestamp for this snapshot.
- `secondBucket`: the one second bucket for the snapshot.
- `secondsFromWindowStart`: elapsed seconds from market open.
- `phase`: `pre`, `live`, or `post`.
- `writtenAt`

Up outcome market data:

- `upBid`: top bid price.
- `upAsk`: top ask price.
- `upMid`: CLOB midpoint, or derived midpoint from top bid and ask.
- `upLast`: last trade price.
- `upDisplayed`: displayed probability chosen by our display rule.
- `upSpread`: top ask minus top bid.
- `upDepthBidTop`: size at top bid.
- `upDepthAskTop`: size at top ask.

Down outcome market data:

- `downBid`
- `downAsk`
- `downMid`
- `downLast`
- `downDisplayed`
- `downSpread`
- `downDepthBidTop`
- `downDepthAskTop`

Display and quality:

- `displayRuleUsed`: `midpoint`, `last_trade`, or `unknown`.
- `marketImbalance`: `upDisplayed + downDisplayed - 1`.
- `sourceQuality`: `good`, `stale_book`, `stale_btc`, or `gap`.

BTC prices:

- `btcChainlink`: latest Chainlink BTC/USD price known to the collector.
- `btcBinance`: latest Binance BTC/USDT price known to the collector, if Binance context is enabled.

## Extra Fields Stored Only In The Final Window

These fields are added only when the snapshot bucket is inside:

```text
windowEndTs - FINAL_FORENSICS_WINDOW_MS through windowEndTs
```

The current code sets `FINAL_FORENSICS_WINDOW_MS` to 10 seconds.

Polymarket timing:

- `upBookTs`: timestamp attached to the Up book quote.
- `upBookAgeMs`: `snapshot ts - upBookTs`.
- `upLastTs`: timestamp attached to the Up last trade.
- `upLastAgeMs`: `snapshot ts - upLastTs`.
- `downBookTs`
- `downBookAgeMs`
- `downLastTs`
- `downLastAgeMs`

BTC provider timing:

- `btcChainlinkTs`: Chainlink provider timestamp for the latest tick.
- `btcChainlinkReceivedAt`: when our collector received that Chainlink tick.
- `btcChainlinkReceivedAgeMs`: `snapshot ts - btcChainlinkReceivedAt`.
- `btcBinanceTs`: Binance provider timestamp for the latest tick.
- `btcBinanceReceivedAt`: when our collector received that Binance tick.
- `btcBinanceReceivedAgeMs`: `snapshot ts - btcBinanceReceivedAt`.

These timing fields are what let us inspect whether a row used fresh data, stale CLOB data, or a BTC provider tick that arrived late relative to the market close.

## Displayed Probability Rule

For each outcome, the collector computes `displayedPrice` like this:

1. Use midpoint when bid, ask, and midpoint are present and the spread is at most `0.1`.
2. Otherwise use last trade price when available.
3. Otherwise use midpoint when available.
4. Otherwise store `null`.

`displayRuleUsed` is the rule used by the Up side if known, otherwise the Down side.

This matters because some final-second rows can show confusing prices when the book is wide or incomplete and the snapshot falls back to last trade.

## Quality Rule

`sourceQuality` is computed per snapshot:

- `gap`: Up or Down displayed probability is missing.
- `stale_book`: either side's book timestamp is older than `BOOK_STALE_MS` (`5000` ms).
- `stale_btc`: Chainlink is missing or its received timestamp is older than `BTC_STALE_MS` (`10000` ms).
- `good`: displayed prices are present, books are fresh, and Chainlink is fresh.

Binance freshness is stored for forensics, but Chainlink is the BTC freshness source used by `sourceQuality`.

## Price To Beat

The price-to-beat is not duplicated onto every final-window snapshot row.

It lives on the market and summary records:

- `markets.priceToBeatOfficial`
- `markets.priceToBeatDerived`
- `market_summaries.priceToBeatOfficial`
- `market_summaries.priceToBeatDerived`

The market detail page overlays the price-to-beat with the final-window snapshot rows. That means final-window rows contain the BTC prices and timing evidence, while the market record provides the reference line.

## What The Detail Page Can Show

For the expanded final-window chart, the available data is:

- Up displayed probability by second.
- Down displayed probability by second.
- Chainlink BTC price by second.
- Binance BTC price by second, when enabled and available.
- Price-to-beat reference line from the market record.
- Actual elapsed/clock labels from `secondBucket`, not just fixed `T+295` labels.

For the final-window table/tape, the available data is:

- Per-second Up and Down bid/ask/mid/last/displayed values.
- Display rule used.
- Source quality.
- BTC Chainlink and Binance prices.
- Book, last trade, Chainlink, and Binance timestamp/age diagnostics for the final 10 seconds.

## Operational Notes

- To keep bandwidth down, production should keep regular full-market polling coarse and use `FINAL_SNAPSHOT_POLL_MS=1000` for dense final-window rows.
- `ENABLE_BINANCE_CONTEXT=true` is required for Binance BTC rows and timing fields to be populated.
- If Binance appears flat in the chart, check `btcBinanceTs`, `btcBinanceReceivedAt`, and `btcBinanceReceivedAgeMs` before assuming the market moved only on Chainlink.
- If `sourceQuality` is `stale_btc`, the Chainlink tick was stale even if Binance had a recent value.
- If `displayRuleUsed` is `last_trade`, the displayed probability may lag or disagree with the visible book, especially during wide or incomplete final-second books.

## Analytics Rollups And Bandwidth

The `/analytics` page is intentionally backed by a cached rollup row instead of scanning all analytics tables on every page load. This saves Convex database bandwidth when the page is opened or refreshed.

The dashboard rollup is intentionally manual. We do not schedule it in `convex/crons.js` because rebuilding it scans many `market_analytics`, `market_stability_analytics`, and `markets` rows. Run it only when you want the analytics page cache to update:

```powershell
npx convex run internal/analyticsRollups:refreshNow '{}'
```

Use full mode only when you want the larger historical rollup:

```powershell
npx convex run internal/analyticsRollups:refreshNow '{"mode":"full"}'
```

The tradeoff is that new markets can be collected and materialized while `/analytics` still shows the previous cached rollup until this command is run.
