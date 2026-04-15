import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMarketSubscriptionRequest,
  buildMarketSubscriptionUpdate,
  parseMarketSocketPayload,
} from "./marketWs.js";

test("market ws subscription helpers normalize asset ids", () => {
  assert.deepEqual(buildMarketSubscriptionRequest(["a", "b", "a"]), {
    assets_ids: ["a", "b"],
    custom_feature_enabled: true,
    type: "market",
  });

  assert.deepEqual(buildMarketSubscriptionUpdate("subscribe", ["x", "", "x"]), {
    assets_ids: ["x"],
    operation: "subscribe",
  });
});

test("parseMarketSocketPayload ignores heartbeat payloads and keeps event messages", () => {
  assert.deepEqual(parseMarketSocketPayload("{}"), []);
  assert.deepEqual(parseMarketSocketPayload("PING"), []);
  assert.deepEqual(parseMarketSocketPayload("PONG"), []);
  assert.deepEqual(
    parseMarketSocketPayload(
      JSON.stringify([
        {},
        {
          event_type: "book",
          asset_id: "asset-1",
        },
      ]),
    ),
    [
      {
        event_type: "book",
        asset_id: "asset-1",
      },
    ],
  );
});
