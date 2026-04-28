// Keep a short post-window tail so late snapshot batches remain available for
// diagnostics without retaining closed markets indefinitely.
const DEFAULT_PATH_BUFFER_GRACE_MS = 15_000;

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function marketSlugFor(value) {
  return typeof value?.slug === "string" && value.slug !== ""
    ? value.slug
    : typeof value?.marketSlug === "string" && value.marketSlug !== ""
      ? value.marketSlug
      : null;
}

function normalizeWindow(market) {
  const marketSlug = marketSlugFor(market);
  const windowStartTs = toFiniteNumber(market?.windowStartTs);
  const windowEndTs = toFiniteNumber(market?.windowEndTs);

  if (!marketSlug || windowStartTs === null || windowEndTs === null) {
    return null;
  }

  return {
    marketSlug,
    windowEndTs,
    windowStartTs,
  };
}

function normalizeSnapshot(snapshot) {
  const marketSlug = marketSlugFor(snapshot);
  const secondBucket = toFiniteNumber(snapshot?.secondBucket ?? snapshot?.ts);

  if (!marketSlug || secondBucket === null) {
    return null;
  }

  return {
    btcChainlink: toFiniteNumber(snapshot?.btcChainlink),
    secondBucket,
    secondsFromWindowStart: toFiniteNumber(snapshot?.secondsFromWindowStart),
    sourceQuality:
      typeof snapshot?.sourceQuality === "string"
        ? snapshot.sourceQuality
        : null,
    ts: toFiniteNumber(snapshot?.ts ?? snapshot?.writtenAt ?? secondBucket) ?? secondBucket,
  };
}

function shouldReplace(existing, candidate) {
  if (!existing) {
    return true;
  }

  // Same-bucket snapshots can arrive out of order; keep the latest write for
  // that logical second so corrected rows replace stale rows.
  return candidate.ts >= existing.ts;
}

function pruneRows(rows, window, graceMs) {
  if (!window) {
    return rows;
  }

  const minTs = window.windowStartTs;
  const maxTs = window.windowEndTs + graceMs;

  return rows.filter(
    (row) => row.secondBucket >= minTs && row.secondBucket <= maxTs,
  );
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    if (a.secondBucket !== b.secondBucket) {
      return a.secondBucket - b.secondBucket;
    }

    return a.ts - b.ts;
  });
}

export function createDecisionPathBufferStore({
  graceMs = DEFAULT_PATH_BUFFER_GRACE_MS,
} = {}) {
  const rowsByMarketSlug = new Map();
  const windowsByMarketSlug = new Map();

  function pruneMarket(marketSlug) {
    const rows = rowsByMarketSlug.get(marketSlug);

    if (!rows) {
      return;
    }

    const pruned = pruneRows(rows, windowsByMarketSlug.get(marketSlug), graceMs);

    if (pruned.length === 0) {
      rowsByMarketSlug.delete(marketSlug);
      return;
    }

    rowsByMarketSlug.set(marketSlug, sortRows(pruned));
  }

  return {
    clearMarket(marketSlug) {
      rowsByMarketSlug.delete(marketSlug);
      windowsByMarketSlug.delete(marketSlug);
    },

    getRecentPath(marketSlug) {
      return (rowsByMarketSlug.get(marketSlug) ?? []).map((row) => ({ ...row }));
    },

    marketCount() {
      return rowsByMarketSlug.size;
    },

    pushSnapshot(snapshot) {
      const marketSlug = marketSlugFor(snapshot);
      const row = normalizeSnapshot(snapshot);

      if (!marketSlug || !row || !windowsByMarketSlug.has(marketSlug)) {
        return false;
      }

      const rows = rowsByMarketSlug.get(marketSlug) ?? [];
      const existingIndex = rows.findIndex(
        (candidate) => candidate.secondBucket === row.secondBucket,
      );

      if (existingIndex >= 0) {
        if (shouldReplace(rows[existingIndex], row)) {
          rows[existingIndex] = row;
        }
      } else {
        rows.push(row);
      }

      rowsByMarketSlug.set(
        marketSlug,
        sortRows(pruneRows(rows, windowsByMarketSlug.get(marketSlug), graceMs)),
      );
      return true;
    },

    pushSnapshots(snapshots) {
      let pushed = 0;

      for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
        if (this.pushSnapshot(snapshot)) {
          pushed += 1;
        }
      }

      return pushed;
    },

    rowCount(marketSlug = null) {
      if (marketSlug) {
        return rowsByMarketSlug.get(marketSlug)?.length ?? 0;
      }

      return [...rowsByMarketSlug.values()].reduce(
        (sum, rows) => sum + rows.length,
        0,
      );
    },

    syncActiveMarkets(markets) {
      const activeSlugs = new Set();

      for (const market of Array.isArray(markets) ? markets : []) {
        const window = normalizeWindow(market);

        if (!window) {
          continue;
        }

        activeSlugs.add(window.marketSlug);
        windowsByMarketSlug.set(window.marketSlug, window);
        pruneMarket(window.marketSlug);
      }

      for (const marketSlug of new Set([
        ...windowsByMarketSlug.keys(),
        ...rowsByMarketSlug.keys(),
      ])) {
        if (!activeSlugs.has(marketSlug)) {
          this.clearMarket(marketSlug);
        }
      }
    },
  };
}

export { DEFAULT_PATH_BUFFER_GRACE_MS };
