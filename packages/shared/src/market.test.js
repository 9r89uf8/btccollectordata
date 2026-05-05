import test from "node:test";
import assert from "node:assert/strict";

import {
  BTC_FIVE_MINUTE_WINDOW_MS,
  ET_TIME_ZONE,
  deriveBtcFiveMinuteWindow,
  matchesCryptoFiveMinuteFamily,
  extractOutcomeTokenMap,
  matchesBtcFiveMinuteFamily,
  parseCryptoFiveMinuteWindowFromSlug,
  parseBtcFiveMinuteWindow,
  parseBtcFiveMinuteWindowFromSlug,
} from "./market.js";
import {
  SNAPSHOT_FINALIZATION_GRACE_MS,
  getSnapshotSecondBucket,
  getSnapshotWritePolicy,
} from "./snapshot.js";

test("parseBtcFiveMinuteWindow parses ET window with reference year hint", () => {
  const parsed = parseBtcFiveMinuteWindow(
    "Bitcoin Up or Down - April 12, 10:05PM-10:10PM ET",
    { referenceTs: Date.parse("2026-04-13T02:10:00Z") },
  );

  assert.ok(parsed);
  assert.equal(parsed.timezone, ET_TIME_ZONE);
  assert.equal(parsed.windowStartTs, Date.parse("2026-04-13T02:05:00Z"));
  assert.equal(parsed.windowEndTs, Date.parse("2026-04-13T02:10:00Z"));
});

test("parseBtcFiveMinuteWindow handles midnight rollover", () => {
  const parsed = parseBtcFiveMinuteWindow(
    "Bitcoin Up or Down - December 31, 2025, 11:55PM-12:00AM ET",
  );

  assert.ok(parsed);
  assert.equal(parsed.windowStartTs, Date.parse("2026-01-01T04:55:00Z"));
  assert.equal(parsed.windowEndTs, Date.parse("2026-01-01T05:00:00Z"));
});

test("parseBtcFiveMinuteWindow rejects ambiguous strings without a year hint", () => {
  const parsed = parseBtcFiveMinuteWindow(
    "Bitcoin Up or Down - April 12, 10:05PM-10:10PM ET",
  );

  assert.equal(parsed, null);
});

test("parseBtcFiveMinuteWindow accepts shorthand end meridiem forms", () => {
  const parsed = parseBtcFiveMinuteWindow(
    "Bitcoin Up or Down - December 20, 2025, 1:55-2PM ET",
  );

  assert.ok(parsed);
  assert.equal(parsed.windowEndTs - parsed.windowStartTs, BTC_FIVE_MINUTE_WINDOW_MS);
});

test("parseBtcFiveMinuteWindowFromSlug derives exact UTC window", () => {
  const parsed = parseBtcFiveMinuteWindowFromSlug("btc-updown-5m-1776045900");

  assert.deepEqual(parsed, {
    windowStartTs: 1776045900 * 1000,
    windowEndTs: 1776045900 * 1000 + BTC_FIVE_MINUTE_WINDOW_MS,
    timezone: ET_TIME_ZONE,
    source: "slug",
  });
});

test("parseCryptoFiveMinuteWindowFromSlug derives ETH windows", () => {
  const parsed = parseCryptoFiveMinuteWindowFromSlug("eth-updown-5m-1776045900");

  assert.deepEqual(parsed, {
    asset: "eth",
    windowStartTs: 1776045900 * 1000,
    windowEndTs: 1776045900 * 1000 + BTC_FIVE_MINUTE_WINDOW_MS,
    timezone: ET_TIME_ZONE,
    source: "slug",
  });
});

test("deriveBtcFiveMinuteWindow falls back to slug when needed", () => {
  const parsed = deriveBtcFiveMinuteWindow({
    slug: "btc-updown-5m-1776045900",
    title: "not parseable",
  });

  assert.ok(parsed);
  assert.equal(parsed.source, "slug");
});

test("extractOutcomeTokenMap maps Up and Down token ids explicitly", () => {
  const extracted = extractOutcomeTokenMap({
    outcomes: "[\"Up\", \"Down\"]",
    clobTokenIds: "[\"token-up\", \"token-down\"]",
  });

  assert.deepEqual(extracted, {
    outcomeLabels: {
      upLabel: "Up",
      downLabel: "Down",
    },
    tokenIdsByOutcome: {
      up: "token-up",
      down: "token-down",
    },
  });
});

test("matchesBtcFiveMinuteFamily accepts real BTC 5m-like event shape", () => {
  const result = matchesBtcFiveMinuteFamily({
    event: {
      slug: "btc-updown-5m-1776045900",
      title: "Bitcoin Up or Down - April 12, 10:05PM-10:10PM ET",
      resolutionSource: "https://data.chain.link/streams/btc-usd",
      endDate: "2026-04-13T02:10:00Z",
    },
    market: {
      slug: "btc-updown-5m-1776045900",
      question: "Bitcoin Up or Down - April 12, 10:05PM-10:10PM ET",
      resolutionSource: "https://data.chain.link/streams/btc-usd",
      eventStartTime: "2026-04-13T02:05:00Z",
    },
  });

  assert.equal(result.matches, true);
  assert.equal(result.matchReason, "slug");
  assert.equal(result.parsedWindow.windowStartTs, Date.parse("2026-04-13T02:05:00Z"));
});

test("matchesCryptoFiveMinuteFamily accepts ETH 5m event shape", () => {
  const result = matchesCryptoFiveMinuteFamily({
    event: {
      slug: "eth-updown-5m-1776045900",
      title: "Ethereum Up or Down - April 12, 10:05PM-10:10PM ET",
      resolutionSource: "https://data.chain.link/streams/eth-usd",
      endDate: "2026-04-13T02:10:00Z",
    },
    market: {
      slug: "eth-updown-5m-1776045900",
      question: "Ethereum Up or Down - April 12, 10:05PM-10:10PM ET",
      resolutionSource: "https://data.chain.link/streams/eth-usd",
      eventStartTime: "2026-04-13T02:05:00Z",
    },
  });

  assert.equal(result.matches, true);
  assert.equal(result.asset, "eth");
  assert.equal(result.matchReason, "slug");
  assert.equal(result.parsedWindow.windowStartTs, Date.parse("2026-04-13T02:05:00Z"));
});

test("snapshot write policy defines overwrite window and finalization time", () => {
  const ts = 1776151200345;
  const secondBucket = getSnapshotSecondBucket(ts);
  const writePolicyBeforeFinalize = getSnapshotWritePolicy(
    ts,
    secondBucket + SNAPSHOT_FINALIZATION_GRACE_MS - 1,
  );
  const writePolicyAfterFinalize = getSnapshotWritePolicy(
    ts,
    secondBucket + SNAPSHOT_FINALIZATION_GRACE_MS + 1,
  );

  assert.equal(secondBucket, 1776151200000);
  assert.equal(
    writePolicyBeforeFinalize.finalizesAt,
    secondBucket + SNAPSHOT_FINALIZATION_GRACE_MS,
  );
  assert.equal(writePolicyBeforeFinalize.canOverwrite, true);
  assert.equal(writePolicyAfterFinalize.canOverwrite, false);
});
