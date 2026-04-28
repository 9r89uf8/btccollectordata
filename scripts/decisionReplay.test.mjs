import assert from "node:assert/strict";
import test from "node:test";

import {
  DECISION_ACTIONS,
  REASON_CODES,
} from "../packages/shared/src/decisionConfig.js";
import {
  chooseCheckpointSnapshot,
  chooseLatestTickAtOrBefore,
  evaluateMarketReplay,
  marketDayKey,
  selectTrainingRowsForFold,
  summarizeEvaluations,
} from "./decisionReplay.js";

const WINDOW_START = 1_800_000_000_000;

test("marketDayKey uses UTC market window day", () => {
  assert.equal(
    marketDayKey({
      windowEndTs: Date.parse("2026-04-28T00:03:00.000Z"),
      windowStartTs: Date.parse("2026-04-27T23:58:00.000Z"),
    }),
    "2026-04-27",
  );
});

test("selectTrainingRowsForFold excludes the held-out start-day", () => {
  const foldDay = "2026-04-27";
  const analyticsRows = [
    {
      marketSlug: "held-out-a",
      windowStartTs: Date.parse("2026-04-27T00:00:00.000Z"),
    },
    {
      marketSlug: "train-a",
      windowStartTs: Date.parse("2026-04-26T23:59:00.000Z"),
    },
    {
      marketSlug: "train-b",
      windowStartTs: Date.parse("2026-04-28T00:01:00.000Z"),
    },
  ];
  const stabilityRows = [
    {
      marketSlug: "held-out-s",
      windowStartTs: Date.parse("2026-04-27T12:00:00.000Z"),
    },
    {
      marketSlug: "train-s",
      windowStartTs: Date.parse("2026-04-26T12:00:00.000Z"),
    },
  ];
  const training = selectTrainingRowsForFold({
    analyticsRows,
    dayKey: foldDay,
    stabilityRows,
  });
  const smoke = selectTrainingRowsForFold({
    analyticsRows,
    dayKey: foldDay,
    smokeLatestPriors: true,
    stabilityRows,
  });

  assert.deepEqual(
    training.trainAnalytics.map((row) => row.marketSlug),
    ["train-a", "train-b"],
  );
  assert.deepEqual(
    training.trainStability.map((row) => row.marketSlug),
    ["train-s"],
  );
  assert.equal(smoke.trainAnalytics.length, analyticsRows.length);
  assert.equal(smoke.trainStability.length, stabilityRows.length);
});

test("chooseCheckpointSnapshot picks closest snapshot and earlier exact tie", () => {
  const market = {
    windowStartTs: WINDOW_START,
  };
  const earlier = {
    secondBucket: WINDOW_START + 178_000,
    secondsFromWindowStart: 178,
  };
  const later = {
    secondBucket: WINDOW_START + 182_000,
    secondsFromWindowStart: 182,
  };

  assert.equal(
    chooseCheckpointSnapshot({
      checkpointSecond: 180,
      market,
      snapshots: [later, earlier],
      toleranceSec: 3,
    }),
    earlier,
  );
  assert.equal(
    chooseCheckpointSnapshot({
      checkpointSecond: 180,
      market,
      snapshots: [
        {
          secondBucket: WINDOW_START + 184_000,
          secondsFromWindowStart: 184,
        },
      ],
      toleranceSec: 3,
    }),
    null,
  );
});

test("chooseLatestTickAtOrBefore excludes ticks received after evaluation time", () => {
  const tick = chooseLatestTickAtOrBefore(
    [
      {
        price: 100,
        receivedAt: WINDOW_START + 1000,
        ts: WINDOW_START + 1000,
      },
      {
        price: 101,
        receivedAt: WINDOW_START + 5000,
        ts: WINDOW_START + 1500,
      },
      {
        price: 102,
        receivedAt: WINDOW_START + 1900,
        ts: WINDOW_START + 1800,
      },
    ],
    WINDOW_START + 2000,
  );

  assert.equal(tick.price, 102);
});

test("evaluateMarketReplay assembles engine context without post-checkpoint ticks", () => {
  const marketSlug = "btc-updown-5m-replay-test";
  const records = evaluateMarketReplay({
    data: {
      market: {
        priceToBeatOfficial: 100,
        slug: marketSlug,
        windowEndTs: WINDOW_START + 300_000,
        windowStartTs: WINDOW_START,
        winningOutcome: "up",
      },
      snapshots: [
        {
          marketSlug,
          secondBucket: WINDOW_START + 180_000,
          secondsFromWindowStart: 180,
          sourceQuality: "good",
          ts: WINDOW_START + 180_000,
        },
      ],
      ticks: [
        {
          price: 101,
          receivedAt: WINDOW_START + 180_001,
          ts: WINDOW_START + 180_000,
        },
      ],
    },
    priors: {},
  });

  assert.equal(records.length, 5);
  assert.deepEqual(records[0].reasonCodes, [REASON_CODES.MISSING_BTC_TICK]);
  assert.deepEqual(records[1].reasonCodes, [
    REASON_CODES.MISSED_CHECKPOINT_WINDOW_NO_SNAPSHOT,
  ]);
});

test("summarizeEvaluations reports replay counts, calibration, and PnL", () => {
  const summary = summarizeEvaluations(
    [
      {
        action: DECISION_ACTIONS.ENTER_UP,
        checkpointSecond: 180,
        distanceBucket: "5_7_5",
        edge: 0.12,
        evaluatedAt: WINDOW_START + 180_000,
        flags: { momentumAgainst: true },
        grossPnl: 0.3,
        leaderAsk: 0.7,
        pEst: 0.84,
        reasonCodes: [REASON_CODES.ENTER_UP_SIGNAL],
        won: true,
      },
      {
        action: DECISION_ACTIONS.ENTER_DOWN,
        checkpointSecond: 200,
        distanceBucket: "5_7_5",
        edge: 0.1,
        evaluatedAt: WINDOW_START + 200_000,
        flags: {},
        grossPnl: -0.6,
        leaderAsk: 0.6,
        pEst: 0.88,
        reasonCodes: [REASON_CODES.ENTER_DOWN_SIGNAL],
        won: false,
      },
      {
        action: DECISION_ACTIONS.WAIT,
        reasonCodes: [REASON_CODES.NO_OFFICIAL_PRICE_TO_BEAT],
      },
      {
        action: DECISION_ACTIONS.WAIT,
        reasonCodes: [REASON_CODES.BAD_SNAPSHOT_QUALITY_GAP],
      },
    ],
    { costPerEntry: 0.01 },
  );

  assert.equal(summary.totalEvaluations, 4);
  assert.equal(summary.actionCounts.ENTER_UP, 1);
  assert.equal(summary.actionCounts.ENTER_DOWN, 1);
  assert.equal(summary.actionCounts.WAIT, 2);
  assert.equal(summary.winRate, 0.5);
  assert.equal(summary.missedNoOfficial, 1);
  assert.equal(summary.missedStaleGapSnapshots, 1);
  assert.equal(summary.grossPnl, -0.3);
  assert.equal(summary.netPnl, -0.32);
  assert.equal(summary.maxLosingStreak, 1);
  assert.equal(summary.calibration.length, 2);
  assert.equal(summary.riskFlags[0].key, "momentumAgainst");
});
