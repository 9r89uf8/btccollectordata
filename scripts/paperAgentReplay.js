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
    jsonOutput: path.join(repoRoot, "paper_trading_replay_report.json"),
    limit: 200,
    output: path.join(repoRoot, "paper_trading_replay_report.md"),
    replayMode: "compare",
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
    } else if (arg === "--output" && next) {
      options.output = path.resolve(repoRoot, next);
      index += 1;
    } else if (arg === "--json-output" && next) {
      options.jsonOutput = path.resolve(repoRoot, next);
      index += 1;
    } else if (arg === "--replay-mode" && next) {
      options.replayMode = ["flat", "dynamic", "compare"].includes(next)
        ? next
        : options.replayMode;
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

  if (options.decisionStartSecond > options.decisionEndSecond) {
    throw new Error("--decision-start-second must be <= --decision-end-second");
  }

  return options;
}

function getReplayScenarios(options) {
  const flat = {
    config: {
      decisionEndSecond: options.decisionEndSecond,
      decisionStartSecond: options.decisionStartSecond,
      sizingMode: "flat",
      stakeUsd: options.stakeUsd,
      strategyVersion: options.strategyVersion,
    },
    id: "flat",
    label: `Flat $${options.stakeUsd}`,
    stakeUsd: options.stakeUsd,
    strategyVersion: options.strategyVersion,
  };
  const dynamic = {
    config: {
      decisionEndSecond: options.decisionEndSecond,
      decisionStartSecond: options.decisionStartSecond,
      sizingMode: "dynamic",
      strategyVersion: PAPER_DYNAMIC_SIZING_STRATEGY_VERSION,
    },
    id: "dynamic",
    label: "Dynamic $1/$3/$5",
    stakeUsd: null,
    strategyVersion: PAPER_DYNAMIC_SIZING_STRATEGY_VERSION,
  };

  if (options.replayMode === "flat") {
    return [flat];
  }

  if (options.replayMode === "dynamic") {
    return [dynamic];
  }

  return [flat, dynamic];
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

function simulateMarket({ market, scenario, snapshots }) {
  const skipReasons = {};

  for (
    let second = scenario.config.decisionStartSecond;
    second <= scenario.config.decisionEndSecond;
    second += 1
  ) {
    const nowTs = market.windowStartTs + second * 1000;
    const decision = maybeCreatePaperDecision({
      config: scenario.config,
      market,
      nowTs,
      runId: "replay",
      snapshots,
      stakeUsd: scenario.stakeUsd,
      strategyVersion: scenario.strategyVersion,
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
    avgEntryPrice: null,
    avgStakeUsd: null,
    distanceTotal: 0,
    entryPriceTotal: 0,
    label,
    losses: 0,
    pnlUsd: 0,
    pnlUsdCount: 0,
    roi: null,
    stakeTotal: 0,
    total: 0,
    winRate: null,
    wins: 0,
  };
}

function addTrade(accumulator, trade) {
  accumulator.total += 1;
  accumulator.distanceTotal += trade.absDistanceBps;
  accumulator.stakeTotal += trade.stakeUsd;

  if (Number.isFinite(trade.entryMarketPrice)) {
    accumulator.entryPriceTotal += trade.entryMarketPrice;
  }

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
  const pnlUsd =
    accumulator.pnlUsdCount > 0 ? accumulator.pnlUsd : null;

  return {
    ...accumulator,
    avgEntryDistanceBps:
      accumulator.total > 0 ? accumulator.distanceTotal / accumulator.total : null,
    avgEntryPrice:
      accumulator.total > 0 ? accumulator.entryPriceTotal / accumulator.total : null,
    avgStakeUsd:
      accumulator.total > 0 ? accumulator.stakeTotal / accumulator.total : null,
    pnlUsd,
    roi:
      pnlUsd !== null && accumulator.stakeTotal > 0
        ? pnlUsd / accumulator.stakeTotal
        : null,
    winRate: decisions > 0 ? accumulator.wins / decisions : null,
  };
}

function summarizeReplay({ markets, results, scenario }) {
  const trades = results.map((result) => result.trade).filter(Boolean);
  const overall = createAccumulator(scenario.label);
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
    scenario: {
      id: scenario.id,
      label: scenario.label,
      strategyVersion: scenario.strategyVersion,
    },
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

function comparisonTable(summaries) {
  const lines = [
    "| Strategy | Trades | Win rate | Avg stake | Dollars risked | Gross PnL | ROI | Avg distance | Avg price |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const summary of summaries) {
    lines.push(
      `| ${summary.scenario.label} | ${summary.counts.trades} | ${pct(summary.overall.winRate)} | ${money(summary.overall.avgStakeUsd)} | ${money(summary.overall.stakeTotal)} | ${money(summary.overall.pnlUsd)} | ${pct(summary.overall.roi)} | ${number(summary.overall.avgEntryDistanceBps)} bps | ${number(summary.overall.avgEntryPrice, 3)} |`,
    );
  }

  return lines.join("\n");
}

function statsTable(rows) {
  const lines = [
    "| Cohort | Trades | Win rate | Avg stake | Dollars risked | PnL | ROI | Avg entry distance |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${row.total} | ${pct(row.winRate)} | ${money(row.avgStakeUsd)} | ${money(row.stakeTotal)} | ${money(row.pnlUsd)} | ${pct(row.roi)} | ${number(row.avgEntryDistanceBps)} bps |`,
    );
  }

  return lines.join("\n");
}

function renderSingleSummary(summary) {
  const lines = [
    `## ${summary.scenario.label}`,
    "",
    `- Markets scanned: ${summary.counts.markets}`,
    `- Paper trades: ${summary.counts.trades}`,
    `- No-trade markets: ${summary.counts.noTrade}`,
    `- Win rate: ${pct(summary.overall.winRate)}`,
    `- Average stake: ${money(summary.overall.avgStakeUsd)}`,
    `- Dollars risked: ${money(summary.overall.stakeTotal)}`,
    `- Simulated gross PnL: ${money(summary.overall.pnlUsd)}`,
    `- ROI on dollars risked: ${pct(summary.overall.roi)}`,
    `- Average entry distance: ${number(summary.overall.avgEntryDistanceBps)} bps`,
    `- Average entry price: ${number(summary.overall.avgEntryPrice, 3)}`,
    "",
    "### Entry Window",
    "",
    statsTable(summary.byWindow),
    "",
    "### Risk Count",
    "",
    statsTable(summary.byRiskCount),
    "",
    "### Skip Reasons",
    "",
    "| Reason | Count |",
    "|---|---:|",
    ...Object.entries(summary.skipReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => `| ${reason} | ${count} |`),
    "",
    "### Trades",
    "",
    "| Market | Entry | Side | Stake | Price | Distance | Required | Risk | Correct | PnL |",
    "|---|---:|---|---:|---:|---:|---:|---:|---|---:|",
    ...summary.trades.slice(0, 100).map((trade) =>
      `| ${trade.marketSlug} | T+${trade.entrySecond}s | ${trade.side} | ${money(trade.stakeUsd)} | ${number(trade.entryMarketPrice, 3)} | ${number(trade.absDistanceBps)} | ${number(trade.requiredDistanceBps)} | ${trade.riskCount} | ${trade.correct} | ${money(trade.pnlUsd)} |`,
    ),
  ];

  return lines.join("\n");
}

function renderMarkdown({ generatedAt, options, summaries }) {
  const lines = [
    "# Paper Trading Replay Report",
    "",
    `Generated: ${new Date(generatedAt).toISOString()}`,
    `Replay mode: ${options.replayMode}`,
    `Decision window: T+${options.decisionStartSecond}-${options.decisionEndSecond}`,
    "",
  ];

  if (summaries.length > 1) {
    lines.push("## Sizing Comparison");
    lines.push("");
    lines.push(comparisonTable(summaries));
    lines.push("");
  }

  for (const summary of summaries) {
    lines.push(renderSingleSummary(summary));
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = createClient();
  const generatedAt = Date.now();
  const markets = await listResolvedMarkets(client, options.limit);
  const scenarios = getReplayScenarios(options);
  const resultsByScenario = Object.fromEntries(
    scenarios.map((scenario) => [scenario.id, []]),
  );

  for (const market of markets) {
    const snapshots = await listSnapshots(client, market.slug);

    if (!hasReplayInputs(market, snapshots)) {
      for (const scenario of scenarios) {
        resultsByScenario[scenario.id].push({
          marketSlug: market.slug,
          skipReasons: {
            missing_replay_inputs: 1,
          },
          trade: null,
        });
      }
      continue;
    }

    for (const scenario of scenarios) {
      resultsByScenario[scenario.id].push(
        simulateMarket({
          market,
          scenario,
          snapshots,
        }),
      );
    }
  }

  const summaries = scenarios.map((scenario) =>
    summarizeReplay({
      markets,
      results: resultsByScenario[scenario.id],
      scenario,
    }),
  );
  const report = {
    generatedAt,
    options,
    resultsByScenario,
    summaries,
    summary: summaries[0] ?? null,
  };

  fs.writeFileSync(options.output, renderMarkdown({ generatedAt, options, summaries }));
  fs.writeFileSync(options.jsonOutput, JSON.stringify(report, null, 2));

  console.log(
    `Replay complete: ${summaries.map((summary) => `${summary.scenario.id}=${summary.counts.trades} trades, ${money(summary.overall.pnlUsd)} PnL`).join("; ")} across ${markets.length} markets. Markdown: ${options.output}. JSON: ${options.jsonOutput}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
