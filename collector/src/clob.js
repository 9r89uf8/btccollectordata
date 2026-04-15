function trimTrailingSlash(url) {
  return String(url).replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function mapByTokenId(rows, keyFields = ["asset_id", "token_id"]) {
  const map = new Map();

  for (const row of rows) {
    const key = keyFields
      .map((field) => row?.[field])
      .find((value) => typeof value === "string" && value !== "");

    if (!key) {
      continue;
    }

    map.set(key, row);
  }

  return map;
}

async function postJson(config, path, body, label) {
  const maxAttempts = Math.max(1, config.clobMaxAttempts ?? 3);
  const retryBaseMs = Math.max(50, config.clobRetryBaseMs ?? 250);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${trimTrailingSlash(config.polymarketClobBase)}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.clobRequestTimeoutMs),
      });

      if (response.ok) {
        return await response.json();
      }

      const error = new Error(`${label} request failed: ${response.status}`);
      error.status = response.status;
      lastError = error;

      if (
        attempt >= maxAttempts ||
        (response.status !== 429 && response.status < 500)
      ) {
        throw error;
      }
    } catch (error) {
      lastError = error;

      const retryable =
        error?.status === 429 ||
        error?.name === "AbortError" ||
        error?.status >= 500 ||
        error instanceof TypeError;

      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
    }

    await sleep(retryBaseMs * 2 ** (attempt - 1));
  }

  throw lastError ?? new Error(`${label} request failed`);
}

function buildTokenRequests(tokenIds) {
  return tokenIds.map((tokenId) => ({ token_id: tokenId }));
}

function normalizeLastTradesPayload(lastTrades) {
  if (Array.isArray(lastTrades)) {
    return mapByTokenId(lastTrades);
  }

  if (!lastTrades || typeof lastTrades !== "object") {
    return new Map();
  }

  const rows = Object.entries(lastTrades).map(([tokenId, value]) =>
    typeof value === "object" && value !== null
      ? { token_id: tokenId, ...value }
      : { token_id: tokenId, price: value },
  );

  return mapByTokenId(rows);
}

function normalizeLastTradesRows(lastTrades) {
  if (Array.isArray(lastTrades)) {
    return lastTrades;
  }

  if (!lastTrades || typeof lastTrades !== "object") {
    return [];
  }

  return Object.entries(lastTrades).map(([tokenId, value]) =>
    typeof value === "object" && value !== null
      ? { token_id: tokenId, ...value }
      : { token_id: tokenId, price: value },
  );
}

export async function fetchClobMarketData(config, tokenIds) {
  if (!Array.isArray(tokenIds) || tokenIds.length === 0) {
    return {
      booksByTokenId: new Map(),
      endpointErrors: [],
      lastTradesByTokenId: new Map(),
      midpointsByTokenId: new Map(),
    };
  }

  const batches = chunk(tokenIds, Math.max(1, Math.min(config.clobBatchSize, 500)));
  const allBooks = [];
  const allLastTrades = [];
  const allMidpoints = new Map();
  const endpointErrors = [];

  for (const tokenBatch of batches) {
    const payload = buildTokenRequests(tokenBatch);
    const requests = [
      {
        name: "books",
        promise: postJson(config, "/books", payload, "books"),
      },
      {
        name: "last-trades-prices",
        promise: postJson(config, "/last-trades-prices", payload, "last-trades-prices"),
      },
      {
        name: "midpoints",
        promise: postJson(config, "/midpoints", payload, "midpoints"),
      },
    ];
    const results = await Promise.allSettled(requests.map((request) => request.promise));
    let fulfilledCount = 0;

    for (const [index, result] of results.entries()) {
      const requestName = requests[index].name;

      if (result.status === "rejected") {
        endpointErrors.push(`${requestName}: ${result.reason?.message ?? "request failed"}`);
        continue;
      }

      fulfilledCount += 1;
      const payloadValue = result.value;

      if (requestName === "books") {
        if (Array.isArray(payloadValue)) {
          allBooks.push(...payloadValue);
        }

        continue;
      }

      if (requestName === "last-trades-prices") {
        allLastTrades.push(...normalizeLastTradesRows(payloadValue));
        continue;
      }

      if (payloadValue && typeof payloadValue === "object") {
        for (const [tokenId, midpoint] of Object.entries(payloadValue)) {
          allMidpoints.set(tokenId, midpoint);
        }
      }
    }

    if (fulfilledCount === 0) {
      const error = new Error(
        `All CLOB endpoints failed for batch: ${endpointErrors.slice(-3).join("; ")}`,
      );
      error.code = "CLOB_BATCH_FAILED";
      throw error;
    }
  }

  return {
    booksByTokenId: mapByTokenId(allBooks),
    endpointErrors,
    lastTradesByTokenId: normalizeLastTradesPayload(allLastTrades),
    midpointsByTokenId: allMidpoints,
  };
}
