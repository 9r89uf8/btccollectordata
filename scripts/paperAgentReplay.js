import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import {
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
    jsonOutput: path.join(repoRoot, "paper_trading_replay_report.json"),
    limit: 200,
    output: path.join(repoRoot, "paper_trading_replay_report.md"),
    stakeUsd: 5,
    strategyVersion: PAPER_STRATEGY_VERSION,
  };

  function readPositiveNumber(value, fallback) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--limit" && next) {
      options.limit = Math.max(1, Math.floor(readPositiveNumber(next, options.limit)));
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = path.resolve(repoRoot, next);
      index += 1;
    } else if (arg === "--json-output" && next) {
      options.jsonOutput = path.resolve(repoRoot, next);
      index += 1;
    } else if (arg === "--stake-usd" && next) {
      options.stakeUsd = readPositiveNumber(next, options.stakeUsd);
      index += 1;
    } else if (arg === "--strategy-version" && next) {
      options.strategyVersion = next;
      index += 1;
    }
  }

  if (!Number.isFinite(options.stakeUsd) || options.stakeUsd <= 0) {
    throw new Error("--stake-usd must be a positive number");
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

async function listResolvedMarkets(client, limit) {
  const markets = [];
  let cursor = null;
  let done = false;

  while (!done && markets.length < limit) {
    const page = await client.query("markets:listArchiveBtc5m", {
      paginationOpts: {
        cursor,
        numItems: Math.min(100, limit - markets.length),
      },
      status: "resolved",
    });

    markets.push(...page.page);
    cursor = page.continueCursor;
    done = page.isDone || !cursor;
  }

  return markets.slice(0, limit);
}

async function listSnapshots(client, slug) {
  return await client.query("snapshots:listByMarketSlug", {
    limit: 400,
    slug,
  });
}

function hasReplayInputs(market, snapshots) {
  return (
    market?.winningOutcome &&
    Number.isFinite(market?.windowStartTs) &&
    Number.isFinite(market?.windowEndTs) &&
    (Number.isFinite(market?.priceToBeatOfficial) ||
      Number.isFinite(market?.priceToBeatDerived)) &&
    Array.isArray(snapshots) &&
    snapshots.length > 0
  );
}

function simulateMarket({ market, snapshots, options }) {
  const skipReasons = {};

  for (let second = 220; second <= 285; second += 1) {
    const nowTs = market.windowStartTs + second * 1000;
    const decision = maybeCreatePaperDecision({
      market,
      nowTs,
      runId: "replay",
      snapshots,
      stakeUsd: options.stakeUsd,
      strategyVersion: options.strategyVersion,
    });

    if (decision.action === "paper_trade") {
      const settlement = settlePaperTrade({
        market,
        nowTs: market.windowEndTs,
        trade: decision.trade,
      });

      return {
        decision,
        marketSlug: market.slug,
        settlement,
        trade:
          settlement.action === "settle"
            ? {
                ...decision.trade,
                ...settlement.result,
              }
            : decision.trade,
      };
    }

    skipReasons[decision.reason] = (skipReasons[decision.reason] ?? 0) + 1;
  }

  return {
    decision: null,
    marketSlug: market.slug,
    settlement: null,
    skipReasons,
    trade: null,
  };
}

function createAccumulator(label) {
  return {
    avgEntryDistanceBps: null,
    distanceTotal: 0,
    label,
    losses: 0,
    pnlUsd: 0,
    pnlUsdCount: 0,
    total: 0,
    winRate: null,
    wins: 0,
  };
}

function addTrade(accumulator, trade) {
  accumulator.total += 1;
  accumulator.distanceTotal += trade.absDistanceBps;

  if (trade.correct === true) {
    accumulator.wins += 1;
  } else if (trade.correct === false) {
    accumulator.losses += 1;
  }

  if (Number.isFinite(trade.pnlUsd)) {
    accumulator.pnlUsd += trade.pnlUsd;
    accumulator.pnlUsdCount += 1;
  }
}

function finishAccumulator(accumulator) {
  const decisions = accumulator.wins + accumulator.losses;

  return {
    ...accumulator,
    avgEntryDistanceBps:
      accumulator.total > 0 ? accumulator.distanceTotal / accumulator.total : null,
    pnlUsd: accumulator.pnlUsdCount > 0 ? accumulator.pnlUsd : null,
    winRate: decisions > 0 ? accumulator.wins / decisions : null,
  };
}

function summarizeReplay({ markets, results }) {
  const trades = results.map((result) => result.trade).filter(Boolean);
  const overall = createAccumulator("All trades");
  const byWindow = new Map([
    ["T+220-239", createAccumulator("T+220-239")],
    ["T+240-285", createAccumulator("T+240-285")],
  ]);
  const byRiskCount = new Map();
  const skipReasons = {};

  for (const result of results) {
    for (const [reason, count] of Object.entries(result.skipReasons ?? {})) {
      skipReasons[reason] = (skipReasons[reason] ?? 0) + count;
    }
  }

  for (const trade of trades) {
    addTrade(overall, trade);

    if (trade.entrySecond < 240) {
      addTrade(byWindow.get("T+220-239"), trade);
    } else {
      addTrade(byWindow.get("T+240-285"), trade);
    }

    const riskKey = String(trade.riskCount);

    if (!byRiskCount.has(riskKey)) {
      byRiskCount.set(
        riskKey,
        createAccumulator(`${trade.riskCount} risk flag${trade.riskCount === 1 ? "" : "s"}`),
      );
    }

    addTrade(byRiskCount.get(riskKey), trade);
  }

  return {
    byRiskCount: [...byRiskCount.entries()]
      .map(([key, accumulator]) => ({
        key,
        riskCount: Number(key),
        ...finishAccumulator(accumulator),
      }))
      .sort((a, b) => a.riskCount - b.riskCount),
    byWindow: [...byWindow.values()].map(finishAccumulator),
    counts: {
      markets: markets.length,
      noTrade: results.filter((result) => !result.trade).length,
      trades: trades.length,
    },
    overall: finishAccumulator(overall),
    skipReasons,
    trades,
  };
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function number(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function money(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "n/a";
}

function statsTable(rows) {
  const lines = [
    "| Cohort | Trades | Win rate | Avg entry distance | PnL |",
    "|---|---:|---:|---:|---:|",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${row.total} | ${pct(row.winRate)} | ${number(row.avgEntryDistanceBps)} bps | ${money(row.pnlUsd)} |`,
    );
  }

  return lines.join("\n");
}

function renderMarkdown({ generatedAt, options, summary }) {
  const lines = [
    "# Paper Trading Replay Report",
    "",
    `Generated: ${new Date(generatedAt).toISOString()}`,
    `Strategy: ${options.strategyVersion}`,
    `Stake: $${options.stakeUsd}`,
    "",
    "## Summary",
    "",
    `- Markets scanned: ${summary.counts.markets}`,
    `- Paper trades: ${summary.counts.trades}`,
    `- No-trade markets: ${summary.counts.noTrade}`,
    `- Win rate: ${pct(summary.overall.winRate)}`,
    `- Simulated PnL: ${money(summary.overall.pnlUsd)}`,
    `- Average entry distance: ${number(summary.overall.avgEntryDistanceBps)} bps`,
    "",
    "## Entry Window",
    "",
    statsTable(summary.byWindow),
    "",
    "## Risk Count",
    "",
    statsTable(summary.byRiskCount),
    "",
    "## Skip Reasons",
    "",
    "| Reason | Count |",
    "|---|---:|",
    ...Object.entries(summary.skipReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `| ${reason} | ${count} |`),
    "",
    "## Trades",
    "",
    "| Market | Entry | Side | Distance | Required | Risk | Correct | PnL |",
    "|---|---:|---|---:|---:|---:|---|---:|",
    ...summary.trades.slice(0, 100).map((trade) =>
      `| ${trade.marketSlug} | T+${trade.entrySecond}s | ${trade.side} | ${number(trade.absDistanceBps)} | ${number(trade.requiredDistanceBps)} | ${trade.riskCount} | ${trade.correct} | ${money(trade.pnlUsd)} |`,
    ),
  ];

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = createClient();
  const generatedAt = Date.now();
  const markets = await listResolvedMarkets(client, options.limit);
  const results = [];

  for (const market of markets) {
    const snapshots = await listSnapshots(client, market.slug);

    if (!hasReplayInputs(market, snapshots)) {
      results.push({
        marketSlug: market.slug,
        skipReasons: {
          missing_replay_inputs: 1,
        },
        trade: null,
      });
      continue;
    }

    results.push(
      simulateMarket({
        market,
        options,
        snapshots,
      }),
    );
  }

  const summary = summarizeReplay({ markets, results });
  const report = {
    generatedAt,
    options,
    results,
    summary,
  };

  fs.writeFileSync(options.output, renderMarkdown({ generatedAt, options, summary }));
  fs.writeFileSync(options.jsonOutput, JSON.stringify(report, null, 2));

  console.log(
    `Replay complete: ${summary.counts.trades} trades across ${summary.counts.markets} markets. Markdown: ${options.output}. JSON: ${options.jsonOutput}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
