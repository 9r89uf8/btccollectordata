import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import {
  PAPER_DYNAMIC_SIZING_STRATEGY_VERSION,
  PAPER_STRATEGY_VERSION,
  maybeCreatePaperDecision,
  settlePaperTrade,
} from "../packages/shared/src/paperTradingEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const entries = {};

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

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

function readEnv(name, fallback, fileEnv) {
  if (process.env[name]) {
    return process.env[name];
  }

  return fileEnv[name] ?? fallback;
}

function parseArgs(argv) {
  const options = {
    decisionEndSecond: 285,
    decisionStartSecond: 220,
    intervalMs: 1000,
    limitOpen: 100,
    once: false,
    runId: `paper-agent-${new Date().toISOString()}`,
    sizingMode: "flat",
    stakeUsd: 5,
    strategyVersionExplicit: false,
    strategyVersion: PAPER_STRATEGY_VERSION,
  };

  function readPositiveNumber(value, fallback) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--once") {
      options.once = true;
    } else if (arg === "--decision-start-second" && next) {
      options.decisionStartSecond = Math.floor(
        readPositiveNumber(next, options.decisionStartSecond),
      );
      index += 1;
    } else if (arg === "--decision-end-second" && next) {
      options.decisionEndSecond = Math.floor(
        readPositiveNumber(next, options.decisionEndSecond),
      );
      index += 1;
    } else if (arg === "--interval-ms" && next) {
      options.intervalMs = Math.max(250, readPositiveNumber(next, options.intervalMs));
      index += 1;
    } else if (arg === "--limit-open" && next) {
      options.limitOpen = Math.max(1, Math.floor(readPositiveNumber(next, options.limitOpen)));
      index += 1;
    } else if (arg === "--run-id" && next) {
      options.runId = next;
      index += 1;
    } else if (arg === "--sizing-mode" && next) {
      options.sizingMode = ["flat", "dynamic"].includes(next)
        ? next
        : options.sizingMode;
      index += 1;
    } else if (arg === "--stake-usd" && next) {
      options.stakeUsd = readPositiveNumber(next, options.stakeUsd);
      index += 1;
    } else if (arg === "--strategy-version" && next) {
      options.strategyVersion = next;
      options.strategyVersionExplicit = true;
      index += 1;
    }
  }

  if (options.sizingMode === "dynamic" && !options.strategyVersionExplicit) {
    options.strategyVersion = PAPER_DYNAMIC_SIZING_STRATEGY_VERSION;
  }

  if (!Number.isFinite(options.stakeUsd) || options.stakeUsd <= 0) {
    throw new Error("--stake-usd must be a positive number");
  }

  if (options.decisionStartSecond > options.decisionEndSecond) {
    throw new Error("--decision-start-second must be <= --decision-end-second");
  }

  return options;
}

function createClient() {
  const fileEnv = {
    ...parseEnvFile(path.join(repoRoot, ".env.local")),
    ...parseEnvFile(path.join(repoRoot, "collector", ".env")),
    ...parseEnvFile(path.join(repoRoot, "collector", ".env.local")),
  };
  const convexUrl =
    readEnv("CONVEX_URL", null, fileEnv) ??
    readEnv("NEXT_PUBLIC_CONVEX_URL", null, fileEnv);

  if (!convexUrl) {
    throw new Error("Missing CONVEX_URL or NEXT_PUBLIC_CONVEX_URL");
  }

  return new ConvexHttpClient(convexUrl, {
    logger: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function incrementReason(reasons, reason) {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function formatReasons(reasons) {
  const entries = Object.entries(reasons ?? {}).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([reason, count]) => `${reason}:${count}`).join(",");
}

async function settleOpenTrades(client, options) {
  const openTrades = await client.query("paperTrades:listOpen", {
    limit: options.limitOpen,
  });
  let settled = 0;

  for (const trade of openTrades) {
    if (trade.windowEndTs > Date.now()) {
      continue;
    }

    const market = await client.query("markets:getBySlug", {
      slug: trade.marketSlug,
    });
    const settlement = settlePaperTrade({
      market,
      trade,
    });

    if (settlement.action !== "settle") {
      continue;
    }

    await client.mutation("paperTrades:settle", {
      id: trade._id,
      result: settlement.result,
    });
    settled += 1;
  }

  return settled;
}

async function evaluateActiveMarkets(client, options) {
  const [markets, latestBtc] = await Promise.all([
    client.query("markets:listActiveBtc5m", {}),
    client.query("btc:getLatestChainlinkBtc", {}),
  ]);
  let inserted = 0;
  let skipped = 0;
  const skipReasons = {};

  for (const market of markets) {
    if (Date.now() < market.windowStartTs || Date.now() > market.windowEndTs) {
      skipped += 1;
      incrementReason(skipReasons, "upcoming_or_ended");
      continue;
    }

    const existing = await client.query("paperTrades:getByMarketSlug", {
      marketSlug: market.slug,
      strategyVersion: options.strategyVersion,
    });

    if (existing) {
      skipped += 1;
      incrementReason(skipReasons, "existing_paper_trade");
      continue;
    }

    const snapshots = await client.query("snapshots:listByMarketSlug", {
      limit: 400,
      slug: market.slug,
    });
    const decision = maybeCreatePaperDecision({
      config: {
        decisionEndSecond: options.decisionEndSecond,
        decisionStartSecond: options.decisionStartSecond,
        sizingMode: options.sizingMode,
        stakeUsd: options.stakeUsd,
        strategyVersion: options.strategyVersion,
      },
      latestBtcTick: latestBtc,
      market,
      nowTs: Date.now(),
      runId: options.runId,
      snapshots,
      stakeUsd: options.stakeUsd,
      strategyVersion: options.strategyVersion,
    });

    if (decision.action !== "paper_trade") {
      skipped += 1;
      incrementReason(skipReasons, decision.reason);
      continue;
    }

    const result = await client.mutation("paperTrades:insertDecision", {
      trade: decision.trade,
    });

    inserted += result.inserted ? 1 : 0;
  }

  return {
    inserted,
    scanned: markets.length,
    skipped,
    skipReasons,
  };
}

async function runOnce(client, options) {
  const settled = await settleOpenTrades(client, options);
  const active = await evaluateActiveMarkets(client, options);

  return {
    ...active,
    settled,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = createClient();

  console.log(
    `Paper agent starting: strategy=${options.strategyVersion} sizing=${options.sizingMode} window=T+${options.decisionStartSecond}-${options.decisionEndSecond} runId=${options.runId} once=${options.once}`,
  );

  do {
    const startedAt = Date.now();
    const result = await runOnce(client, options);

    console.log(
      `[${new Date().toISOString()}] scanned=${result.scanned} inserted=${result.inserted} settled=${result.settled} skipped=${result.skipped} skipReasons=${formatReasons(result.skipReasons)}`,
    );

    if (options.once) {
      break;
    }

    await sleep(Math.max(0, options.intervalMs - (Date.now() - startedAt)));
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
