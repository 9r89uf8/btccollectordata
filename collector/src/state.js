import { normalizeFeedTimestamp } from "../../packages/shared/src/snapshot.js";

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTimestamp(value, fallbackTs = null) {
  return normalizeFeedTimestamp(value) ?? fallbackTs;
}

function createTokenState(assetId) {
  return {
    assetId,
    bestBidAsk: null,
    book: {
      asks: new Map(),
      bids: new Map(),
      hash: null,
      lastTradePrice: null,
      market: null,
      timestamp: null,
    },
    lastTrade: null,
    tickSize: null,
  };
}

function resetLevels(levelMap, levels) {
  levelMap.clear();

  for (const level of Array.isArray(levels) ? levels : []) {
    const price = toFiniteNumber(level?.price);
    const size = toFiniteNumber(level?.size);

    if (price === null || size === null || size <= 0) {
      continue;
    }

    levelMap.set(price, size);
  }
}

function updateLevel(levelMap, priceValue, sizeValue) {
  const price = toFiniteNumber(priceValue);
  const size = toFiniteNumber(sizeValue);

  if (price === null) {
    return;
  }

  if (size === null || size <= 0) {
    levelMap.delete(price);
    return;
  }

  levelMap.set(price, size);
}

function buildSortedLevels(levelMap, side, limit = 25) {
  const multiplier = side === "bids" ? -1 : 1;

  return [...levelMap.entries()]
    .sort((a, b) => (a[0] - b[0]) * multiplier)
    .slice(0, limit)
    .map(([price, size]) => ({
      price: String(price),
      size: String(size),
    }));
}

function getTopPrice(levelMap, side) {
  const levels = buildSortedLevels(levelMap, side, 1);

  if (levels.length === 0) {
    return null;
  }

  return toFiniteNumber(levels[0].price);
}

function getTopSize(levelMap, side) {
  const levels = buildSortedLevels(levelMap, side, 1);

  if (levels.length === 0) {
    return null;
  }

  return toFiniteNumber(levels[0].size);
}

function deriveSpread(bestBid, bestAsk) {
  if (bestBid === null || bestAsk === null) {
    return null;
  }

  return bestAsk - bestBid;
}

function applyBestBidAsk(tokenState, input, fallbackTs) {
  const bestBid = toFiniteNumber(input?.best_bid);
  const bestAsk = toFiniteNumber(input?.best_ask);
  const spread = toFiniteNumber(input?.spread) ?? deriveSpread(bestBid, bestAsk);
  const timestamp = normalizeTimestamp(input?.timestamp, fallbackTs);

  if (bestBid === null && bestAsk === null && spread === null) {
    return;
  }

  tokenState.bestBidAsk = {
    asset_id: tokenState.assetId,
    best_ask: bestAsk,
    best_bid: bestBid,
    spread,
    timestamp,
  };
}

function syncBestBidAskFromBook(tokenState) {
  applyBestBidAsk(
    tokenState,
    {
      best_ask: getTopPrice(tokenState.book.asks, "asks"),
      best_bid: getTopPrice(tokenState.book.bids, "bids"),
      timestamp: tokenState.book.timestamp,
    },
    tokenState.book.timestamp,
  );
}

function buildMidpointValue(tokenState) {
  const bestBid =
    toFiniteNumber(tokenState.bestBidAsk?.best_bid) ??
    getTopPrice(tokenState.book.bids, "bids");
  const bestAsk =
    toFiniteNumber(tokenState.bestBidAsk?.best_ask) ??
    getTopPrice(tokenState.book.asks, "asks");

  if (bestBid === null || bestAsk === null) {
    return null;
  }

  return (bestBid + bestAsk) / 2;
}

function normalizeRawEventType(message) {
  return typeof message?.event_type === "string" ? message.event_type : null;
}

function normalizeAssetIds(message) {
  if (typeof message?.asset_id === "string" && message.asset_id !== "") {
    return [message.asset_id];
  }

  const assetIds =
    Array.isArray(message?.assets_ids)
      ? message.assets_ids
      : Array.isArray(message?.clob_token_ids)
        ? message.clob_token_ids
        : [];

  return assetIds.filter((assetId) => typeof assetId === "string" && assetId !== "");
}

export function buildAssetInfoByTokenId(markets) {
  const byTokenId = new Map();

  for (const market of Array.isArray(markets) ? markets : []) {
    if (market?.tokenIdsByOutcome?.up) {
      byTokenId.set(market.tokenIdsByOutcome.up, {
        conditionId: market.conditionId ?? null,
        marketId: market.marketId,
        marketSlug: market.slug,
        outcome: "up",
      });
    }

    if (market?.tokenIdsByOutcome?.down) {
      byTokenId.set(market.tokenIdsByOutcome.down, {
        conditionId: market.conditionId ?? null,
        marketId: market.marketId,
        marketSlug: market.slug,
        outcome: "down",
      });
    }
  }

  return byTokenId;
}

export function extractRawEventsFromMarketMessage({
  collectorSeqStart = 0,
  ingestedAt = Date.now(),
  marketsByAssetId,
  message,
}) {
  const eventType = normalizeRawEventType(message);

  if (!eventType) {
    return [];
  }

  const createEvent = ({
    assetId,
    eventHash = null,
    payload,
    ts,
  }) => {
    const marketInfo = marketsByAssetId.get(assetId);

    if (!marketInfo) {
      return null;
    }

    return {
      assetId,
      collectorSeq: collectorSeqStart,
      conditionId: marketInfo.conditionId ?? null,
      eventHash,
      eventType,
      ingestedAt,
      marketId: marketInfo.marketId,
      marketSlug: marketInfo.marketSlug,
      outcome: marketInfo.outcome,
      payload,
      ts,
    };
  };

  if (eventType === "price_change") {
    return (Array.isArray(message.price_changes) ? message.price_changes : [])
      .map((priceChange, index) =>
        createEvent({
          assetId: priceChange?.asset_id,
          eventHash:
            typeof priceChange?.hash === "string" ? priceChange.hash : null,
          payload: {
            ...priceChange,
            market: message.market ?? null,
            timestamp: message.timestamp ?? null,
          },
          ts: normalizeTimestamp(priceChange?.timestamp ?? message.timestamp, ingestedAt),
          collectorSeqStart,
          index,
        }),
      )
      .filter(Boolean)
      .map((event, index) => ({
        ...event,
        collectorSeq: collectorSeqStart + index,
      }));
  }

  const assetIds = normalizeAssetIds(message);

  return assetIds
    .map((assetId, index) =>
      createEvent({
        assetId,
        eventHash:
          typeof message?.hash === "string"
            ? message.hash
            : typeof message?.transaction_hash === "string"
              ? message.transaction_hash
              : null,
        payload: message,
        ts: normalizeTimestamp(message?.timestamp, ingestedAt),
        collectorSeqStart,
        index,
      }),
    )
    .filter(Boolean)
    .map((event, index) => ({
      ...event,
      collectorSeq: collectorSeqStart + index,
    }));
}

export function createMarketStateStore() {
  const tokenStateById = new Map();

  function ensureTokenState(assetId) {
    const assetKey = String(assetId);

    if (!tokenStateById.has(assetKey)) {
      tokenStateById.set(assetKey, createTokenState(assetKey));
    }

    return tokenStateById.get(assetKey);
  }

  function applyBookMessage(message) {
    const assetId = message?.asset_id;

    if (typeof assetId !== "string" || assetId === "") {
      return;
    }

    const tokenState = ensureTokenState(assetId);

    resetLevels(tokenState.book.bids, message.bids);
    resetLevels(tokenState.book.asks, message.asks);
    tokenState.book.hash =
      typeof message.hash === "string" ? message.hash : tokenState.book.hash;
    tokenState.book.lastTradePrice = toFiniteNumber(message.last_trade_price);
    tokenState.book.market =
      typeof message.market === "string" ? message.market : tokenState.book.market;
    tokenState.book.timestamp = normalizeTimestamp(
      message.timestamp,
      tokenState.book.timestamp,
    );
    syncBestBidAskFromBook(tokenState);
  }

  function applyPriceChangeMessage(message) {
    const timestamp = normalizeTimestamp(message?.timestamp, Date.now());

    for (const priceChange of Array.isArray(message?.price_changes)
      ? message.price_changes
      : []) {
      const assetId = priceChange?.asset_id;

      if (typeof assetId !== "string" || assetId === "") {
        continue;
      }

      const tokenState = ensureTokenState(assetId);
      const side =
        typeof priceChange.side === "string" &&
        priceChange.side.toUpperCase() === "BUY"
          ? "bids"
          : "asks";

      updateLevel(tokenState.book[side], priceChange.price, priceChange.size);
      tokenState.book.market =
        typeof message.market === "string" ? message.market : tokenState.book.market;
      tokenState.book.timestamp = timestamp;
      applyBestBidAsk(tokenState, priceChange, timestamp);
    }
  }

  function applyLastTradeMessage(message) {
    const assetId = message?.asset_id;

    if (typeof assetId !== "string" || assetId === "") {
      return;
    }

    const tokenState = ensureTokenState(assetId);
    const timestamp = normalizeTimestamp(message.timestamp, Date.now());

    tokenState.lastTrade = {
      asset_id: assetId,
      fee_rate_bps: toFiniteNumber(message.fee_rate_bps),
      price: toFiniteNumber(message.price),
      side:
        typeof message.side === "string" ? message.side.toUpperCase() : null,
      size: toFiniteNumber(message.size),
      timestamp,
      transaction_hash:
        typeof message.transaction_hash === "string"
          ? message.transaction_hash
          : null,
    };

    if (tokenState.book) {
      tokenState.book.lastTradePrice = tokenState.lastTrade.price;
    }
  }

  function applyBestBidAskMessage(message) {
    const assetId = message?.asset_id;

    if (typeof assetId !== "string" || assetId === "") {
      return;
    }

    const tokenState = ensureTokenState(assetId);

    applyBestBidAsk(
      tokenState,
      message,
      normalizeTimestamp(message.timestamp, Date.now()),
    );
  }

  function applyTickSizeMessage(message) {
    const assetId = message?.asset_id;

    if (typeof assetId !== "string" || assetId === "") {
      return;
    }

    const tokenState = ensureTokenState(assetId);

    tokenState.tickSize = {
      newTickSize: toFiniteNumber(message.new_tick_size),
      oldTickSize: toFiniteNumber(message.old_tick_size),
      timestamp: normalizeTimestamp(message.timestamp, Date.now()),
    };
  }

  return {
    applyMarketMessage(message) {
      const eventType = normalizeRawEventType(message);

      if (eventType === "book") {
        applyBookMessage(message);
        return;
      }

      if (eventType === "price_change") {
        applyPriceChangeMessage(message);
        return;
      }

      if (eventType === "last_trade_price") {
        applyLastTradeMessage(message);
        return;
      }

      if (eventType === "best_bid_ask") {
        applyBestBidAskMessage(message);
        return;
      }

      if (eventType === "tick_size_change") {
        applyTickSizeMessage(message);
      }
    },

    buildMarketData() {
      const booksByTokenId = new Map();
      const lastTradesByTokenId = new Map();
      const midpointsByTokenId = new Map();

      for (const [assetId, tokenState] of tokenStateById.entries()) {
        const bids = buildSortedLevels(tokenState.book.bids, "bids");
        const asks = buildSortedLevels(tokenState.book.asks, "asks");

        if (bids.length > 0 || asks.length > 0) {
          booksByTokenId.set(assetId, {
            asks,
            asset_id: assetId,
            bids,
            hash: tokenState.book.hash,
            last_trade_price: tokenState.book.lastTradePrice,
            market: tokenState.book.market,
            timestamp: tokenState.book.timestamp,
          });
        }

        if (tokenState.lastTrade?.price !== null) {
          lastTradesByTokenId.set(assetId, tokenState.lastTrade);
        }

        const midpoint = buildMidpointValue(tokenState);

        if (midpoint !== null) {
          midpointsByTokenId.set(assetId, midpoint);
        }
      }

      return {
        booksByTokenId,
        endpointErrors: [],
        lastTradesByTokenId,
        midpointsByTokenId,
      };
    },

    removeAssetIds(assetIds) {
      for (const assetId of Array.isArray(assetIds) ? assetIds : []) {
        tokenStateById.delete(String(assetId));
      }
    },

    size() {
      return tokenStateById.size;
    },

    getTokenState(assetId) {
      return tokenStateById.get(String(assetId)) ?? null;
    },
  };
}
