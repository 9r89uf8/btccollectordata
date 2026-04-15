import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MISSING_SUMMARY_GRACE_MS,
  DEFAULT_STALE_ACTIVE_GRACE_MS,
  appendSystemNote,
  shouldFinalizeMissingSummary,
  shouldMarkMarketStaleActive,
} from "./repair.js";

test("appendSystemNote appends once and keeps existing entries stable", () => {
  assert.equal(appendSystemNote(null, "repair_marked"), "repair_marked");
  assert.equal(
    appendSystemNote("existing_note", "repair_marked"),
    "existing_note; repair_marked",
  );
  assert.equal(
    appendSystemNote("existing_note; repair_marked", "repair_marked"),
    "existing_note; repair_marked",
  );
});

test("shouldMarkMarketStaleActive only flags ended active markets past grace", () => {
  const nowTs = 1_000_000;

  assert.equal(
    shouldMarkMarketStaleActive(
      { active: true, windowEndTs: nowTs - DEFAULT_STALE_ACTIVE_GRACE_MS - 1 },
      { nowTs },
    ),
    true,
  );
  assert.equal(
    shouldMarkMarketStaleActive(
      { active: true, windowEndTs: nowTs - DEFAULT_STALE_ACTIVE_GRACE_MS + 1 },
      { nowTs },
    ),
    false,
  );
  assert.equal(
    shouldMarkMarketStaleActive(
      { active: false, windowEndTs: nowTs - DEFAULT_STALE_ACTIVE_GRACE_MS - 1 },
      { nowTs },
    ),
    false,
  );
});

test("shouldFinalizeMissingSummary respects grace and existing summary state", () => {
  const nowTs = 1_000_000;
  const market = {
    slug: "btc-updown-5m-demo",
    windowEndTs: nowTs - DEFAULT_MISSING_SUMMARY_GRACE_MS - 1,
  };

  assert.equal(
    shouldFinalizeMissingSummary(market, { hasSummary: false, nowTs }),
    true,
  );
  assert.equal(
    shouldFinalizeMissingSummary(market, { hasSummary: true, nowTs }),
    false,
  );
  assert.equal(
    shouldFinalizeMissingSummary(
      {
        ...market,
        windowEndTs: nowTs - DEFAULT_MISSING_SUMMARY_GRACE_MS + 1,
      },
      { hasSummary: false, nowTs },
    ),
    false,
  );
});
