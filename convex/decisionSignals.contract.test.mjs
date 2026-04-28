import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaPath = new URL("./schema.js", import.meta.url);
const ingestionPath = new URL("./internal/decisionSignalIngestion.js", import.meta.url);
const decisionSignalsPath = new URL("./decisionSignals.js", import.meta.url);

function sectionBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} section is missing`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `${end} marker is missing after ${start}`);
  return source.slice(startIndex, endIndex);
}

function assertOrdered(source, tokens) {
  let cursor = -1;

  for (const token of tokens) {
    const index = source.indexOf(token, cursor + 1);
    assert.notEqual(index, -1, `${token} is missing`);
    assert.ok(index > cursor, `${token} is out of order`);
    cursor = index;
  }
}

test("decision signal schema and ingestion share the stable dedupe key order", async () => {
  const [schema, ingestion] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(ingestionPath, "utf8"),
  ]);
  const indexSection = sectionBetween(
    schema,
    '.index("by_dedupe_key"',
    "]),",
  );
  const querySection = sectionBetween(
    ingestion,
    '.withIndex("by_dedupe_key"',
    ");",
  );
  const keyOrder = [
    "marketSlug",
    "decisionVersion",
    "checkpointSecond",
    "secondBucket",
  ];

  assertOrdered(indexSection, keyOrder.map((field) => `"${field}"`));
  assertOrdered(querySection, keyOrder.map((field) => `.eq("${field}"`));
  assert.ok(!indexSection.includes("evaluatedAt"));
  assert.ok(!indexSection.includes("engineRunId"));
});

test("phase 10 decision signal queries expose muted-enter and reason diagnostics", async () => {
  const source = await readFile(decisionSignalsPath, "utf8");
  const enterSection = sectionBetween(
    source,
    "export const listRecentEnters",
    "export const listByMarketSlug",
  );
  const statsSection = sectionBetween(
    source,
    "export const getReasonCodeStats",
    "export const getEnterCalibration",
  );
  const calibrationSection = sectionBetween(
    source,
    "export const getEnterCalibration",
    "});",
  );

  assert.ok(source.includes("export const listRecent = query"));
  assert.ok(source.includes("export const listRecentEnters = query"));
  assert.ok(source.includes("export const getReasonCodeStats = query"));
  assert.ok(source.includes("export const getEnterCalibration = query"));
  assert.ok(source.includes("export const listByMarketSlug = query"));
  assert.ok(source.includes("actionPreMute"));
  assert.ok(enterSection.includes("isWouldBeEnter"));
  assert.ok(statsSection.includes("dataQualityBlockers"));
  assert.ok(statsSection.includes("mutedEnterCount"));
  assert.ok(statsSection.includes("sampleWindowFor"));
  assert.ok(calibrationSection.includes("market_summaries"));
  assert.ok(calibrationSection.includes("resolvedOutcome"));
  assert.ok(calibrationSection.includes("winRate"));
});
