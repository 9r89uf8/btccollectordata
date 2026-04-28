import assert from "node:assert/strict";
import test from "node:test";

import { loadCollectorConfig } from "./config.js";

const ENV_KEYS = [
  "CONVEX_URL",
  "CONVEX_SITE_URL",
  "INGEST_SHARED_SECRET",
  "DECISION_PERSIST_OFF_CHECKPOINT_WAITS",
];

function withEnv(values, fn) {
  const previous = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  Object.assign(process.env, values);

  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("off-checkpoint decision persistence is not a silent no-op", () => {
  withEnv(
    {
      CONVEX_URL: "https://example.convex.cloud",
      DECISION_PERSIST_OFF_CHECKPOINT_WAITS: "true",
      INGEST_SHARED_SECRET: "test-secret",
    },
    () => {
      assert.throws(
        () => loadCollectorConfig(),
        /DECISION_PERSIST_OFF_CHECKPOINT_WAITS is not supported/,
      );
    },
  );
});
