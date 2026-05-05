import test from "node:test";
import assert from "node:assert/strict";

import { buildBtcEthOutcomeComparison } from "./cryptoPairAnalytics.js";

function market({ asset, outcome, start, resolved = true }) {
  return {
    active: false,
    asset,
    closed: true,
    dataQuality: "good",
    marketId: `${asset}-${start}`,
    question: `${asset} ${start}`,
    resolved,
    slug: `${asset}-updown-5m-${Math.floor(start / 1000)}`,
    windowEndTs: start + 5 * 60_000,
    windowStartTs: start,
    winningOutcome: outcome,
  };
}

test("buildBtcEthOutcomeComparison pairs BTC and ETH by window start", () => {
  const nowTs = 1_000_000;
  const first = nowTs - 10 * 60_000;
  const second = nowTs - 5 * 60_000;
  const dashboard = buildBtcEthOutcomeComparison({
    markets: [
      market({ asset: "btc", outcome: "up", start: first }),
      market({ asset: "eth", outcome: "up", start: first }),
      market({ asset: "btc", outcome: "down", start: second }),
      market({ asset: "eth", outcome: "up", start: second }),
    ],
    nowTs,
  });

  assert.equal(dashboard.summary.pairedWindows, 2);
  assert.equal(dashboard.summary.resolvedPairs, 2);
  assert.equal(dashboard.summary.sameOutcome, 1);
  assert.equal(dashboard.summary.oppositeOutcome, 1);
  assert.equal(dashboard.summary.sameOutcomeRate, 0.5);
  assert.deepEqual(
    dashboard.pairs.map((pair) => pair.status),
    ["opposite", "same"],
  );
});

test("buildBtcEthOutcomeComparison reports missing and unresolved pairs", () => {
  const nowTs = 1_000_000;
  const paired = nowTs - 15 * 60_000;
  const missingEth = nowTs - 10 * 60_000;
  const missingBtc = nowTs - 5 * 60_000;
  const dashboard = buildBtcEthOutcomeComparison({
    markets: [
      market({ asset: "btc", outcome: "up", start: paired }),
      market({ asset: "eth", outcome: null, resolved: false, start: paired }),
      market({ asset: "btc", outcome: "down", start: missingEth }),
      market({ asset: "eth", outcome: "up", start: missingBtc }),
      market({ asset: "btc", outcome: "up", start: nowTs - 2 * 24 * 60 * 60_000 }),
    ],
    nowTs,
  });

  assert.equal(dashboard.summary.totalWindows, 3);
  assert.equal(dashboard.summary.unresolvedPairs, 1);
  assert.equal(dashboard.summary.missingEth, 1);
  assert.equal(dashboard.summary.missingBtc, 1);
  assert.equal(dashboard.summary.resolvedPairs, 0);
  assert.equal(dashboard.summary.sameOutcomeRate, null);
});

test("buildBtcEthOutcomeComparison compares prior BTC to current ETH", () => {
  const nowTs = 2_000_000;
  const first = nowTs - 20 * 60_000;
  const second = first + 5 * 60_000;
  const third = second + 5 * 60_000;
  const dashboard = buildBtcEthOutcomeComparison({
    markets: [
      market({ asset: "btc", outcome: "up", start: first }),
      market({ asset: "eth", outcome: "down", start: first }),
      market({ asset: "btc", outcome: "down", start: second }),
      market({ asset: "eth", outcome: "down", start: second }),
      market({ asset: "eth", outcome: "down", start: third }),
    ],
    nowTs,
  });

  assert.equal(dashboard.lag.summary.totalEthWindows, 3);
  assert.equal(dashboard.lag.summary.resolvedPairs, 2);
  assert.equal(dashboard.lag.summary.sameOutcome, 1);
  assert.equal(dashboard.lag.summary.oppositeOutcome, 1);
  assert.equal(dashboard.lag.summary.missingPriorBtc, 1);
  assert.deepEqual(
    dashboard.lag.rows.map((row) => row.status),
    ["same", "opposite", "missing_prior_btc"],
  );
});

test("buildBtcEthOutcomeComparison uses one pre-lookback BTC window for lag only", () => {
  const nowTs = 3_000_000;
  const lookbackMs = 10 * 60_000;
  const current = nowTs - lookbackMs;
  const prior = current - 5 * 60_000;
  const dashboard = buildBtcEthOutcomeComparison({
    lookbackMs,
    markets: [
      market({ asset: "btc", outcome: "up", start: prior }),
      market({ asset: "eth", outcome: "up", start: current }),
    ],
    nowTs,
  });

  assert.equal(dashboard.summary.totalWindows, 1);
  assert.equal(dashboard.summary.missingBtc, 1);
  assert.equal(dashboard.lag.summary.resolvedPairs, 1);
  assert.equal(dashboard.lag.summary.sameOutcome, 1);
  assert.equal(dashboard.lag.rows[0].previousBtc.slug, `btc-updown-5m-${Math.floor(prior / 1000)}`);
});
