import test from "node:test";
import assert from "node:assert/strict";

import { BTC_SOURCES, BTC_SYMBOLS } from "./ingest.js";
import {
  ANALYTICS_VERSION,
  buildMarketAnalytics,
  CHECKPOINT_SECONDS,
  EXCLUDED_REASONS,
} from "./marketAnalytics.js";
import { DATA_QUALITY, MARKET_OUTCOMES } from "./market.js";

const WINDOW_START_TS = 1_000_000;
const WINDOW_END_TS = WINDOW_START_TS + 300_000;

function buildMarket(overrides = {}) {
  return {
    dataQuality: DATA_QUALITY.GOOD,
    marketId: "test-market-id",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-test",
    windowEndTs: WINDOW_END_TS,
    windowStartTs: WINDOW_START_TS,
    ...overrides,
  };
}

function buildSummary(overrides = {}) {
  return {
    dataQuality: DATA_QUALITY.GOOD,
    marketId: "test-market-id",
    marketSlug: "btc-updown-5m-test",
    priceToBeatDerived: 100,
    qualityFlags: [],
    resolvedOutcome: MARKET_OUTCOMES.UP,
    windowEndTs: WINDOW_END_TS,
    windowStartTs: WINDOW_START_TS,
    ...overrides,
  };
}

function buildTick({ price, receivedOffsetMs = null, source = BTC_SOURCES.CHAINLINK, tsOffsetMs }) {
  const ts = WINDOW_START_TS + tsOffsetMs;

  return {
    isSnapshot: false,
    price,
    receivedAt: receivedOffsetMs === null ? ts : WINDOW_START_TS + receivedOffsetMs,
    source,
    symbol:
      source === BTC_SOURCES.CHAINLINK
        ? BTC_SYMBOLS.CHAINLINK_BTC_USD
        : BTC_SYMBOLS.BINANCE_BTC_USDT,
    ts,
  };
}

function buildFreshTicks() {
  return CHECKPOINT_SECONDS.map((checkpointSecond) =>
    buildTick({
      price: 100 + checkpointSecond / 1000,
      tsOffsetMs: checkpointSecond * 1000,
    }),
  );
}

function getCheckpoint(doc, checkpointSecond) {
  return doc.checkpoints.find(
    (checkpoint) => checkpoint.checkpointSecond === checkpointSecond,
  );
}

test("buildMarketAnalytics uses latest tick at or before checkpoint, not interpolation", () => {
  const doc = buildMarketAnalytics({
    btcTicks: [
      buildTick({ price: 99, tsOffsetMs: 20_000 }),
      buildTick({ price: 101, tsOffsetMs: 40_000 }),
      ...CHECKPOINT_SECONDS.filter((second) => second !== 30).map((second) =>
        buildTick({ price: 101, tsOffsetMs: second * 1000 }),
      ),
    ],
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });
  const checkpoint = getCheckpoint(doc, 30);

  assert.equal(checkpoint.btcAtCheckpoint, 99);
  assert.equal(checkpoint.currentLeader, MARKET_OUTCOMES.DOWN);
  assert.equal(checkpoint.didCurrentLeaderWin, false);
});

test("buildMarketAnalytics excludes ticks received after the checkpoint", () => {
  const doc = buildMarketAnalytics({
    btcTicks: [
      buildTick({ price: 101, receivedOffsetMs: 31_000, tsOffsetMs: 30_000 }),
      buildTick({ price: 99, tsOffsetMs: 20_000 }),
      ...CHECKPOINT_SECONDS.filter((second) => second !== 30).map((second) =>
        buildTick({ price: 101, tsOffsetMs: second * 1000 }),
      ),
    ],
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });
  const checkpoint = getCheckpoint(doc, 30);

  assert.equal(checkpoint.btcAtCheckpoint, 99);
  assert.equal(checkpoint.btcTickTs, WINDOW_START_TS + 20_000);
});

test("buildMarketAnalytics writes missing-outcome row when summary is missing", () => {
  const doc = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket({ winningOutcome: null }),
    nowTs: WINDOW_END_TS,
    summary: null,
  });

  assert.equal(doc.analyticsVersion, ANALYTICS_VERSION);
  assert.equal(doc.resolvedOutcome, null);
  assert.equal(doc.outcomeSource, null);
  assert.equal(doc.summaryPresent, false);
  assert.ok(doc.excludedReasons.includes(EXCLUDED_REASONS.MISSING_OUTCOME));
});

test("buildMarketAnalytics includes intermediate path-risk checkpoints", () => {
  const doc = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });
  const checkpointSeconds = doc.checkpoints.map(
    (checkpoint) => checkpoint.checkpointSecond,
  );

  assert.deepEqual(checkpointSeconds, CHECKPOINT_SECONDS);
  assert.ok(checkpointSeconds.includes(200));
  assert.ok(checkpointSeconds.includes(210));
  assert.ok(checkpointSeconds.includes(220));
});

test("buildMarketAnalytics treats market winningOutcome without summary as official", () => {
  const doc = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket({
      priceToBeatDerived: 99,
      priceToBeatOfficial: null,
      winningOutcome: MARKET_OUTCOMES.UP,
    }),
    nowTs: WINDOW_END_TS,
    summary: null,
  });

  assert.equal(doc.resolvedOutcome, MARKET_OUTCOMES.UP);
  assert.equal(doc.outcomeSource, "official");
  assert.equal(doc.priceToBeat, 99);
  assert.equal(doc.priceToBeatSource, "derived");
  assert.equal(doc.summaryPresent, false);
  assert.equal(doc.excludedReasons.includes(EXCLUDED_REASONS.MISSING_OUTCOME), false);
});

test("buildMarketAnalytics detects official and derived outcome sources", () => {
  const official = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });
  const derived = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary({
      qualityFlags: ["winner_derived_from_references"],
    }),
  });

  assert.equal(official.outcomeSource, "official");
  assert.equal(derived.outcomeSource, "derived");
  assert.ok(derived.excludedReasons.includes(EXCLUDED_REASONS.DERIVED_ONLY_OUTCOME));
});

test("buildMarketAnalytics uses official priceToBeat only when present", () => {
  const official = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket({ priceToBeatOfficial: 101 }),
    nowTs: WINDOW_END_TS,
    summary: buildSummary({ priceToBeatDerived: 100 }),
  });
  const derived = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket({ priceToBeatOfficial: null }),
    nowTs: WINDOW_END_TS,
    summary: buildSummary({ priceToBeatDerived: 100 }),
  });

  assert.equal(official.priceToBeat, 101);
  assert.equal(official.priceToBeatSource, "official");
  assert.equal(derived.priceToBeat, 100);
  assert.equal(derived.priceToBeatSource, "derived");
});

test("buildMarketAnalytics nulls checkpoint features when no prior tick exists", () => {
  const doc = buildMarketAnalytics({
    btcTicks: [buildTick({ price: 101, tsOffsetMs: 31_000 }), ...buildFreshTicks().slice(1)],
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });
  const checkpoint = getCheckpoint(doc, 30);

  assert.equal(checkpoint.btcAtCheckpoint, null);
  assert.equal(checkpoint.distanceToBeatBps, null);
  assert.equal(checkpoint.currentLeader, null);
  assert.equal(checkpoint.didCurrentLeaderWin, null);
  assert.ok(doc.excludedReasons.includes(EXCLUDED_REASONS.MISSING_CHECKPOINT_BTC));
});

test("buildMarketAnalytics marks stale BTC and incomplete fresh checkpoints", () => {
  const doc = buildMarketAnalytics({
    btcTicks: [
      buildTick({ price: 101, tsOffsetMs: 30_000 }),
      buildTick({ price: 102, tsOffsetMs: 120_000 }),
      buildTick({ price: 103, tsOffsetMs: 180_000 }),
      buildTick({ price: 104, tsOffsetMs: 240_000 }),
      buildTick({ price: 105, tsOffsetMs: 270_000 }),
      buildTick({ price: 106, tsOffsetMs: 285_000 }),
      buildTick({ price: 107, tsOffsetMs: 295_000 }),
    ],
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });
  const checkpoint = getCheckpoint(doc, 90);

  assert.equal(checkpoint.btcAtCheckpoint, 101);
  assert.equal(checkpoint.btcTickAgeMs, 60_000);
  assert.equal(doc.completeFreshCheckpoints, false);
  assert.ok(doc.excludedReasons.includes(EXCLUDED_REASONS.STALE_BTC));
});

test("buildMarketAnalytics has no excluded reasons for a clean market", () => {
  const doc = buildMarketAnalytics({
    btcTicks: buildFreshTicks(),
    market: buildMarket(),
    nowTs: WINDOW_END_TS,
    summary: buildSummary(),
  });

  assert.equal(doc.completeFreshCheckpoints, true);
  assert.deepEqual(doc.excludedReasons, []);
});
