import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const DEFAULT_OUTPUT = "final_flip_report.md";

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--output" && next) {
      args.output = next;
      index += 1;
    } else if (arg === "--max-markets" && next) {
      args.maxMarkets = Number(next);
      index += 1;
    } else if (arg === "--max-pages" && next) {
      args.maxPages = Number(next);
      index += 1;
    } else if (arg === "--page-limit" && next) {
      args.pageLimit = Number(next);
      index += 1;
    }
  }

  return args;
}

function compactRequest(args) {
  const request = {};

  for (const [key, value] of Object.entries({
    maxMarkets: args.maxMarkets,
    maxPages: args.maxPages,
    pageLimit: args.pageLimit,
  })) {
    if (Number.isFinite(value)) {
      request[key] = value;
    }
  }

  return request;
}

function runConvex(functionName, args) {
  const convexArgs = ["convex", "run", functionName, JSON.stringify(args)];
  const command = process.platform === "win32" ? "cmd.exe" : "npx";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx", ...convexArgs]
      : convexArgs;

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `convex run failed with exit ${code}\n${stderr || stdout}`,
          ),
        );
        return;
      }

      resolve(stdout);
    });
  });
}

function parseJsonOutput(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error(`Could not parse Convex JSON output:\n${output}`);
  }

  return JSON.parse(output.slice(start, end + 1));
}

function dateTime(ts) {
  return Number.isFinite(ts) ? new Date(ts).toISOString() : "n/a";
}

function n(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function price(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "n/a";
}

function prob(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function md(value) {
  return String(value ?? "n/a").replaceAll("|", "\\|");
}

function renderRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "_No markets found._\n";
  }

  const header = [
    "Market",
    "Flip ET",
    "Sec left",
    "Flip",
    "BTC-leader displayed before",
    "Opposite displayed before",
    "Display note",
    "BTC-leader bid/ask",
    "BTC before",
    "Price to beat",
    "Distance bps before -> at flip",
    "Volatility",
    "Vol 60s",
    "Range 60s",
    "Hour",
    "Hard flips",
    "Path type",
  ];
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ];

  for (const row of rows) {
    lines.push(
      `| ${[
        md(row.marketSlug),
        md(`${row.dateET} ${row.hourETLabel}`),
        n(row.secondsBeforeClose),
        md(`${row.beforeLeader} -> ${row.afterLeader}`),
        prob(row.leaderDisplayedPriceBeforeFlip),
        prob(row.oppositeDisplayedPriceBeforeFlip),
        md(row.leaderPriceNote),
        `${prob(row.leaderBidBeforeFlip)} / ${prob(row.leaderAskBeforeFlip)}`,
        price(row.btcPriceBeforeFlip),
        price(row.priceToBeat),
        `${n(row.distanceBeforeFlipBps, 2)} -> ${n(row.distanceAtFlipBps, 2)}`,
        md(row.volatilityLabel),
        n(row.preFlipVolatility60sBps, 2),
        n(row.preFlipRange60sBps, 2),
        md(row.hourETLabel),
        n(row.hardFlipCount),
        md(row.pathType),
      ].join(" | ")} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderReport(report) {
  const final10Only = report.final10.filter(
    (row) => row.secondsBeforeClose > 5,
  );
  const displayMismatchCount = report.final10.filter(
    (row) => row.leaderPriceNote?.includes("displayed_opposes_btc_leader"),
  ).length;
  const incompleteBookCount = report.final10.filter(
    (row) => row.leaderPriceNote?.includes("incomplete_book"),
  ).length;

  return `# Final Seconds Flip Report

Generated: ${dateTime(report.generatedAt)}

## Summary

- Stability rows scanned: ${report.scanned.toLocaleString()}
- Candidate markets fetched from snapshots: ${report.candidateCount.toLocaleString()}
- Final 5 second flips: ${report.final5.length.toLocaleString()}
- Final 10 second flips inclusive: ${report.final10.length.toLocaleString()}
- Final 10 second flips excluding final 5s: ${final10Only.length.toLocaleString()}
- Rows where displayed market price opposed the BTC-side leader: ${displayMismatchCount.toLocaleString()}
- Rows with incomplete leading-side book before flip: ${incompleteBookCount.toLocaleString()}

Volatility labels are relative to this final-10s flip cohort. High is at or above p75 for either pre-flip 60s volatility or pre-flip 60s range; very_high is at or above p90.

- Volatility p75: ${n(report.volatilityThresholds.volatilityP75, 2)} bps
- Volatility p90: ${n(report.volatilityThresholds.volatilityP90, 2)} bps
- Range p75: ${n(report.volatilityThresholds.rangeP75, 2)} bps
- Range p90: ${n(report.volatilityThresholds.rangeP90, 2)} bps

## Field Notes

- Flip is a hard BTC leader flip across the price-to-beat deadband, ignoring noise inside +/-0.5 bps.
- BTC-leader displayed before is the stored Polymarket displayed value for the side that BTC led immediately before the hard flip. If the display note says last_trade, incomplete_book, wide_book, or displayed_opposes_btc_leader, treat that value as stale or structurally unreliable.
- BTC-leader bid/ask shows the live book for that side when available; missing bid/ask is common in the final seconds.
- Distance bps is BTC Chainlink distance from price to beat before the flip and at the first stable row after the flip.
- Hour is the ET hour at the flip timestamp.

## Final 5 Seconds

${renderRows(report.final5)}

## Final 10 Seconds Inclusive

${renderRows(report.final10)}
`;
}

const args = parseArgs(process.argv.slice(2));
const output = await runConvex(
  "internal/finalFlipReport:generateJson",
  compactRequest(args),
);
const report = parseJsonOutput(output);
const markdown = renderReport(report);

await writeFile(args.output, markdown, "utf8");

console.log(`Wrote ${args.output}`);
console.log(
  `Final 5s: ${report.final5.length}; final 10s inclusive: ${report.final10.length}; candidates: ${report.candidateCount}`,
);
