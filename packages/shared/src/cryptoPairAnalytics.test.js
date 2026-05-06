import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBtcEthOutcomeComparison,
  buildEthFinalFlipAnalytics,
} from "./cryptoPairAnalytics.js";

function market({ asset, outcome, start, resolved = true }) {
  return {
    active: false,
    asset,
    closed: true,
    dataQuality: "good",
    marketId: `${asset}-${start}`,
    priceToBeatDerived: 100,
    priceToBeatOfficial: null,
    question: `${asset} ${start}`,
    resolved,
    slug: `${asset}-updown-5m-${Math.floor(start / 1000)}`,
    windowEndTs: start + 5 * 60_000,
    windowStartTs: start,
    winningOutcome: outcome,
  };
}

function snapshot({
  downDisplayed = 0.2,
  ethChainlink = 99,
  second,
  start,
  upDisplayed = 0.8,
}) {
  return {
    downAsk: downDisplayed,
    downDisplayed,
    ethChainlink,
    secondBucket: start + second * 1000,
    upAsk: upDisplayed,
    upDisplayed,
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

test("buildEthFinalFlipAnalytics counts ETH flips in final 10s and 5s", () => {
  const nowTs = 2_000_000;
  const start = nowTs - 20 * 60_000;
  const ethDown = market({ asset: "eth", outcome: "down", start });
  const ethUp = market({
    asset: "eth",
    outcome: "up",
    start: start + 5 * 60_000,
  });
  const snapshotsByMarketSlug = new Map([
    [
      ethDown.slug,
      [
        snapshot({ downDisplayed: 0.1, second: 291, start, upDisplayed: 0.86 }),
        snapshot({ downDisplayed: 0.88, second: 298, start, upDisplayed: 0.1 }),
      ],
    ],
    [
      ethUp.slug,
      [
        snapshot({
          downDisplayed: 0.1,
          ethChainlink: 101,
          second: 296,
          start: ethUp.windowStartTs,
          upDisplayed: 0.9,
        }),
      ],
    ],
  ]);
  const dashboard = buildEthFinalFlipAnalytics({
    markets: [ethDown, ethUp],
    nowTs,
    snapshotsByMarketSlug,
  });

  assert.equal(dashboard.summary.ethMarkets, 2);
  assert.equal(dashboard.summary.resolvedEthMarkets, 2);
  assert.equal(dashboard.summary.flip10s, 1);
  assert.equal(dashboard.summary.flip5s, 0);
  assert.equal(dashboard.summary.probabilityFlip10s, 1);
  assert.equal(dashboard.rows[0].slug, ethDown.slug);
  assert.equal(dashboard.rows[0].tenSecond.probabilityFlip.side, "up");
});

test("buildEthFinalFlipAnalytics detects ETH reference flips", () => {
  const nowTs = 2_000_000;
  const start = nowTs - 10 * 60_000;
  const ethDown = market({ asset: "eth", outcome: "down", start });
  const dashboard = buildEthFinalFlipAnalytics({
    markets: [ethDown],
    nowTs,
    snapshotsByMarketSlug: {
      [ethDown.slug]: [
        snapshot({
          downDisplayed: 0.6,
          ethChainlink: 101,
          second: 297,
          start,
          upDisplayed: 0.4,
        }),
      ],
    },
  });

  assert.equal(dashboard.summary.flip10s, 1);
  assert.equal(dashboard.summary.flip5s, 1);
  assert.equal(dashboard.summary.referenceFlip10s, 1);
  assert.equal(dashboard.summary.referenceFlip5s, 1);
  assert.equal(dashboard.rows[0].fiveSecond.referenceFlip.side, "up");
});
