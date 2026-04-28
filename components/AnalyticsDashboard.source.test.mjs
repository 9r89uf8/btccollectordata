import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const componentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "AnalyticsDashboard.js",
);

test("AnalyticsDashboard includes diagnostic metric and chop-threshold labels", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.ok(
    source.includes("SW {pct(cell.stableLeaderWinRate)} / FL {pct(cell.flipLossRate)}"),
  );
  assert.ok(
    source.includes("SW {pct(cell?.stableLeaderWinRate)} / FL {pct(cell?.flipLossRate)}"),
  );
  assert.ok(source.includes("Chop bucket definitions"));
  assert.ok(source.includes("Pooled chop rank"));
  assert.ok(source.includes("Near-line rank"));
  assert.ok(source.includes("Oscillation rank"));
  assert.ok(source.includes("p90 dd"));
});
