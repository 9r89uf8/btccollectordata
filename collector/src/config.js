import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_COLLECTOR_NAME } from "../../packages/shared/src/ingest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const entries = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

function mergeEnvSources() {
  const envFiles = [
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, "collector", ".env"),
    path.join(repoRoot, "collector", ".env.local"),
  ];

  return envFiles.reduce((accumulator, filePath) => {
    return {
      ...accumulator,
      ...parseEnvFile(filePath),
    };
  }, {});
}

function readEnv(name, fallback, fileEnv) {
  if (typeof process.env[name] === "string" && process.env[name] !== "") {
    return process.env[name];
  }

  if (typeof fileEnv[name] === "string" && fileEnv[name] !== "") {
    return fileEnv[name];
  }

  return fallback;
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function deriveConvexSiteUrl(convexUrl) {
  if (typeof convexUrl !== "string" || convexUrl.trim() === "") {
    return null;
  }

  try {
    const url = new URL(convexUrl);

    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/i, ".convex.site");
      return url.toString().replace(/\/$/, "");
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function loadCollectorConfig() {
  const fileEnv = mergeEnvSources();

  const convexUrl =
    readEnv("CONVEX_URL", null, fileEnv) ??
    readEnv("NEXT_PUBLIC_CONVEX_URL", null, fileEnv);
  const convexSiteUrl =
    readEnv("CONVEX_SITE_URL", null, fileEnv) ??
    readEnv("NEXT_PUBLIC_CONVEX_SITE_URL", null, fileEnv) ??
    deriveConvexSiteUrl(convexUrl);

  const config = {
    collectorName: readEnv("COLLECTOR_NAME", DEFAULT_COLLECTOR_NAME, fileEnv),
    convexUrl,
    convexSiteUrl,
    ingestSharedSecret: readEnv("INGEST_SHARED_SECRET", null, fileEnv),
    polymarketClobBase: readEnv(
      "POLYMARKET_CLOB_BASE",
      "https://clob.polymarket.com",
      fileEnv,
    ),
    polymarketMarketWss: readEnv(
      "POLYMARKET_MARKET_WSS",
      "wss://ws-subscriptions-clob.polymarket.com/ws/market",
      fileEnv,
    ),
    polymarketRtdsWss: readEnv(
      "POLYMARKET_RTDS_WSS",
      "wss://ws-live-data.polymarket.com",
      fileEnv,
    ),
    collectorBatchMs: toNumber(
      readEnv("COLLECTOR_BATCH_MS", "1000", fileEnv),
      1000,
    ),
    collectorHeartbeatMs: toNumber(
      readEnv("COLLECTOR_HEARTBEAT_MS", "30000", fileEnv),
      30000,
    ),
    rtdsHeartbeatMs: toNumber(
      readEnv("RTDS_HEARTBEAT_MS", "5000", fileEnv),
      5000,
    ),
    rtdsConnectTimeoutMs: toNumber(
      readEnv("RTDS_CONNECT_TIMEOUT_MS", "10000", fileEnv),
      10000,
    ),
    marketHeartbeatMs: toNumber(
      readEnv("MARKET_WS_HEARTBEAT_MS", "10000", fileEnv),
      10000,
    ),
    marketConnectTimeoutMs: toNumber(
      readEnv("MARKET_WS_CONNECT_TIMEOUT_MS", "10000", fileEnv),
      10000,
    ),
    activeMarketsRefreshMs: toNumber(
      readEnv("ACTIVE_MARKETS_REFRESH_MS", "15000", fileEnv),
      15000,
    ),
    snapshotPollMs: toNumber(
      readEnv("SNAPSHOT_POLL_MS", "1000", fileEnv),
      1000,
    ),
    clobBatchSize: toNumber(readEnv("CLOB_BATCH_SIZE", "500", fileEnv), 500),
    clobRequestTimeoutMs: toNumber(
      readEnv("CLOB_REQUEST_TIMEOUT_MS", "10000", fileEnv),
      10000,
    ),
    clobMaxAttempts: toNumber(readEnv("CLOB_MAX_ATTEMPTS", "3", fileEnv), 3),
    clobRetryBaseMs: toNumber(readEnv("CLOB_RETRY_BASE_MS", "250", fileEnv), 250),
    enableBinanceContext: toBoolean(
      readEnv("ENABLE_BINANCE_CONTEXT", "false", fileEnv),
      false,
    ),
    enableMarketWs: toBoolean(
      readEnv("ENABLE_MARKET_WS", "true", fileEnv),
      true,
    ),
    persistMarketRawEvents: toBoolean(
      readEnv("PERSIST_MARKET_RAW_EVENTS", "true", fileEnv),
      true,
    ),
    marketWsPrimary: toBoolean(
      readEnv("MARKET_WS_PRIMARY", "false", fileEnv),
      false,
    ),
    marketWsParityTolerance: toNumber(
      readEnv("MARKET_WS_PARITY_TOLERANCE", "0.03", fileEnv),
      0.03,
    ),
    logLevel: readEnv("LOG_LEVEL", "info", fileEnv),
    exitAfterMs: toNumber(readEnv("COLLECTOR_EXIT_AFTER_MS", "", fileEnv), null),
  };

  const missing = [];

  if (!config.convexUrl) {
    missing.push("CONVEX_URL");
  }

  if (!config.convexSiteUrl) {
    missing.push("CONVEX_SITE_URL or CONVEX_URL");
  }

  if (!config.ingestSharedSecret) {
    missing.push("INGEST_SHARED_SECRET");
  }

  if (missing.length > 0) {
    const error = new Error(
      `Collector config is incomplete. Missing: ${missing.join(", ")}`,
    );
    error.code = "CONFIG_INVALID";
    throw error;
  }

  return config;
}
