import {
  FINAL_FORENSICS_WINDOW_MS,
  getSnapshotSecondBucket,
} from "../../packages/shared/src/snapshot.js";

function hasFiniteWindowEnd(market) {
  return Number.isFinite(market?.windowEndTs);
}

export function getFinalWindowMarkets(
  markets,
  nowTs = Date.now(),
  windowMs = FINAL_FORENSICS_WINDOW_MS,
) {
  if (!Array.isArray(markets) || markets.length === 0) {
    return [];
  }

  const safeWindowMs = Number.isFinite(windowMs)
    ? Math.max(0, windowMs)
    : FINAL_FORENSICS_WINDOW_MS;
  const secondBucket = getSnapshotSecondBucket(nowTs);

  return markets.filter((market) => {
    if (!hasFiniteWindowEnd(market)) {
      return false;
    }

    return (
      secondBucket >= market.windowEndTs - safeWindowMs &&
      secondBucket <= market.windowEndTs
    );
  });
}
