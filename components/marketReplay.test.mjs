import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplayTimeline,
  findLatestReplayIssue,
  getQualityBreakdown,
  getReplayCoverage,
} from "./marketReplay.mjs";

const market = {
  marketId: "test-market",
  slug: "btc-updown-5m-test",
  windowEndTs: 1776125100000,
  windowStartTs: 1776124800000,
};

test("buildReplayTimeline inserts explicit missing rows between observed seconds", () => {
  const { cadenceMs, timeline } = buildReplayTimeline(market, [
    {
      _id: "a",
      secondBucket: 1776124800000,
      secondsFromWindowStart: 0,
      sourceQuality: "good",
    },
    {
      _id: "b",
      secondBucket: 1776124801000,
      secondsFromWindowStart: 1,
      sourceQuality: "good",
    },
    {
      _id: "c",
      secondBucket: 1776124803000,
      secondsFromWindowStart: 3,
      sourceQuality: "stale_book",
    },
  ]);

  assert.equal(cadenceMs, 1000);
  assert.equal(timeline.length, 4);
  assert.equal(timeline[2].missing, true);
  assert.equal(timeline[2].sourceQuality, "missing");
  assert.equal(timeline[2].secondsFromWindowStart, 2);
});

test("buildReplayTimeline respects sparse five-second sampling without inventing one-second gaps", () => {
  const { cadenceMs, timeline } = buildReplayTimeline(market, [
    {
      _id: "a",
      secondBucket: 1776124800000,
      secondsFromWindowStart: 0,
      sourceQuality: "good",
    },
    {
      _id: "b",
      secondBucket: 1776124805000,
      secondsFromWindowStart: 5,
      sourceQuality: "good",
    },
    {
      _id: "d",
      secondBucket: 1776124815000,
      secondsFromWindowStart: 15,
      sourceQuality: "gap",
    },
  ]);

  assert.equal(cadenceMs, 5000);
  assert.equal(timeline.length, 4);
  assert.equal(timeline[1].missing, false);
  assert.equal(timeline[2].missing, true);
  assert.equal(timeline[2].secondsFromWindowStart, 10);
});

test("buildReplayTimeline prefers recent five-second cadence over older one-second history", () => {
  const { cadenceMs, timeline } = buildReplayTimeline(market, [
    {
      _id: "old-a",
      secondBucket: 1776124800000,
      secondsFromWindowStart: 0,
      sourceQuality: "good",
    },
    {
      _id: "old-b",
      secondBucket: 1776124801000,
      secondsFromWindowStart: 1,
      sourceQuality: "good",
    },
    {
      _id: "recent-a",
      secondBucket: 1776124810000,
      secondsFromWindowStart: 10,
      sourceQuality: "good",
    },
    {
      _id: "recent-b",
      secondBucket: 1776124815000,
      secondsFromWindowStart: 15,
      sourceQuality: "good",
    },
    {
      _id: "recent-c",
      secondBucket: 1776124820000,
      secondsFromWindowStart: 20,
      sourceQuality: "good",
    },
  ]);

  assert.equal(cadenceMs, 5000);
  assert.equal(timeline.some((entry) => entry.secondsFromWindowStart === 11), false);
});

test("replay helpers summarize coverage and latest issue", () => {
  const { timeline } = buildReplayTimeline(market, [
    {
      _id: "a",
      secondBucket: 1776124800000,
      secondsFromWindowStart: 0,
      sourceQuality: "good",
    },
    {
      _id: "b",
      secondBucket: 1776124801000,
      secondsFromWindowStart: 1,
      sourceQuality: "gap",
    },
    {
      _id: "d",
      secondBucket: 1776124803000,
      secondsFromWindowStart: 3,
      sourceQuality: "good",
    },
  ]);

  const coverage = getReplayCoverage(timeline);
  const breakdown = getQualityBreakdown(timeline);
  const latestIssue = findLatestReplayIssue(timeline);

  assert.equal(coverage.loadedSeconds, 4);
  assert.equal(coverage.observedCount, 3);
  assert.equal(coverage.missingCount, 1);
  assert.equal(breakdown.gap, 1);
  assert.equal(breakdown.missing, 1);
  assert.equal(latestIssue.missing, true);
  assert.equal(latestIssue.secondsFromWindowStart, 2);
});
