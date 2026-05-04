import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const componentPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "AnalyticsDashboard.js",
);

test("AnalyticsDashboard keeps retained panels and removes retired diagnostics", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.ok(source.includes("Stored markets by day"));
  assert.ok(source.includes("marketCountsByDay"));
  assert.ok(source.includes("Leader stability heatmap"));
  assert.ok(!source.includes("Checkpoint outcome decomposition"));
  assert.ok(!source.includes("Path archetypes"));
  assert.ok(!source.includes("Pre-checkpoint path shapes"));
  assert.ok(!source.includes("Distance x durability"));
  assert.ok(!source.includes("Distance x lead age"));
  assert.ok(!source.includes("Distance x 30s momentum"));
  assert.ok(!source.includes("Distance x chop"));
});
