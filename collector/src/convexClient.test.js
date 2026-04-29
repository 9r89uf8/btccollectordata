import assert from "node:assert/strict";
import test from "node:test";

import { createIngestClient } from "./convexClient.js";

test("createIngestClient sends collector batches through the shared ingest envelope", async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let captured = null;

  Date.now = () => 1770000201234;
  globalThis.fetch = async (url, options) => {
    captured = {
      body: JSON.parse(options.body),
      headers: options.headers,
      method: options.method,
      url,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        results: {
          snapshots: {
            inserted: 1,
            skipped: 0,
          },
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  };

  try {
    const client = createIngestClient({
      collectorName: "collector-phase-8",
      convexSiteUrl: "https://example.convex.site/",
      ingestSharedSecret: "secret-phase-8",
    });
    const snapshots = [
      {
        marketSlug: "btc-updown-5m-1770000000",
        secondBucket: 1770000200000,
        ts: 1770000200123,
      },
    ];
    const response = await client.sendBatch({
      collectorName: "caller-should-not-override",
      secret: "caller-should-not-override",
      snapshots,
    });

    assert.equal(client.ingestUrl, "https://example.convex.site/ingest/polymarket");
    assert.equal(captured.url, client.ingestUrl);
    assert.equal(captured.method, "POST");
    assert.equal(captured.headers["Content-Type"], "application/json");
    assert.equal(captured.body.secret, "secret-phase-8");
    assert.equal(captured.body.collectorName, "collector-phase-8");
    assert.equal(captured.body.sentAt, 1770000201234);
    assert.deepEqual(captured.body.snapshots, snapshots);
    assert.equal(response.results.snapshots.inserted, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test("createIngestClient preserves explicit sentAt and reports non-OK responses", async () => {
  const originalFetch = globalThis.fetch;
  let captured = null;

  globalThis.fetch = async (url, options) => {
    captured = {
      body: JSON.parse(options.body),
      url,
    };

    return new Response("temporary outage", {
      status: 503,
    });
  };

  try {
    const client = createIngestClient({
      collectorName: "collector-phase-8",
      convexSiteUrl: "https://example.convex.site",
      ingestSharedSecret: "secret-phase-8",
    });

    await assert.rejects(
      () =>
        client.sendBatch({
          snapshots: [],
          sentAt: 1770000209876,
        }),
      /Convex ingest failed \(503\): temporary outage/,
    );
    assert.equal(captured.url, "https://example.convex.site/ingest/polymarket");
    assert.equal(captured.body.sentAt, 1770000209876);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createIngestClient rejects oversized batches before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called for oversized batches");
  };

  try {
    const client = createIngestClient({
      collectorName: "collector-phase-8",
      convexSiteUrl: "https://example.convex.site",
      ingestSharedSecret: "secret-phase-8",
    });

    await assert.rejects(
      () =>
        client.sendBatch({
          padding: "x".repeat(600 * 1024),
          sentAt: 1770000209876,
        }),
      /Ingest batch too large/,
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
