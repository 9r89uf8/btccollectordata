import test from "node:test";
import assert from "node:assert/strict";

import { DATA_QUALITY, MARKET_OUTCOMES } from "./market.js";
import { buildMarketSummary } from "./summary.js";

function buildSnapshot({
  btcBinance = null,
  btcChainlink = null,
  phase = "live",
  second,
  sourceQuality = "good",
  upDisplayed,
}) {
  return {
    _id: `snapshot-${second}-${phase}`,
    btcBinance,
    btcChainlink,
    downDisplayed: upDisplayed == null ? null : 1 - upDisplayed,
    marketId: "test-market",
    marketSlug: "btc-updown-5m-test",
    phase,
    secondBucket: second * 1000,
    secondsFromWindowStart: second,
    sourceQuality,
    ts: second * 1000,
    upDisplayed,
  };
}

test("buildMarketSummary computes checkpoint stats and good quality from complete data", () => {
  const market = {
    closeReferencePriceOfficial: 102,
    marketId: "test-market",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100, phase: "live", second: 0, upDisplayed: 0.4 }),
    buildSnapshot({ btcChainlink: 100.5, phase: "live", second: 1, upDisplayed: 0.5 }),
    buildSnapshot({ btcChainlink: 101, phase: "live", second: 2, upDisplayed: 0.6 }),
    buildSnapshot({ btcChainlink: 101.5, phase: "live", second: 3, upDisplayed: 0.7 }),
    buildSnapshot({ btcChainlink: 102, phase: "post", second: 5, upDisplayed: 0.8 }),
    buildSnapshot({ btcChainlink: 101.8, phase: "live", second: 4, upDisplayed: 0.55 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 10_000, snapshots });

  assert.equal(result.dataQuality, DATA_QUALITY.GOOD);
  assert.equal(result.summary.resolvedOutcome, MARKET_OUTCOMES.UP);
  assert.equal(result.summary.upDisplayedAtT0, 0.4);
  assert.equal(result.summary.downDisplayedAtT0, 0.6);
  assert.equal(result.summary.upDisplayedAtT15, null);
  assert.equal(result.summary.btcChainlinkAtStart, 100);
  assert.equal(result.summary.btcChainlinkAtEnd, 102);
  assert.equal(result.summary.dataQuality, DATA_QUALITY.GOOD);
  assert.equal(result.summary.upMax, 0.7);
  assert.equal(result.summary.upMin, 0.4);
  assert.equal(result.summary.upRange, 0.29999999999999993);
  assert.equal(result.summary.firstTimeAbove60, 2);
  assert.equal(result.summary.firstTimeAbove70, 3);
  assert.equal(result.summary.firstTimeAbove80, null);
  assert.equal(result.summary.firstBtcWinningSideSecond, 0);
  assert.equal(result.summary.firstBtcWinningSideAt10UsdSecond, null);
  assert.equal(result.summary.firstBtcWinningSideAt20UsdSecond, null);
  assert.equal(result.summary.firstBtcWinningSideAt30UsdSecond, null);
  assert.deepEqual(result.qualityFlags, ["sample_cadence_ms:1000"]);
});

test("buildMarketSummary uses nearest checkpoint snapshots within one second", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: null,
    slug: "btc-updown-5m-test",
    windowEndTs: 20_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100, phase: "live", second: 0, upDisplayed: 0.4 }),
    buildSnapshot({ btcChainlink: 100.1, phase: "live", second: 14, upDisplayed: 0.62 }),
    buildSnapshot({ btcChainlink: 100.2, phase: "live", second: 16, upDisplayed: 0.58 }),
    buildSnapshot({ btcChainlink: 100.3, phase: "post", second: 20, upDisplayed: 0.55 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 25_000, snapshots });

  assert.equal(result.summary.upDisplayedAtT15, 0.62);
});

test("buildMarketSummary treats complete five-second sampling as complete data, not gaps", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: null,
    slug: "btc-updown-5m-test",
    windowEndTs: 20_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100, phase: "live", second: 0, upDisplayed: 0.4 }),
    buildSnapshot({ btcChainlink: 100.2, phase: "live", second: 5, upDisplayed: 0.45 }),
    buildSnapshot({ btcChainlink: 100.4, phase: "live", second: 10, upDisplayed: 0.55 }),
    buildSnapshot({ btcChainlink: 100.5, phase: "live", second: 15, upDisplayed: 0.62 }),
    buildSnapshot({ btcChainlink: 100.7, phase: "post", second: 20, upDisplayed: 0.6 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 25_000, snapshots });

  assert.equal(result.dataQuality, DATA_QUALITY.GOOD);
  assert.equal(result.meta.sampleCadenceMs, 5000);
  assert.equal(result.meta.expectedLiveBuckets, 4);
  assert.equal(result.meta.missingLiveBuckets, 0);
  assert.equal(result.summary.upDisplayedAtT15, 0.62);
  assert.ok(result.qualityFlags.includes("sample_cadence_ms:5000"));
  assert.equal(
    result.qualityFlags.some((flag) => flag.startsWith("missing_live_buckets:")),
    false,
  );
});

test("buildMarketSummary prefers explicit boundary references over snapshot btc values", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: null,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: null,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100, phase: "live", second: 0, upDisplayed: 0.4 }),
    buildSnapshot({ btcChainlink: 101, phase: "live", second: 1, upDisplayed: 0.5 }),
    buildSnapshot({ btcChainlink: 102, phase: "post", second: 5, upDisplayed: 0.6 }),
  ];

  const result = buildMarketSummary({
    boundaryReferences: {
      start: {
        chainlinkPrice: 105,
        source: "tick",
        ts: -200,
      },
      end: {
        chainlinkPrice: 99,
        source: "tick",
        ts: 5_200,
      },
    },
    market,
    nowTs: 10_000,
    snapshots,
  });

  assert.equal(result.summary.priceToBeatDerived, 105);
  assert.equal(result.summary.closeReferencePriceDerived, 99);
  assert.equal(result.summary.btcChainlinkAtStart, 105);
  assert.equal(result.summary.btcChainlinkAtEnd, 99);
  assert.equal(result.summary.resolvedOutcome, MARKET_OUTCOMES.DOWN);
});

test("buildMarketSummary falls back to derived outcome and marks gap data correctly", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: null,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: null,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100, phase: "pre", second: -1, upDisplayed: 0.4 }),
    buildSnapshot({ btcChainlink: 100.2, phase: "live", second: 0, upDisplayed: 0.45 }),
    buildSnapshot({
      btcChainlink: 100.4,
      phase: "live",
      second: 2,
      sourceQuality: "stale_book",
      upDisplayed: 0.6,
    }),
  ];

  const result = buildMarketSummary({ market, nowTs: 10_000, snapshots });

  assert.equal(result.dataQuality, DATA_QUALITY.GAP);
  assert.equal(result.summary.resolvedOutcome, MARKET_OUTCOMES.UP);
  assert.equal(result.summary.btcChainlinkAtStart, 100.2);
  assert.equal(result.summary.btcChainlinkAtEnd, 100.4);
  assert.equal(result.summary.downDisplayedAtT0, 0.55);
  assert.equal(result.summary.dataQuality, DATA_QUALITY.GAP);
  assert.ok(result.qualityFlags.includes("winner_derived_from_references"));
  assert.ok(result.qualityFlags.includes("end_reference_from_live"));
  assert.ok(result.qualityFlags.includes("sample_cadence_ms:2000"));
  assert.ok(result.qualityFlags.includes("missing_live_buckets:1"));
  assert.ok(result.qualityFlags.includes("stale_book_buckets:1"));
});

test("buildMarketSummary records the first winning-side bucket even if BTC later crosses back", () => {
  const market = {
    closeReferencePriceOfficial: 101,
    marketId: "test-market",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-test",
    windowEndTs: 300_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 99.8, phase: "live", second: 0, upDisplayed: 0.4 }),
    buildSnapshot({ btcChainlink: 100.2, phase: "live", second: 30, upDisplayed: 0.56 }),
    buildSnapshot({ btcChainlink: 100.6, phase: "live", second: 60, upDisplayed: 0.64 }),
    buildSnapshot({ btcChainlink: 99.9, phase: "live", second: 200, upDisplayed: 0.48 }),
    buildSnapshot({ btcChainlink: 100.4, phase: "live", second: 240, upDisplayed: 0.58 }),
    buildSnapshot({ btcChainlink: 101, phase: "post", second: 300, upDisplayed: 0.61 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 310_000, snapshots });

  assert.equal(result.summary.firstBtcWinningSideSecond, 30);
});

test("buildMarketSummary still records the first winning-side bucket when the close path conflicts with the resolved outcome", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100.2, phase: "live", second: 0, upDisplayed: 0.52 }),
    buildSnapshot({ btcChainlink: 100.4, phase: "live", second: 1, upDisplayed: 0.57 }),
    buildSnapshot({ btcChainlink: 99, phase: "post", second: 5, upDisplayed: 0.35 }),
  ];

  const result = buildMarketSummary({
    boundaryReferences: {
      end: {
        chainlinkPrice: 99,
        source: "tick",
        ts: 5_100,
      },
      start: {
        chainlinkPrice: 100.5,
        source: "tick",
        ts: -100,
      },
    },
    market,
    nowTs: 10_000,
    snapshots,
  });

  assert.equal(result.summary.firstBtcWinningSideSecond, 0);
  assert.ok(result.qualityFlags.includes("btc_path_conflicts_resolved"));
});

test("buildMarketSummary flags missing anchors when secure timing cannot be anchored", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: null,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: null, phase: "live", second: 0, upDisplayed: 0.5 }),
    buildSnapshot({ btcChainlink: null, phase: "live", second: 1, upDisplayed: 0.55 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 10_000, snapshots });

  assert.equal(result.summary.firstBtcWinningSideSecond, null);
  assert.ok(result.qualityFlags.includes("btc_winning_side_missing_anchor"));
  assert.ok(result.qualityFlags.includes("btc_winning_side_no_btc_data"));
});

test("buildMarketSummary flags missing live BTC data when the anchor exists", () => {
  const market = {
    closeReferencePriceOfficial: 101,
    marketId: "test-market",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: null, phase: "live", second: 0, upDisplayed: 0.48 }),
    buildSnapshot({ btcChainlink: null, phase: "live", second: 1, upDisplayed: 0.52 }),
    buildSnapshot({ btcChainlink: 101, phase: "post", second: 5, upDisplayed: 0.58 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 10_000, snapshots });

  assert.equal(result.summary.firstBtcWinningSideSecond, null);
  assert.ok(result.qualityFlags.includes("btc_winning_side_no_btc_data"));
  assert.equal(result.qualityFlags.includes("btc_winning_side_missing_anchor"), false);
});

test("buildMarketSummary uses the official anchor when finding the first winning-side bucket", () => {
  const market = {
    closeReferencePriceOfficial: null,
    marketId: "test-market",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-test",
    windowEndTs: 5_000,
    windowStartTs: 0,
    winningOutcome: null,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 100.4, phase: "live", second: 0, upDisplayed: 0.54 }),
    buildSnapshot({ btcChainlink: 99.9, phase: "live", second: 4, upDisplayed: 0.46 }),
    buildSnapshot({ btcChainlink: 100.3, phase: "post", second: 5, upDisplayed: 0.51 }),
  ];

  const result = buildMarketSummary({
    boundaryReferences: {
      end: {
        chainlinkPrice: 100.3,
        source: "tick",
        ts: 5_100,
      },
      start: {
        chainlinkPrice: 100.5,
        source: "tick",
        ts: -100,
      },
    },
    market,
    nowTs: 10_000,
    snapshots,
  });

  assert.equal(result.summary.resolvedOutcome, MARKET_OUTCOMES.DOWN);
  assert.equal(result.summary.firstBtcWinningSideSecond, 4);
});

test("buildMarketSummary tracks first winning-side buckets by $10, $20, and $30 distance", () => {
  const market = {
    closeReferencePriceOfficial: 75_540,
    marketId: "test-market",
    priceToBeatOfficial: 75_500,
    slug: "btc-updown-5m-test",
    windowEndTs: 300_000,
    windowStartTs: 0,
    winningOutcome: MARKET_OUTCOMES.UP,
  };
  const snapshots = [
    buildSnapshot({ btcChainlink: 75_505, phase: "live", second: 5, upDisplayed: 0.51 }),
    buildSnapshot({ btcChainlink: 75_512, phase: "live", second: 10, upDisplayed: 0.54 }),
    buildSnapshot({ btcChainlink: 75_523, phase: "live", second: 20, upDisplayed: 0.58 }),
    buildSnapshot({ btcChainlink: 75_531, phase: "live", second: 35, upDisplayed: 0.61 }),
    buildSnapshot({ btcChainlink: 75_540, phase: "post", second: 300, upDisplayed: 0.65 }),
  ];

  const result = buildMarketSummary({ market, nowTs: 310_000, snapshots });

  assert.equal(result.summary.firstBtcWinningSideSecond, 5);
  assert.equal(result.summary.firstBtcWinningSideAt10UsdSecond, 10);
  assert.equal(result.summary.firstBtcWinningSideAt20UsdSecond, 20);
  assert.equal(result.summary.firstBtcWinningSideAt30UsdSecond, 35);
});
