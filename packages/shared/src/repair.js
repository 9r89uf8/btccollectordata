export const DEFAULT_STALE_ACTIVE_GRACE_MS = 2 * 60 * 1000;
export const DEFAULT_MISSING_SUMMARY_GRACE_MS = 10 * 60 * 1000;

export function appendSystemNote(existingNotes, nextNote) {
  if (typeof nextNote !== "string" || nextNote.trim() === "") {
    return existingNotes ?? null;
  }

  const normalizedNext = nextNote.trim();

  if (typeof existingNotes !== "string" || existingNotes.trim() === "") {
    return normalizedNext;
  }

  const parts = existingNotes
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.includes(normalizedNext)) {
    return parts.join("; ");
  }

  return [...parts, normalizedNext].join("; ");
}

export function shouldMarkMarketStaleActive(
  market,
  { nowTs, graceMs = DEFAULT_STALE_ACTIVE_GRACE_MS } = {},
) {
  if (!market?.active || !Number.isFinite(nowTs) || !Number.isFinite(market.windowEndTs)) {
    return false;
  }

  return market.windowEndTs <= nowTs - graceMs;
}

export function shouldFinalizeMissingSummary(
  market,
  { hasSummary = false, nowTs, graceMs = DEFAULT_MISSING_SUMMARY_GRACE_MS } = {},
) {
  if (
    hasSummary ||
    !market ||
    !Number.isFinite(nowTs) ||
    !Number.isFinite(market.windowEndTs)
  ) {
    return false;
  }

  return market.windowEndTs <= nowTs - graceMs;
}
