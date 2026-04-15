export const SNAPSHOT_PHASES = {
  PRE: "pre",
  LIVE: "live",
  POST: "post",
};

export const SNAPSHOT_QUALITY = {
  GOOD: "good",
  STALE_BOOK: "stale_book",
  STALE_BTC: "stale_btc",
  GAP: "gap",
};

export const DISPLAY_RULES = {
  MIDPOINT: "midpoint",
  LAST_TRADE: "last_trade",
  UNKNOWN: "unknown",
};

export const SNAPSHOT_BUCKET_MS = 1000;
export const SNAPSHOT_FINALIZATION_GRACE_MS = 5000;
export const DISPLAYED_PRICE_MAX_SPREAD = 0.1;
export const BOOK_STALE_MS = 5000;
export const BTC_STALE_MS = 10000;

export function getSnapshotSecondBucket(ts) {
  return Math.floor(ts / SNAPSHOT_BUCKET_MS) * SNAPSHOT_BUCKET_MS;
}

export function getSnapshotWritePolicy(ts, nowTs = Date.now()) {
  const secondBucket = getSnapshotSecondBucket(ts);
  const finalizesAt = secondBucket + SNAPSHOT_FINALIZATION_GRACE_MS;

  return {
    secondBucket,
    finalizesAt,
    canOverwrite: nowTs <= finalizesAt,
  };
}

export function normalizeFeedTimestamp(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed < 1e12 ? parsed * 1000 : parsed;
}

export function getSnapshotPhase(ts, windowStartTs, windowEndTs) {
  if (ts < windowStartTs) {
    return SNAPSHOT_PHASES.PRE;
  }

  if (ts >= windowEndTs) {
    return SNAPSHOT_PHASES.POST;
  }

  return SNAPSHOT_PHASES.LIVE;
}

export function getSecondsFromWindowStart(ts, windowStartTs) {
  return Math.floor((ts - windowStartTs) / SNAPSHOT_BUCKET_MS);
}

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveDisplayedPrice(input) {
  const bid = toFiniteNumber(input?.bid);
  const ask = toFiniteNumber(input?.ask);
  const mid = toFiniteNumber(input?.mid);
  const last = toFiniteNumber(input?.last);

  if (
    bid !== null &&
    ask !== null &&
    mid !== null &&
    ask - bid <= DISPLAYED_PRICE_MAX_SPREAD
  ) {
    return {
      price: mid,
      rule: DISPLAY_RULES.MIDPOINT,
    };
  }

  if (last !== null) {
    return {
      price: last,
      rule: DISPLAY_RULES.LAST_TRADE,
    };
  }

  if (mid !== null) {
    return {
      price: mid,
      rule: DISPLAY_RULES.MIDPOINT,
    };
  }

  return {
    price: null,
    rule: DISPLAY_RULES.UNKNOWN,
  };
}

export function isSourceStale(lastTs, nowTs, thresholdMs) {
  if (!Number.isFinite(lastTs)) {
    return true;
  }

  return nowTs - lastTs > thresholdMs;
}
