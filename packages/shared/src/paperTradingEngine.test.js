import test from "node:test";
import assert from "node:assert/strict";

import {
  computeRiskFlags,
  maybeCreatePaperDecision,
  settlePaperTrade,
  signedDistanceBps,
} from "./paperTradingEngine.js";

const WINDOW_START_TS = 1_000_000;
const WINDOW_END_TS = WINDOW_START_TS + 300_000;

function priceForBps(bps) {
  return 100 * (1 + bps / 10000);
}

function market(overrides = {}) {
  return {
    marketId: "test-market-id",
    priceToBeatOfficial: 100,
    slug: "btc-updown-5m-paper",
    windowEndTs: WINDOW_END_TS,
    windowStartTs: WINDOW_START_TS,
    ...overrides,
  };
}

function snapshot(second, marginBps, overrides = {}) {
  return {
    btcChainlink: priceForBps(marginBps),
    downDisplayed: 0.42,
    downSpread: 0.03,
    marketId: "test-market-id",
    marketSlug: "btc-updown-5m-paper",
    secondBucket: WINDOW_START_TS + second * 1000,
    secondsFromWindowStart: second,
    upDisplayed: 0.58,
    upSpread: 0.02,
    ...overrides,
  };
}

function snapshotsThrough(second, readMargin) {
  const rows = [];

  for (let index = 0; index <= second; index += 1) {
    rows.push(snapshot(index, readMargin(index)));
  }

  return rows;
}

test("signedDistanceBps returns signed bps from the reference line", () => {
  assert.ok(Math.abs(signedDistanceBps(100.05, 100) - 5) < 1e-9);
  assert.ok(Math.abs(signedDistanceBps(99.95, 100) + 5) < 1e-9);
  assert.equal(signedDistanceBps(null, 100), null);
});

test("maybeCreatePaperDecision waits until the decision window", () => {
  const nowTs = WINDOW_START_TS + 219_000;
  const decision = maybeCreatePaperDecision({
    market: market(),
    nowTs,
    snapshots: snapshotsThrough(219, () => 8),
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "before_decision_window");
});

test("maybeCreatePaperDecision creates a clean leader-distance trade", () => {
  const nowTs = WINDOW_START_TS + 220_000;
  const decision = maybeCreatePaperDecision({
    market: market(),
    nowTs,
    runId: "test-run",
    snapshots: snapshotsThrough(220, () => 5),
  });

  assert.equal(decision.action, "paper_trade");
  assert.equal(decision.trade.side, "up");
  assert.equal(decision.trade.entrySecond, 220);
  assert.equal(decision.trade.requiredDistanceBps, 5);
  assert.equal(decision.trade.riskCount, 0);
  assert.equal(decision.trade.entryMarketPrice, 0.58);
  assert.equal(decision.trade.runId, "test-run");
});

test("nearLineHeavy uses the shared 2 bps pre-path definition", () => {
  const nowTs = WINDOW_START_TS + 220_000;
  const decision = maybeCreatePaperDecision({
    market: market(),
    nowTs,
    snapshots: snapshotsThrough(220, (second) => (second < 120 ? 1.5 : 8)),
  });

  assert.equal(decision.action, "paper_trade");
  assert.equal(decision.trade.riskFlags.nearLineHeavy, true);
  assert.equal(decision.trade.riskCount, 1);
  assert.equal(decision.trade.requiredDistanceBps, 7.5);
  assert.ok(decision.trade.pathFeatures.preNearLineSeconds >= 100);
});

test("maybeCreatePaperDecision skips paths with two V0 risk flags", () => {
  const nowTs = WINDOW_START_TS + 220_000;
  const decision = maybeCreatePaperDecision({
    market: market(),
    nowTs,
    snapshots: snapshotsThrough(220, (second) => {
      if (second < 120) {
        return 1.5;
      }

      return second < 205 ? -4 : 8;
    }),
  });

  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "too_many_risk_flags");
  assert.equal(decision.diagnostics.riskFlags.nearLineHeavy, true);
  assert.equal(decision.diagnostics.riskFlags.recentLock, true);
});

test("computeRiskFlags applies V0 dashboard risk definitions", () => {
  const flags = computeRiskFlags(
    {
      preCrossCountLast60s: 2,
      preCurrentLeadAgeSeconds: 29,
      preFlipCount: 0,
      preLastFlipAgeSeconds: null,
      preNearLineSeconds: 55,
    },
    220,
  );

  assert.deepEqual(flags, {
    multiFlipChop: true,
    nearLineHeavy: true,
    recentLock: true,
  });
});

test("settlePaperTrade settles idempotent PnL fields from official outcome", () => {
  const decision = maybeCreatePaperDecision({
    market: market(),
    nowTs: WINDOW_START_TS + 220_000,
    snapshots: snapshotsThrough(220, () => 8),
    stakeUsd: 5,
  });
  const settlement = settlePaperTrade({
    market: market({
      closeReferencePriceOfficial: 100.1,
      winningOutcome: "up",
    }),
    nowTs: WINDOW_END_TS + 1_000,
    trade: decision.trade,
  });

  assert.equal(settlement.action, "settle");
  assert.equal(settlement.result.actualWinner, "up");
  assert.equal(settlement.result.correct, true);
  assert.equal(settlement.result.resultSource, "official");
  assert.equal(settlement.result.shares, 5 / 0.58);
  assert.equal(settlement.result.pnlUsd, 5 / 0.58 - 5);
});
