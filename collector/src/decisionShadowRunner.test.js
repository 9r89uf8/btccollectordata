import assert from "node:assert/strict";
import test from "node:test";

import { DECISION_CONFIG } from "../../packages/shared/src/decisionConfig.js";
import { createDecisionPathBufferStore } from "./decisionPathBuffer.js";
import { createDecisionShadowRunner } from "./decisionShadowRunner.js";

const WINDOW_START = 1_800_000_000_000;
const PRICE_TO_BEAT = 100;
const MARKET = {
  marketId: "market-1",
  priceToBeatOfficial: PRICE_TO_BEAT,
  slug: "btc-updown-5m-test",
  windowEndTs: WINDOW_START + 300_000,
  windowStartTs: WINDOW_START,
};
const ENGINE_RUN_ID = "engine-run-test";
const RUNTIME_ON_MUTED = {
  decision_emit_actions: "wait_only",
  decision_engine_enabled: true,
};
const RUNTIME_ON_ALL = {
  decision_emit_actions: "all",
  decision_engine_enabled: true,
};
const RUNTIME_OFF = {
  decision_emit_actions: "wait_only",
  decision_engine_enabled: false,
};
const RANK_THRESHOLDS = {
  highThreshold: 0.613,
  lowThreshold: 0.386,
  nearLineHighThreshold: 0.667,
  oscillationHighThreshold: 0.667,
  referenceValues: {
    nearLinePct: [0, 0.2, 0.4, 0.6, 0.8],
    preFlipRatePerMinute: [0, 0.4, 0.8, 1.2, 1.6],
  },
};

function btcFromMargin(marginBps) {
  return PRICE_TO_BEAT * (1 + marginBps / 10000);
}

function snapshotAt(second, overrides = {}) {
  const ts = WINDOW_START + second * 1000;

  return {
    downAsk: 0.88,
    downBid: 0.72,
    downDepthAskTop: 5,
    downSpread: 0.02,
    marketSlug: MARKET.slug,
    secondBucket: ts,
    secondsFromWindowStart: second,
    sourceQuality: "good",
    ts,
    upAsk: 0.78,
    upBid: 0.72,
    upDepthAskTop: 5,
    upSpread: 0.02,
    writtenAt: ts,
    ...overrides,
  };
}

function buildPathBuffer() {
  const pathBuffer = createDecisionPathBufferStore();

  pathBuffer.syncActiveMarkets([MARKET]);
  pathBuffer.pushSnapshots(
    Array.from({ length: 37 }, (_, index) => {
      const second = index * 5;

      return {
        btcChainlink: btcFromMargin(6),
        marketSlug: MARKET.slug,
        secondBucket: WINDOW_START + second * 1000,
        secondsFromWindowStart: second,
        sourceQuality: "good",
        ts: WINDOW_START + second * 1000,
      };
    }),
  );

  return pathBuffer;
}

function priors(overrides = {}) {
  const distanceBucket = overrides.distanceBucket ?? "5_7_5";
  const checkpointSecond = overrides.checkpointSecond ?? 180;

  return {
    baseByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        n: 200,
        p: 0.88,
      },
    ],
    chopByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        n: 200,
        p: 0.88,
        preChopBucket: "low",
      },
    ],
    computedAt: WINDOW_START - 60_000,
    leaderAgeByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        leadAgeBucket: "gte_120",
        n: 200,
        p: 0.87,
      },
    ],
    momentumByCheckpointDistance: [
      {
        checkpointSecond,
        distanceBucket,
        momentumAgreementBucket: "flat",
        n: 200,
        p: 0.88,
      },
    ],
    prePathShapeByCheckpoint: [
      {
        checkpointSecond,
        n: 200,
        p: 0.89,
        prePathShape: "clean-lock",
      },
    ],
    rankThresholds: RANK_THRESHOLDS,
    rollupVersion: 7,
  };
}

function evaluate(runner, {
  latestSnapshot = null,
  nowSecond,
  runtimeControls = RUNTIME_ON_MUTED,
} = {}) {
  return runner.evaluate({
    captureMode: "poll",
    collectorStatus: "ok",
    enabled: true,
    intendedSize: 1,
    latestChainlinkTick: {
      price: btcFromMargin(6),
      receivedAt: WINDOW_START + nowSecond * 1000 - 500,
      ts: WINDOW_START + nowSecond * 1000 - 500,
    },
    latestSnapshotsByMarketSlug: latestSnapshot
      ? new Map([[MARKET.slug, latestSnapshot]])
      : new Map(),
    markets: [MARKET],
    nowMs: WINDOW_START + nowSecond * 1000,
    pathBuffer: buildPathBuffer(),
    priors: priors(),
    runtimeControls,
  });
}

test("shadow runner holds candidates until checkpoint tolerance closes", () => {
  const runner = createDecisionShadowRunner({ engineRunId: ENGINE_RUN_ID });

  assert.deepEqual(
    evaluate(runner, {
      latestSnapshot: snapshotAt(180),
      nowSecond: 180,
    }),
    [],
  );
  assert.equal(runner.getCandidateCount(), 1);

  const emitted = evaluate(runner, {
    latestSnapshot: snapshotAt(184),
    nowSecond: 184,
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].checkpointSecond, 180);
  assert.equal(emitted[0].secondsFromWindowStart, 180);
  assert.equal(emitted[0].evaluatedAt, WINDOW_START + 180_000);
  assert.equal(emitted[0].engineRunId, ENGINE_RUN_ID);
});

test("shadow runner chooses closest candidate and earlier snapshot on exact tie", () => {
  const runner = createDecisionShadowRunner({ engineRunId: ENGINE_RUN_ID });

  evaluate(runner, {
    latestSnapshot: snapshotAt(178),
    nowSecond: 178,
  });
  evaluate(runner, {
    latestSnapshot: snapshotAt(182),
    nowSecond: 182,
  });

  const emitted = evaluate(runner, {
    latestSnapshot: snapshotAt(184),
    nowSecond: 184,
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].secondsFromWindowStart, 178);
  assert.equal(emitted[0].secondBucket, WINDOW_START + 178_000);
});

test("shadow runner writes missed-checkpoint diagnostic after closed empty window", () => {
  const runner = createDecisionShadowRunner({ engineRunId: ENGINE_RUN_ID });
  const emitted = evaluate(runner, {
    latestSnapshot: null,
    nowSecond: 184,
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].action, "WAIT");
  assert.deepEqual(emitted[0].reasonCodes, [
    "missed_checkpoint_window_no_snapshot",
  ]);
  assert.equal(emitted[0].checkpointSecond, 180);
  assert.equal(emitted[0].secondBucket, WINDOW_START + 180_000);
  assert.equal(emitted[0].evaluatedAt, WINDOW_START + 184_000);
});

test("disabled runtime flag suppresses missed backlog before enabling", () => {
  const runner = createDecisionShadowRunner({ engineRunId: ENGINE_RUN_ID });

  assert.deepEqual(
    evaluate(runner, {
      latestSnapshot: null,
      nowSecond: 250,
      runtimeControls: RUNTIME_OFF,
    }),
    [],
  );

  assert.deepEqual(
    evaluate(runner, {
      latestSnapshot: null,
      nowSecond: 250,
      runtimeControls: RUNTIME_ON_MUTED,
    }),
    [],
  );
});

test("shadow runner applies wait-only runtime muting to would-enter rows", () => {
  const runner = createDecisionShadowRunner({ engineRunId: ENGINE_RUN_ID });

  evaluate(runner, {
    latestSnapshot: snapshotAt(180),
    nowSecond: 180,
    runtimeControls: RUNTIME_ON_MUTED,
  });

  const emitted = evaluate(runner, {
    latestSnapshot: snapshotAt(184),
    nowSecond: 184,
    runtimeControls: RUNTIME_ON_MUTED,
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].action, "WAIT");
  assert.equal(emitted[0].actionPreMute, "ENTER_UP");
  assert.deepEqual(emitted[0].reasonCodes, [
    "enter_up_signal",
    "runtime_actions_muted",
  ]);
});

test("shadow runner can emit unmuted shadow enter when runtime allows all actions", () => {
  const runner = createDecisionShadowRunner({ engineRunId: ENGINE_RUN_ID });

  evaluate(runner, {
    latestSnapshot: snapshotAt(180),
    nowSecond: 180,
    runtimeControls: RUNTIME_ON_ALL,
  });

  const emitted = evaluate(runner, {
    latestSnapshot: snapshotAt(184),
    nowSecond: 184,
    runtimeControls: RUNTIME_ON_ALL,
  });

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].action, "ENTER_UP");
  assert.equal(emitted[0].actionPreMute, null);
});
