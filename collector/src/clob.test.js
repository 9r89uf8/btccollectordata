import test from "node:test";
import assert from "node:assert/strict";

import { fetchClobMarketData } from "./clob.js";

const baseConfig = {
  polymarketClobBase: "https://clob.example.com",
  clobBatchSize: 500,
  clobRequestTimeoutMs: 1000,
  clobMaxAttempts: 3,
  clobRetryBaseMs: 1,
};

test("fetchClobMarketData retries retryable failures and keeps partial endpoint data", async () => {
  const originalFetch = globalThis.fetch;
  const callCounts = {
    books: 0,
    lastTrades: 0,
    midpoints: 0,
  };

  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;

    if (pathname === "/books") {
      callCounts.books += 1;
      return new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (pathname === "/last-trades-prices") {
      callCounts.lastTrades += 1;
      return new Response(
        JSON.stringify({
          "up-token": { price: 0.51 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (pathname === "/midpoints") {
      callCounts.midpoints += 1;
      return new Response(
        JSON.stringify({
          "up-token": "0.50",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected path: ${pathname}`);
  };

  try {
    const result = await fetchClobMarketData(baseConfig, ["up-token"]);

    assert.equal(callCounts.books, 3);
    assert.equal(callCounts.lastTrades, 1);
    assert.equal(callCounts.midpoints, 1);
    assert.equal(result.endpointErrors.length, 1);
    assert.match(result.endpointErrors[0], /books/);
    assert.equal(result.lastTradesByTokenId.get("up-token").price, 0.51);
    assert.equal(result.midpointsByTokenId.get("up-token"), "0.50");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchClobMarketData throws when every CLOB endpoint fails", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      fetchClobMarketData(baseConfig, ["up-token"]),
      /All CLOB endpoints failed/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
