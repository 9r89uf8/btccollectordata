import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssetInfoByTokenId,
  createMarketStateStore,
  extractRawEventsFromMarketMessage,
} from "./state.js";

const baseMarket = {
  conditionId: "condition-1",
  marketId: "market-1",
  slug: "btc-updown-5m-test",
  tokenIdsByOutcome: {
    down: "down-token",
    up: "up-token",
  },
};

test("createMarketStateStore applies book and price-change messages into snapshot-ready maps", () => {
  const store = createMarketStateStore();

  store.applyMarketMessage({
    event_type: "book",
    asset_id: "up-token",
    asks: [
      { price: "0.53", size: "20" },
      { price: "0.54", size: "15" },
    ],
    bids: [
      { price: "0.51", size: "30" },
      { price: "0.5", size: "10" },
    ],
    hash: "book-hash",
    market: "condition-1",
    timestamp: "1757908892351",
  });

  store.applyMarketMessage({
    event_type: "price_change",
    market: "condition-1",
    price_changes: [
      {
        asset_id: "up-token",
        best_ask: "0.54",
        best_bid: "0.52",
        hash: "price-change-hash",
        price: "0.52",
        side: "BUY",
        size: "25",
      },
    ],
    timestamp: "1757908893351",
  });

  const marketData = store.buildMarketData();
  const book = marketData.booksByTokenId.get("up-token");

  assert.equal(book.bids[0].price, "0.52");
  assert.equal(book.asks[0].price, "0.53");
  assert.equal(marketData.midpointsByTokenId.get("up-token"), 0.53);
});

test("extractRawEventsFromMarketMessage fans out token-scoped price changes", () => {
  const rawEvents = extractRawEventsFromMarketMessage({
    collectorSeqStart: 40,
    ingestedAt: 1757908894000,
    marketsByAssetId: buildAssetInfoByTokenId([baseMarket]),
    message: {
      event_type: "price_change",
      market: "condition-1",
      price_changes: [
        {
          asset_id: "up-token",
          best_ask: "0.54",
          best_bid: "0.52",
          hash: "up-hash",
          price: "0.52",
          side: "BUY",
          size: "25",
        },
        {
          asset_id: "down-token",
          best_ask: "0.49",
          best_bid: "0.47",
          hash: "down-hash",
          price: "0.49",
          side: "SELL",
          size: "18",
        },
      ],
      timestamp: "1757908893351",
    },
  });

  assert.equal(rawEvents.length, 2);
  assert.deepEqual(
    rawEvents.map((event) => ({
      assetId: event.assetId,
      collectorSeq: event.collectorSeq,
      eventHash: event.eventHash,
      outcome: event.outcome,
    })),
    [
      {
        assetId: "up-token",
        collectorSeq: 40,
        eventHash: "up-hash",
        outcome: "up",
      },
      {
        assetId: "down-token",
        collectorSeq: 41,
        eventHash: "down-hash",
        outcome: "down",
      },
    ],
  );
});
