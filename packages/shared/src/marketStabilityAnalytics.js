import { getExpectedBucketCount, inferSnapshotCadenceMs } from "./cadence.js";
import { CHECKPOINT_SECONDS } from "./marketAnalytics.js";

export const STABILITY_ANALYTICS_VERSION = 4;
export const STABILITY_DEADBAND_BPS = 0.5;
export const PRE_NEAR_LINE_BPS = 2;
export const MOMENTUM_DEADBAND_BPS = 0.5;
export const DIRECTION_CHANGE_MIN_DELTA_BPS = 0.5;
const EPSILON = 1e-9;
export const MIN_PATH_COVERAGE_PCT = 0.95;
export const MIN_SNAPSHOT_CADENCE_MS = 1_000;
export const MAX_SNAPSHOT_CADENCE_MS = 10_000;
export const PATH_TYPES = {
  CHOP: "chop",
  EARLY_LOCK: "early-lock",
  FINAL_SECOND_FLIP: "final-second-flip",
  LATE_LOCK: "late-lock",
  MID_LOCK: "mid-lock",
  NEAR_LINE_UNRESOLVED: "near-line-unresolved",
  UNKNOWN: "unknown",
};
export const STABILITY_EXCLUDED_REASONS = {
  SPARSE_POST_CHECKPOINT_SNAPSHOTS: "sparse-post-checkpoint-snapshots",
};

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marginBps(price, priceToBeat) {
  return priceToBeat === null || priceToBeat <= 0 || price === null
    ? null
    : (10000 * (price - priceToBeat)) / priceToBeat;
}

function stateFromMargin(margin) {
  if (!Number.isFinite(margin)) {
    return null;
  }

  if (margin >= STABILITY_DEADBAND_BPS - EPSILON) {
    return "up";
  }

  if (margin <= -STABILITY_DEADBAND_BPS + EPSILON) {
    return "down";
  }

  return "noise";
}

function getCheckpoint(row, checkpointSecond) {
  return row?.checkpoints?.find(
    (checkpoint) => checkpoint.checkpointSecond === checkpointSecond,
  );
}

function getSnapshotSecond(snapshot, windowStartTs) {
  if (Number.isFinite(snapshot?.secondsFromWindowStart)) {
    return snapshot.secondsFromWindowStart;
  }

  const secondBucket = toFiniteNumber(snapshot?.secondBucket);

  return secondBucket === null
    ? null
    : Math.floor((secondBucket - windowStartTs) / 1000);
}

function normalizeSnapshots(snapshots, { priceToBeat, windowEndTs, windowStartTs }) {
  const rows = [];
  const seen = new Set();

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const secondBucket = toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);
    const price = toFiniteNumber(snapshot?.btcChainlink);

    if (secondBucket === null || price === null || seen.has(secondBucket)) {
      continue;
    }

    if (secondBucket < windowStartTs || secondBucket > windowEndTs) {
      continue;
    }

    const secondsFromWindowStart = getSnapshotSecond(
      { ...snapshot, secondBucket },
      windowStartTs,
    );
    const margin = marginBps(price, priceToBeat);

    if (secondsFromWindowStart === null || margin === null) {
      continue;
    }

    seen.add(secondBucket);
    rows.push({
      marginBps: margin,
      price,
      secondBucket,
      secondsFromWindowStart,
      state: stateFromMargin(margin),
    });
  }

  return rows.sort((a, b) => a.secondBucket - b.secondBucket);
}

function getMaxAllowedGapMs(cadenceMs) {
  return Math.max(12_000, cadenceMs * 2);
}

function getMaxAllowedLastSnapshotAgeMs(cadenceMs) {
  return Math.max(6_000, cadenceMs);
}

function isValidSnapshotCadenceMs(cadenceMs) {
  return (
    Number.isFinite(cadenceMs) &&
    cadenceMs >= MIN_SNAPSHOT_CADENCE_MS &&
    cadenceMs <= MAX_SNAPSHOT_CADENCE_MS
  );
}

function inferExpectedSnapshotCadenceMs(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return null;
  }

  const cadenceMs = inferSnapshotCadenceMs(rows);

  return isValidSnapshotCadenceMs(cadenceMs) ? cadenceMs : null;
}

function getCoverage(rows, { cadenceMs, endTs, startTs }) {
  const cadenceValid = isValidSnapshotCadenceMs(cadenceMs);
  const expected = cadenceValid
    ? getExpectedBucketCount(startTs, endTs, cadenceMs)
    : 0;

  if (expected <= 0) {
    return {
      coveragePct: 0,
      expected,
      lastSnapshotAgeMsAtClose: null,
      maxGapMs: null,
      pathGood: false,
      rowCount: rows.length,
    };
  }

  const inRange = rows.filter(
    (row) => row.secondBucket >= startTs && row.secondBucket <= endTs,
  );
  const coveragePct = Math.min(1, inRange.length / expected);
  let maxGapMs = inRange.length === 0 ? endTs - startTs : inRange[0].secondBucket - startTs;

  for (let index = 1; index < inRange.length; index += 1) {
    maxGapMs = Math.max(
      maxGapMs,
      inRange[index].secondBucket - inRange[index - 1].secondBucket,
    );
  }

  if (inRange.length > 0) {
    maxGapMs = Math.max(maxGapMs, endTs - inRange[inRange.length - 1].secondBucket);
  }

  const lastSnapshotAgeMsAtClose =
    inRange.length === 0
      ? null
      : Math.max(0, endTs - inRange[inRange.length - 1].secondBucket);

  return {
    coveragePct,
    expected,
    lastSnapshotAgeMsAtClose,
    maxGapMs,
    pathGood:
      cadenceValid &&
      coveragePct >= MIN_PATH_COVERAGE_PCT &&
      maxGapMs <= getMaxAllowedGapMs(cadenceMs) &&
      lastSnapshotAgeMsAtClose !== null &&
      lastSnapshotAgeMsAtClose <= getMaxAllowedLastSnapshotAgeMs(cadenceMs),
    rowCount: inRange.length,
  };
}

function computeHardFlips(rows) {
  const flips = [];
  let lastStableState = null;
  let firstStableState = null;

  for (const row of rows) {
    if (row.state === "noise" || row.state === null) {
      continue;
    }

    if (!firstStableState) {
      firstStableState = row;
    }

    if (lastStableState && row.state !== lastStableState.state) {
      flips.push({
        from: lastStableState.state,
        second: row.secondsFromWindowStart,
        to: row.state,
      });
    }

    lastStableState = row;
  }

  return {
    firstStableState,
    flips,
  };
}

function findWinnerLockSecond({ firstStableState, flips, resolvedOutcome, rows }) {
  if (!resolvedOutcome || !firstStableState) {
    return null;
  }

  if (flips.length === 0) {
    if (firstStableState.state !== resolvedOutcome) {
      return null;
    }

    return firstStableState.secondsFromWindowStart <= 5
      ? 0
      : firstStableState.secondsFromWindowStart;
  }

  const finalFlip = flips[flips.length - 1];
  const winnerRow = rows.find(
    (row) =>
      row.secondsFromWindowStart >= finalFlip.second &&
      row.state === resolvedOutcome,
  );

  return winnerRow?.secondsFromWindowStart ?? null;
}

function standardDeviation(values) {
  const finite = values.filter((value) => Number.isFinite(value));

  if (finite.length === 0) {
    return null;
  }

  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance =
    finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;

  return Math.sqrt(variance);
}

function getVolatility(rows, checkpointSecond, lookbackSeconds) {
  const startSecond = Math.max(0, checkpointSecond - lookbackSeconds);

  return standardDeviation(
    rows
      .filter(
        (row) =>
          row.secondsFromWindowStart <= checkpointSecond &&
          row.secondsFromWindowStart >= startSecond,
      )
      .map((row) => row.marginBps),
  );
}

function getRange(rows, checkpointSecond, lookbackSeconds) {
  const startSecond = Math.max(0, checkpointSecond - lookbackSeconds);
  const values = rows
    .filter(
      (row) =>
        row.secondsFromWindowStart <= checkpointSecond &&
        row.secondsFromWindowStart >= startSecond,
    )
    .map((row) => row.marginBps)
    .filter((value) => Number.isFinite(value));

  return values.length === 0 ? null : Math.max(...values) - Math.min(...values);
}

function countNearLineSeconds(preRows, checkpointSecond) {
  let seconds = 0;

  for (let index = 0; index < preRows.length; index += 1) {
    const row = preRows[index];
    const nextSecond =
      preRows[index + 1]?.secondsFromWindowStart ?? checkpointSecond;
    const duration = Math.max(
      0,
      Math.min(checkpointSecond, nextSecond) - row.secondsFromWindowStart,
    );

    if (Math.abs(row.marginBps) <= PRE_NEAR_LINE_BPS + EPSILON) {
      seconds += duration;
    }
  }

  return Math.round(seconds);
}

function countDirectionChanges(preRows) {
  let currentDirection = null;
  let trackedExtreme = null;
  let count = 0;

  for (const row of preRows) {
    if (!Number.isFinite(row.marginBps)) {
      continue;
    }

    if (trackedExtreme === null) {
      trackedExtreme = row.marginBps;
      continue;
    }

    const delta = row.marginBps - trackedExtreme;

    if (currentDirection === null) {
      if (Math.abs(delta) >= DIRECTION_CHANGE_MIN_DELTA_BPS - EPSILON) {
        currentDirection = delta > 0 ? "up" : "down";
        trackedExtreme = row.marginBps;
      }
      continue;
    }

    if (currentDirection === "up") {
      if (row.marginBps > trackedExtreme) {
        trackedExtreme = row.marginBps;
      } else if (
        trackedExtreme - row.marginBps >=
        DIRECTION_CHANGE_MIN_DELTA_BPS - EPSILON
      ) {
        count += 1;
        currentDirection = "down";
        trackedExtreme = row.marginBps;
      }
      continue;
    }

    if (row.marginBps < trackedExtreme) {
      trackedExtreme = row.marginBps;
    } else if (
      row.marginBps - trackedExtreme >=
      DIRECTION_CHANGE_MIN_DELTA_BPS - EPSILON
    ) {
      count += 1;
      currentDirection = "up";
      trackedExtreme = row.marginBps;
    }
  }

  return count;
}

function countCrossesLast60s(rows, checkpointSecond) {
  const startSecond = Math.max(0, checkpointSecond - 60);
  const { flips } = computeHardFlips(
    rows.filter(
      (row) =>
        row.secondsFromWindowStart >= startSecond &&
        row.secondsFromWindowStart <= checkpointSecond,
    ),
  );

  return flips.length;
}

function getLatestRowAtOrBefore(rows, targetSecond) {
  let latest = null;

  for (const row of rows) {
    if (
      row.secondsFromWindowStart < 0 ||
      row.secondsFromWindowStart > targetSecond
    ) {
      continue;
    }

    if (!latest || row.secondsFromWindowStart > latest.secondsFromWindowStart) {
      latest = row;
    }
  }

  return latest;
}

function getRowsThroughCheckpoint(rows, checkpointSecond) {
  return rows.filter(
    (row) =>
      row.secondsFromWindowStart >= 0 &&
      row.secondsFromWindowStart <= checkpointSecond,
  );
}

function getRowsFromCheckpoint(rows, checkpointSecond) {
  return rows.filter(
    (row) => row.secondsFromWindowStart >= checkpointSecond,
  );
}

function momentumSide(momentumBps) {
  if (!Number.isFinite(momentumBps)) {
    return null;
  }

  if (momentumBps > MOMENTUM_DEADBAND_BPS) {
    return "up";
  }

  if (momentumBps < -MOMENTUM_DEADBAND_BPS) {
    return "down";
  }

  return "flat";
}

function buildMomentum(rows, { cadenceMs, checkpointSecond, leader, lookbackSeconds }) {
  const startSecond = checkpointSecond - lookbackSeconds;

  if (
    startSecond < 0 ||
    !isValidSnapshotCadenceMs(cadenceMs) ||
    checkpointSecond < 0
  ) {
    return {
      agreesWithLeader: null,
      leaderAlignedBps: null,
      momentumBps: null,
      side: null,
    };
  }

  const maxEndpointAgeMs = getMaxAllowedGapMs(cadenceMs);
  const startRow = getLatestRowAtOrBefore(rows, startSecond);
  const endRow = getLatestRowAtOrBefore(rows, checkpointSecond);

  if (!startRow || !endRow) {
    return {
      agreesWithLeader: null,
      leaderAlignedBps: null,
      momentumBps: null,
      side: null,
    };
  }

  if (
    (startSecond - startRow.secondsFromWindowStart) * 1000 > maxEndpointAgeMs ||
    (checkpointSecond - endRow.secondsFromWindowStart) * 1000 > maxEndpointAgeMs
  ) {
    return {
      agreesWithLeader: null,
      leaderAlignedBps: null,
      momentumBps: null,
      side: null,
    };
  }

  const momentumBps = endRow.marginBps - startRow.marginBps;
  const side = momentumSide(momentumBps);
  const leaderSign = leader === "up" ? 1 : leader === "down" ? -1 : null;

  return {
    agreesWithLeader:
      !leader || side === null || side === "flat" ? null : side === leader,
    leaderAlignedBps: leaderSign === null ? null : leaderSign * momentumBps,
    momentumBps,
    side,
  };
}

function emptyPreFeatures() {
  return {
    leaderAlignedMomentum30sBps: null,
    leaderAlignedMomentum60sBps: null,
    momentum30sAgreesWithLeader: null,
    momentum30sBps: null,
    momentum30sSide: null,
    momentum60sAgreesWithLeader: null,
    momentum60sBps: null,
    momentum60sSide: null,
    preCurrentLeadAgeSeconds: null,
    preDirectionChangeCount: null,
    preCrossCountLast60s: null,
    preFlipCount: null,
    preLastFlipAgeSeconds: null,
    preLeaderDwellPct: null,
    preLongestLeadStreakSeconds: null,
    preMaxSnapshotGapMs: null,
    preNearLineSeconds: null,
    prePathGood: false,
    preRange60sBps: null,
    preRange120sBps: null,
    preRealizedVolatility60s: null,
    preRealizedVolatility120s: null,
    preSnapshotCoveragePct: 0,
  };
}

// Predictor fields must use only snapshots at or before checkpoint T.
function buildPreFeatures({
  checkpointSecond,
  leader,
  rows,
  windowStartTs,
}) {
  if (!Number.isFinite(windowStartTs) || checkpointSecond <= 0) {
    return emptyPreFeatures();
  }

  const preRows = getRowsThroughCheckpoint(rows, checkpointSecond);
  const cadenceMs = inferExpectedSnapshotCadenceMs(preRows);
  const checkpointTs = windowStartTs + checkpointSecond * 1000;
  const coverage = getCoverage(preRows, {
    cadenceMs,
    endTs: checkpointTs,
    startTs: windowStartTs,
  });

  if (!coverage.pathGood) {
    return {
      ...emptyPreFeatures(),
      preMaxSnapshotGapMs: coverage.maxGapMs,
      prePathGood: false,
      preSnapshotCoveragePct: coverage.coveragePct,
    };
  }

  let currentStableSide = null;
  let currentStableAge = 0;
  let leaderAge = 0;
  let leaderDwell = 0;
  let longestLeaderStreak = 0;
  let preFlipCount = 0;
  let lastFlipSecond = null;
  const momentum30s = buildMomentum(preRows, {
    cadenceMs,
    checkpointSecond,
    leader,
    lookbackSeconds: 30,
  });
  const momentum60s = buildMomentum(preRows, {
    cadenceMs,
    checkpointSecond,
    leader,
    lookbackSeconds: 60,
  });

  for (let index = 0; index < preRows.length; index += 1) {
    const row = preRows[index];
    const nextSecond =
      preRows[index + 1]?.secondsFromWindowStart ?? checkpointSecond;
    const duration = Math.max(
      0,
      Math.min(checkpointSecond, nextSecond) - row.secondsFromWindowStart,
    );

    if (row.state === "noise" || row.state === null) {
      continue;
    }

    if (row.state === leader) {
      leaderDwell += duration;
    }

    if (currentStableSide === null) {
      currentStableSide = row.state;
      currentStableAge = duration;
    } else if (row.state === currentStableSide) {
      currentStableAge += duration;
    } else {
      preFlipCount += 1;
      lastFlipSecond = row.secondsFromWindowStart;
      currentStableSide = row.state;
      currentStableAge = duration;
    }

    if (currentStableSide === leader) {
      leaderAge = currentStableAge;
      longestLeaderStreak = Math.max(longestLeaderStreak, currentStableAge);
    }
  }

  return {
    leaderAlignedMomentum30sBps: momentum30s.leaderAlignedBps,
    leaderAlignedMomentum60sBps: momentum60s.leaderAlignedBps,
    momentum30sAgreesWithLeader: momentum30s.agreesWithLeader,
    momentum30sBps: momentum30s.momentumBps,
    momentum30sSide: momentum30s.side,
    momentum60sAgreesWithLeader: momentum60s.agreesWithLeader,
    momentum60sBps: momentum60s.momentumBps,
    momentum60sSide: momentum60s.side,
    preCurrentLeadAgeSeconds:
      leader && currentStableSide === leader ? Math.round(leaderAge) : 0,
    preDirectionChangeCount: countDirectionChanges(preRows),
    preCrossCountLast60s: countCrossesLast60s(rows, checkpointSecond),
    preFlipCount,
    preLastFlipAgeSeconds:
      lastFlipSecond === null ? null : checkpointSecond - lastFlipSecond,
    preLeaderDwellPct: leader ? leaderDwell / checkpointSecond : null,
    preLongestLeadStreakSeconds: Math.round(longestLeaderStreak),
    preMaxSnapshotGapMs: coverage.maxGapMs,
    preNearLineSeconds: countNearLineSeconds(preRows, checkpointSecond),
    prePathGood: true,
    preRange60sBps: getRange(rows, checkpointSecond, 60),
    preRange120sBps: getRange(rows, checkpointSecond, 120),
    preRealizedVolatility60s: getVolatility(rows, checkpointSecond, 60),
    preRealizedVolatility120s: getVolatility(rows, checkpointSecond, 120),
    preSnapshotCoveragePct: coverage.coveragePct,
  };
}

function getLivePriceToBeat(market, overridePriceToBeat) {
  const explicit = toFiniteNumber(overridePriceToBeat);

  if (explicit !== null) {
    return explicit;
  }

  const official = toFiniteNumber(market?.priceToBeatOfficial);

  if (official !== null) {
    return official;
  }

  const derived = toFiniteNumber(market?.priceToBeatDerived);

  if (derived !== null) {
    return derived;
  }

  return toFiniteNumber(market?.priceToBeat);
}

function snapshotTs(snapshot) {
  return toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);
}

function liveLeaderFromMargin(marginBpsValue) {
  if (!Number.isFinite(marginBpsValue)) {
    return null;
  }

  if (Math.abs(marginBpsValue) <= STABILITY_DEADBAND_BPS + EPSILON) {
    return null;
  }

  return marginBpsValue > 0 ? "up" : "down";
}

export function buildLivePathFeatures({
  leader = null,
  market,
  nowTs = Date.now(),
  priceToBeat: overridePriceToBeat = null,
  snapshots,
} = {}) {
  const priceToBeat = getLivePriceToBeat(market, overridePriceToBeat);
  const windowStartTs = toFiniteNumber(market?.windowStartTs);
  const windowEndTs = toFiniteNumber(market?.windowEndTs);

  if (
    priceToBeat === null ||
    windowStartTs === null ||
    windowEndTs === null ||
    !Number.isFinite(nowTs)
  ) {
    return {
      checkpointSecond: null,
      checkpointTs: null,
      latestMarginBps: null,
      latestSnapshotTs: null,
      leader: null,
      priceToBeat,
      ...emptyPreFeatures(),
    };
  }

  const checkpointTs = Math.min(nowTs, windowEndTs);
  const checkpointSecond = Math.floor((checkpointTs - windowStartTs) / 1000);
  const cappedSnapshots = (Array.isArray(snapshots) ? snapshots : []).filter((snapshot) => {
    const ts = snapshotTs(snapshot);

    return ts !== null && ts <= checkpointTs;
  });
  const rows = normalizeSnapshots(cappedSnapshots, {
    priceToBeat,
    windowEndTs,
    windowStartTs,
  });
  const latestRow = getLatestRowAtOrBefore(rows, checkpointSecond);
  const resolvedLeader = leader ?? liveLeaderFromMargin(latestRow?.marginBps);

  return {
    checkpointSecond,
    checkpointTs,
    latestMarginBps: latestRow?.marginBps ?? null,
    latestSnapshotTs: latestRow?.secondBucket ?? null,
    leader: resolvedLeader,
    priceToBeat,
    ...buildPreFeatures({
      checkpointSecond,
      leader: resolvedLeader,
      rows,
      windowStartTs,
    }),
  };
}

function countPostHardFlips(rows, checkpointSecond, checkpointLeader) {
  const postRows = rows.filter(
    (row) => row.secondsFromWindowStart >= checkpointSecond,
  );
  const flips = [];
  let lastStableState = checkpointLeader;

  for (const row of postRows) {
    if (row.state === "noise" || row.state === null) {
      continue;
    }

    if (lastStableState && row.state !== lastStableState) {
      flips.push({
        second: row.secondsFromWindowStart,
        to: row.state,
      });
    }

    lastStableState = row.state;
  }

  return flips;
}

function buildPostFeatures({
  fullWindowCadenceMs,
  checkpoint,
  leader,
  priceToBeat,
  rows,
  windowEndTs,
  windowStartTs,
}) {
  const checkpointSecond = checkpoint.checkpointSecond;
  if (!Number.isFinite(windowStartTs) || !Number.isFinite(windowEndTs)) {
    return {
      postAnyHardFlip: null,
      postFirstHardFlipSecond: null,
      postHardFlipCount: null,
      postLastHardFlipSecond: null,
      postMaxAdverseBps: null,
      postMaxSnapshotGapMs: null,
      postMinSignedMarginBps: null,
      postPathGood: false,
      postLastSnapshotAgeMsAtClose: null,
      postSnapshotCoveragePct: 0,
      postTimeUnderwaterSeconds: null,
      postTouchedNoise: null,
    };
  }

  const checkpointTs = windowStartTs + checkpointSecond * 1000;
  const postRows = getRowsFromCheckpoint(rows, checkpointSecond);
  const postCadenceMs =
    inferExpectedSnapshotCadenceMs(postRows) ?? fullWindowCadenceMs;
  const coverage = getCoverage(postRows, {
    cadenceMs: postCadenceMs,
    endTs: windowEndTs,
    startTs: checkpointTs,
  });

  if (!coverage.pathGood || !leader || priceToBeat === null) {
    return {
      postAnyHardFlip: null,
      postFirstHardFlipSecond: null,
      postHardFlipCount: null,
      postLastHardFlipSecond: null,
      postMaxAdverseBps: null,
      postMaxSnapshotGapMs: coverage.maxGapMs,
      postMinSignedMarginBps: null,
      postPathGood: coverage.pathGood,
      postLastSnapshotAgeMsAtClose: coverage.lastSnapshotAgeMsAtClose,
      postSnapshotCoveragePct: coverage.coveragePct,
      postTimeUnderwaterSeconds: null,
      postTouchedNoise: null,
    };
  }

  const leaderSign = leader === "up" ? 1 : -1;
  const signedMargins = postRows.map((row) => leaderSign * row.marginBps);
  const postMinSignedMarginBps =
    signedMargins.length === 0 ? null : Math.min(...signedMargins);
  const flips = countPostHardFlips(rows, checkpointSecond, leader);
  let postTimeUnderwaterSeconds = 0;

  for (let index = 0; index < postRows.length; index += 1) {
    const row = postRows[index];
    const nextSecond =
      postRows[index + 1]?.secondsFromWindowStart ??
      Math.round((windowEndTs - windowStartTs) / 1000);
    const duration = Math.max(0, nextSecond - row.secondsFromWindowStart);
    const signedMargin = leaderSign * row.marginBps;

    if (signedMargin <= -STABILITY_DEADBAND_BPS + EPSILON) {
      postTimeUnderwaterSeconds += duration;
    }
  }

  return {
    postAnyHardFlip:
      postMinSignedMarginBps === null
        ? null
        : postMinSignedMarginBps <= -STABILITY_DEADBAND_BPS + EPSILON,
    postFirstHardFlipSecond: flips[0]?.second ?? null,
    postHardFlipCount: flips.length,
    postLastHardFlipSecond: flips[flips.length - 1]?.second ?? null,
    postMaxAdverseBps:
      postMinSignedMarginBps === null ? null : Math.max(0, -postMinSignedMarginBps),
    postMaxSnapshotGapMs: coverage.maxGapMs,
    postMinSignedMarginBps,
    postPathGood: coverage.pathGood,
    postLastSnapshotAgeMsAtClose: coverage.lastSnapshotAgeMsAtClose,
    postSnapshotCoveragePct: coverage.coveragePct,
    postTimeUnderwaterSeconds,
    postTouchedNoise:
      postMinSignedMarginBps === null
        ? null
        : postMinSignedMarginBps <= STABILITY_DEADBAND_BPS + EPSILON,
  };
}

function buildCheckpointStability({
  cadenceMs,
  checkpoint,
  priceToBeat,
  resolvedOutcome,
  rows,
  windowEndTs,
  windowStartTs,
}) {
  const leader = checkpoint.currentLeader ?? null;
  const distanceBps = toFiniteNumber(checkpoint.distanceToBeatBps);
  const leaderWonAtClose =
    checkpoint.didCurrentLeaderWin === null
      ? null
      : Boolean(checkpoint.didCurrentLeaderWin);
  const checkpointInNoise =
    Number.isFinite(distanceBps) &&
    Math.abs(distanceBps) < STABILITY_DEADBAND_BPS - EPSILON;
  const post = buildPostFeatures({
    checkpoint,
    fullWindowCadenceMs: cadenceMs,
    leader,
    priceToBeat,
    rows,
    windowEndTs,
    windowStartTs,
  });
  const pre = buildPreFeatures({
    checkpointSecond: checkpoint.checkpointSecond,
    leader,
    rows,
    windowStartTs,
  });
  const canClassifyPath =
    !checkpointInNoise &&
    leaderWonAtClose !== null &&
    leader !== null &&
    post.postPathGood;
  const flipLoss =
    !checkpointInNoise && leaderWonAtClose === false ? true : false;
  const stableLeaderWin =
    canClassifyPath &&
    leaderWonAtClose === true &&
    post.postAnyHardFlip === false &&
    post.postTouchedNoise === false;
  const noisyLeaderWin =
    canClassifyPath &&
    leaderWonAtClose === true &&
    post.postAnyHardFlip === false &&
    post.postTouchedNoise === true;
  const recoveredLeaderWin =
    canClassifyPath &&
    leaderWonAtClose === true &&
    post.postAnyHardFlip === true;
  const unknownPath =
    !checkpointInNoise &&
    leaderWonAtClose !== false &&
    leader !== null &&
    !post.postPathGood;

  return {
    checkpointInNoise,
    checkpointSecond: checkpoint.checkpointSecond,
    checkpointTs: checkpoint.checkpointTs,
    distanceBps,
    flipLoss,
    leader,
    leaderWonAtClose,
    noisyLeaderWin,
    recoveredLeaderWin,
    stableLeaderWin,
    unknownPath,
    ...post,
    ...pre,
  };
}

function getPathType({
  checkpoints,
  firstStableState,
  hardFlipCount,
  pathGood,
  winnerLockSecond,
}) {
  const noiseCount = checkpoints.filter(
    (checkpoint) => checkpoint.checkpointInNoise,
  ).length;

  if (hardFlipCount >= 3) {
    return PATH_TYPES.CHOP;
  }

  if (
    !firstStableState ||
    noiseCount >= 5 ||
    checkpoints.every((checkpoint) => checkpoint.checkpointInNoise)
  ) {
    return PATH_TYPES.NEAR_LINE_UNRESOLVED;
  }

  if (!pathGood || winnerLockSecond === null) {
    return PATH_TYPES.UNKNOWN;
  }

  if (winnerLockSecond < 180) {
    return PATH_TYPES.EARLY_LOCK;
  }

  if (winnerLockSecond < 240) {
    return PATH_TYPES.MID_LOCK;
  }

  if (winnerLockSecond < 285) {
    return PATH_TYPES.LATE_LOCK;
  }

  return PATH_TYPES.FINAL_SECOND_FLIP;
}

function buildPathSummary({
  checkpoints,
  cadenceMs,
  pathRows,
  priceToBeat,
  resolvedOutcome,
  windowEndTs,
  windowStartTs,
}) {
  const coverage = getCoverage(pathRows, {
    cadenceMs,
    endTs: windowEndTs,
    startTs: windowStartTs,
  });
  const { firstStableState, flips } = computeHardFlips(pathRows);
  const winnerLockSecond = coverage.pathGood
    ? findWinnerLockSecond({
        firstStableState,
        flips,
        resolvedOutcome,
        rows: pathRows,
      })
    : null;
  const margins = pathRows.map((row) => row.marginBps);
  const closeMarginBps =
    pathRows.length === 0 ? null : pathRows[pathRows.length - 1].marginBps;
  const maxDistanceBps =
    margins.length === 0 ? null : Math.max(...margins.map((margin) => Math.abs(margin)));
  const noiseTouchCount = pathRows.filter((row) => row.state === "noise").length;
  const pathSummary = {
    closeMarginBps,
    hardFlipCount: flips.length,
    maxDistanceBps,
    maxSnapshotGapMs: coverage.maxGapMs,
    lastSnapshotAgeMsAtClose: coverage.lastSnapshotAgeMsAtClose,
    noiseTouchCount,
    pathGood: coverage.pathGood,
    postCheckpointSnapshotCoveragePct: Math.min(
      ...checkpoints.map((checkpoint) => checkpoint.postSnapshotCoveragePct ?? 0),
    ),
    snapshotCadenceMs: cadenceMs,
    snapshotCoveragePct: coverage.coveragePct,
    winnerLockAgeAtClose:
      winnerLockSecond === null ? null : Math.max(0, 300 - winnerLockSecond),
    winnerLockSecond,
  };

  return {
    ...pathSummary,
    pathType: getPathType({
      checkpoints,
      firstStableState,
      hardFlipCount: flips.length,
      pathGood: coverage.pathGood,
      winnerLockSecond,
    }),
  };
}

export function buildMarketStabilityAnalytics({
  marketAnalytics,
  nowTs = Date.now(),
  snapshots,
}) {
  const priceToBeat = toFiniteNumber(marketAnalytics?.priceToBeat);
  const windowStartTs = toFiniteNumber(marketAnalytics?.windowStartTs);
  const windowEndTs = toFiniteNumber(marketAnalytics?.windowEndTs);
  const resolvedOutcome = marketAnalytics?.resolvedOutcome ?? null;
  const pathRows =
    priceToBeat === null || windowStartTs === null || windowEndTs === null
      ? []
      : normalizeSnapshots(snapshots, {
          priceToBeat,
          windowEndTs,
          windowStartTs,
        });
  const cadenceMs = inferExpectedSnapshotCadenceMs(pathRows);
  const checkpoints = CHECKPOINT_SECONDS.map((checkpointSecond) => {
    const checkpoint = getCheckpoint(marketAnalytics, checkpointSecond) ?? {
      checkpointSecond,
      checkpointTs:
        windowStartTs === null ? null : windowStartTs + checkpointSecond * 1000,
      currentLeader: null,
      didCurrentLeaderWin: null,
      distanceToBeatBps: null,
    };

    return buildCheckpointStability({
      cadenceMs,
      checkpoint,
      priceToBeat,
      resolvedOutcome,
      rows: pathRows,
      windowEndTs,
      windowStartTs,
    });
  });
  const pathSummary =
    windowStartTs === null || windowEndTs === null
      ? {
          closeMarginBps: null,
          hardFlipCount: 0,
          maxDistanceBps: null,
          maxSnapshotGapMs: null,
          lastSnapshotAgeMsAtClose: null,
          noiseTouchCount: 0,
          pathGood: false,
          pathType: PATH_TYPES.UNKNOWN,
          postCheckpointSnapshotCoveragePct: 0,
          snapshotCadenceMs: cadenceMs,
          snapshotCoveragePct: 0,
          winnerLockAgeAtClose: null,
          winnerLockSecond: null,
        }
      : buildPathSummary({
          cadenceMs,
          checkpoints,
          pathRows,
          priceToBeat,
          resolvedOutcome,
          windowEndTs,
          windowStartTs,
        });
  const excludedReasons = checkpoints.some(
    (checkpoint) => !checkpoint.postPathGood,
  )
    ? [STABILITY_EXCLUDED_REASONS.SPARSE_POST_CHECKPOINT_SNAPSHOTS]
    : [];

  return {
    analyticsVersion: marketAnalytics?.analyticsVersion ?? null,
    checkpoints,
    createdAt: nowTs,
    excludedReasons,
    marketId: marketAnalytics?.marketId ?? "",
    marketSlug: marketAnalytics?.marketSlug ?? "",
    pathSummary,
    priceToBeat,
    resolvedOutcome,
    stabilityAnalyticsVersion: STABILITY_ANALYTICS_VERSION,
    updatedAt: nowTs,
    windowEndTs,
    windowStartTs,
  };
}
