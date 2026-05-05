import assert from "node:assert/strict";
import test from "node:test";

import { loadCollectorConfig } from "./config.js";

const ENV_KEYS = [
  "CONVEX_URL",
  "CONVEX_SITE_URL",
  "COLLECT_CRYPTO_ASSETS",
  "CRYPTO_ASSETS",
  "INGEST_SHARED_SECRET",
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

test("loadCollectorConfig reads explicit Convex site URL from env", () => {
  withEnv(
    {
      CONVEX_URL: "https://example.convex.cloud",
      CONVEX_SITE_URL: "https://example.convex.site",
      INGEST_SHARED_SECRET: "test-secret",
    },
    () => {
      const config = loadCollectorConfig();

      assert.equal(config.convexSiteUrl, "https://example.convex.site");
      assert.deepEqual(config.cryptoAssets, ["btc", "eth"]);
    },
  );
});

test("loadCollectorConfig parses crypto asset collection list", () => {
  withEnv(
    {
      COLLECT_CRYPTO_ASSETS: "eth",
      CONVEX_URL: "https://example.convex.cloud",
      CONVEX_SITE_URL: "https://example.convex.site",
      INGEST_SHARED_SECRET: "test-secret",
    },
    () => {
      const config = loadCollectorConfig();

      assert.deepEqual(config.cryptoAssets, ["eth"]);
    },
  );
});
