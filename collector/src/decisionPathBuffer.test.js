import assert from "node:assert/strict";
import test from "node:test";

import { createDecisionPathBufferStore } from "./decisionPathBuffer.js";

const WINDOW_START = 1_800_000_000_000;
const MARKET = {
  marketId: "market-1",
  slug: "btc-updown-5m-test",
  windowEndTs: WINDOW_START + 300_000,
  windowStartTs: WINDOW_START,
};
const OTHER_MARKET = {
  marketId: "market-2",
  slug: "btc-updown-5m-other",
  windowEndTs: WINDOW_START + 300_000,
  windowStartTs: WINDOW_START,
};

function snapshot(overrides = {}) {
  return {
    btcChainlink: 100,
    marketSlug: MARKET.slug,
    secondBucket: WINDOW_START,
    secondsFromWindowStart: 0,
    sourceQuality: "good",
    ts: WINDOW_START,
    ...overrides,
  };
}

test("decision path buffer stores compact per-market rows and returns copies", () => {
  const buffer = createDecisionPathBufferStore();

  buffer.syncActiveMarkets([MARKET]);
  assert.equal(buffer.pushSnapshot(snapshot()), true);

  const path = buffer.getRecentPath(MARKET.slug);

  assert.deepEqual(path, [
    {
      btcChainlink: 100,
      secondBucket: WINDOW_START,
      secondsFromWindowStart: 0,
      sourceQuality: "good",
      ts: WINDOW_START,
    },
  ]);

  path[0].btcChainlink = 200;
  assert.equal(buffer.getRecentPath(MARKET.slug)[0].btcChainlink, 100);
});

test("decision path buffer replaces duplicate buckets with the newest snapshot", () => {
  const buffer = createDecisionPathBufferStore();

  buffer.syncActiveMarkets([MARKET]);
  buffer.pushSnapshot(snapshot({ btcChainlink: 100, ts: WINDOW_START + 10 }));
  buffer.pushSnapshot(snapshot({ btcChainlink: 101, ts: WINDOW_START + 20 }));
  buffer.pushSnapshot(snapshot({ btcChainlink: 99, ts: WINDOW_START + 5 }));

  const path = buffer.getRecentPath(MARKET.slug);

  assert.equal(path.length, 1);
  assert.equal(path[0].btcChainlink, 101);
  assert.equal(path[0].ts, WINDOW_START + 20);
});

test("decision path buffer does not cross-contaminate markets", () => {
  const buffer = createDecisionPathBufferStore();

  buffer.syncActiveMarkets([MARKET, OTHER_MARKET]);
  buffer.pushSnapshots([
    snapshot({ btcChainlink: 100, marketSlug: MARKET.slug }),
    snapshot({ btcChainlink: 200, marketSlug: OTHER_MARKET.slug }),
  ]);

  assert.deepEqual(
    buffer.getRecentPath(MARKET.slug).map((row) => row.btcChainlink),
    [100],
  );
  assert.deepEqual(
    buffer.getRecentPath(OTHER_MARKET.slug).map((row) => row.btcChainlink),
    [200],
  );
});

test("decision path buffer rejects snapshots for unsynced markets", () => {
  const buffer = createDecisionPathBufferStore();

  assert.equal(buffer.pushSnapshot(snapshot()), false);
  assert.equal(buffer.rowCount(), 0);

  buffer.syncActiveMarkets([MARKET]);

  assert.equal(buffer.pushSnapshot(snapshot()), true);
  assert.equal(buffer.rowCount(), 1);
});

test("decision path buffer keeps the active window plus grace", () => {
  const buffer = createDecisionPathBufferStore({ graceMs: 10_000 });

  buffer.syncActiveMarkets([MARKET]);
  buffer.pushSnapshots([
    snapshot({
      secondBucket: WINDOW_START - 1000,
      secondsFromWindowStart: -1,
    }),
    snapshot(),
    snapshot({
      secondBucket: MARKET.windowEndTs + 10_000,
      secondsFromWindowStart: 310,
    }),
    snapshot({
      secondBucket: MARKET.windowEndTs + 11_000,
      secondsFromWindowStart: 311,
    }),
  ]);

  assert.deepEqual(
    buffer.getRecentPath(MARKET.slug).map((row) => row.secondBucket),
    [WINDOW_START, MARKET.windowEndTs + 10_000],
  );
});

test("decision path buffer clears removed active markets", () => {
  const buffer = createDecisionPathBufferStore();

  buffer.syncActiveMarkets([MARKET]);
  buffer.pushSnapshot(snapshot());
  assert.equal(buffer.marketCount(), 1);

  buffer.syncActiveMarkets([]);

  assert.equal(buffer.marketCount(), 0);
  assert.deepEqual(buffer.getRecentPath(MARKET.slug), []);
});
