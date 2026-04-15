import test from "node:test";
import assert from "node:assert/strict";

import {
  DISPLAY_RULES,
  SNAPSHOT_PHASES,
  deriveDisplayedPrice,
  getSecondsFromWindowStart,
  getSnapshotPhase,
  normalizeFeedTimestamp,
} from "./snapshot.js";

test("deriveDisplayedPrice uses midpoint when the spread is tight", () => {
  const displayed = deriveDisplayedPrice({
    bid: 0.44,
    ask: 0.46,
    mid: 0.45,
    last: 0.41,
  });

  assert.deepEqual(displayed, {
    price: 0.45,
    rule: DISPLAY_RULES.MIDPOINT,
  });
});

test("deriveDisplayedPrice falls back to last trade when the spread is wide", () => {
  const displayed = deriveDisplayedPrice({
    bid: 0.3,
    ask: 0.5,
    mid: 0.4,
    last: 0.37,
  });

  assert.deepEqual(displayed, {
    price: 0.37,
    rule: DISPLAY_RULES.LAST_TRADE,
  });
});

test("snapshot phase and relative second are derived from the market window", () => {
  const windowStartTs = Date.UTC(2026, 3, 13, 12, 0, 0);
  const windowEndTs = windowStartTs + 5 * 60 * 1000;

  assert.equal(
    getSnapshotPhase(windowStartTs - 1000, windowStartTs, windowEndTs),
    SNAPSHOT_PHASES.PRE,
  );
  assert.equal(
    getSnapshotPhase(windowStartTs + 2000, windowStartTs, windowEndTs),
    SNAPSHOT_PHASES.LIVE,
  );
  assert.equal(
    getSnapshotPhase(windowEndTs, windowStartTs, windowEndTs),
    SNAPSHOT_PHASES.POST,
  );
  assert.equal(getSecondsFromWindowStart(windowStartTs + 2000, windowStartTs), 2);
});

test("normalizeFeedTimestamp supports seconds and milliseconds", () => {
  assert.equal(normalizeFeedTimestamp("1776122834"), 1776122834000);
  assert.equal(normalizeFeedTimestamp(1776122834000), 1776122834000);
  assert.equal(normalizeFeedTimestamp(""), null);
});
