import { CRYPTO_ASSETS } from "./ingest.js";

export const CRYPTO_PAIR_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const CRYPTO_PAIR_DEFAULT_ROW_LIMIT = 96;

function toFiniteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function normalizeOutcome(value) {
  return value === "up" || value === "down" ? value : null;
}

function getMarketAsset(market) {
  return market?.asset === CRYPTO_ASSETS.ETH
    ? CRYPTO_ASSETS.ETH
    : CRYPTO_ASSETS.BTC;
}

function compactMarket(market) {
  return {
    active: Boolean(market.active),
    closed: Boolean(market.closed),
    dataQuality: market.dataQuality ?? "unknown",
    marketId: market.marketId,
    question: market.question,
    resolved: Boolean(market.resolved),
    slug: market.slug,
    winningOutcome: normalizeOutcome(market.winningOutcome),
  };
}

function getPairStatus(pair) {
  if (!pair.btc) {
    return "missing_btc";
  }

  if (!pair.eth) {
    return "missing_eth";
  }

  if (!pair.btc.winningOutcome || !pair.eth.winningOutcome) {
    return "unresolved";
  }

  return pair.btc.winningOutcome === pair.eth.winningOutcome ? "same" : "opposite";
}

function increment(counter, key) {
  counter[key] = (counter[key] ?? 0) + 1;
}

export function buildBtcEthOutcomeComparison({
  lookbackMs = CRYPTO_PAIR_LOOKBACK_MS,
  markets = [],
  nowTs = Date.now(),
  rowLimit = CRYPTO_PAIR_DEFAULT_ROW_LIMIT,
} = {}) {
  const safeLookbackMs = Math.max(5 * 60 * 1000, Math.min(lookbackMs, 7 * 24 * 60 * 60 * 1000));
  const safeRowLimit = Math.max(1, Math.min(rowLimit, 300));
  const fromTs = nowTs - safeLookbackMs;
  const pairsByWindowStart = new Map();

  for (const market of markets) {
    const windowStartTs = toFiniteNumber(market?.windowStartTs);
    const windowEndTs = toFiniteNumber(market?.windowEndTs);

    if (
      windowStartTs === null ||
      windowEndTs === null ||
      windowStartTs < fromTs ||
      windowStartTs > nowTs
    ) {
      continue;
    }

    const asset = getMarketAsset(market);

    if (asset !== CRYPTO_ASSETS.BTC && asset !== CRYPTO_ASSETS.ETH) {
      continue;
    }

    const pair =
      pairsByWindowStart.get(windowStartTs) ?? {
        btc: null,
        eth: null,
        timestampSlug: String(Math.floor(windowStartTs / 1000)),
        windowEndTs,
        windowStartTs,
      };

    pair[asset] = compactMarket(market);
    pair.windowEndTs = Math.max(pair.windowEndTs, windowEndTs);
    pairsByWindowStart.set(windowStartTs, pair);
  }

  const pairs = [...pairsByWindowStart.values()]
    .sort((a, b) => b.windowStartTs - a.windowStartTs)
    .map((pair) => ({
      ...pair,
      status: getPairStatus(pair),
    }));
  const statusCounts = {
    missing_btc: 0,
    missing_eth: 0,
    opposite: 0,
    same: 0,
    unresolved: 0,
  };

  let btcMarkets = 0;
  let ethMarkets = 0;
  let pairedWindows = 0;
  let resolvedPairs = 0;

  for (const pair of pairs) {
    if (pair.btc) {
      btcMarkets += 1;
    }

    if (pair.eth) {
      ethMarkets += 1;
    }

    if (pair.btc && pair.eth) {
      pairedWindows += 1;
    }

    if (pair.status === "same" || pair.status === "opposite") {
      resolvedPairs += 1;
    }

    increment(statusCounts, pair.status);
  }

  return {
    fromTs,
    latestWindowStartTs: pairs[0]?.windowStartTs ?? null,
    lookbackMs: safeLookbackMs,
    pairs: pairs.slice(0, safeRowLimit),
    rowLimit: safeRowLimit,
    statusCounts,
    summary: {
      btcMarkets,
      ethMarkets,
      missingBtc: statusCounts.missing_btc,
      missingEth: statusCounts.missing_eth,
      oppositeOutcome: statusCounts.opposite,
      oppositeOutcomeRate:
        resolvedPairs > 0 ? statusCounts.opposite / resolvedPairs : null,
      pairedWindows,
      resolvedPairs,
      sameOutcome: statusCounts.same,
      sameOutcomeRate: resolvedPairs > 0 ? statusCounts.same / resolvedPairs : null,
      totalWindows: pairs.length,
      unresolvedPairs: statusCounts.unresolved,
    },
    toTs: nowTs,
  };
}
