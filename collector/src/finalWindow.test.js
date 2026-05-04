import assert from "node:assert/strict";
import test from "node:test";

import { getFinalWindowMarkets } from "./finalWindow.js";

const windowStartTs = Date.UTC(2026, 4, 4, 19, 5, 0);
const windowEndTs = windowStartTs + 5 * 60 * 1000;
const finalMarket = {
  slug: "btc-updown-5m-final",
  windowEndTs,
};
const earlyMarket = {
  slug: "btc-updown-5m-early",
  windowEndTs: windowEndTs + 60_000,
};

test("getFinalWindowMarkets selects only markets inside the final window", () => {
  const selected = getFinalWindowMarkets(
    [finalMarket, earlyMarket],
    windowEndTs - 10_000,
    10_000,
  );

  assert.deepEqual(
    selected.map((market) => market.slug),
    ["btc-updown-5m-final"],
  );
});

test("getFinalWindowMarkets excludes markets before the final window", () => {
  const selected = getFinalWindowMarkets(
    [finalMarket],
    windowEndTs - 11_000,
    10_000,
  );

  assert.deepEqual(selected, []);
});

test("getFinalWindowMarkets keeps the close bucket when the poll lands after close", () => {
  const selected = getFinalWindowMarkets(
    [finalMarket],
    windowEndTs + 850,
    10_000,
  );

  assert.deepEqual(
    selected.map((market) => market.slug),
    ["btc-updown-5m-final"],
  );
});

test("getFinalWindowMarkets ignores markets after the close bucket", () => {
  const selected = getFinalWindowMarkets(
    [finalMarket],
    windowEndTs + 1000,
    10_000,
  );

  assert.deepEqual(selected, []);
});
