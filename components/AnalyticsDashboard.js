"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";

import { api } from "@/convex/_generated/api";

const CHECKPOINTS = [30, 60, 90, 120, 180, 200, 210, 220, 240, 270, 285, 295];
const TARGET_CHECKPOINTS = [180, 200, 210, 220, 240];
const panel = "rounded-[1.2rem] border border-black/10 bg-white/88 p-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]";
const th = "py-2 pr-4 text-xs uppercase tracking-[0.14em] text-stone-500";
const td = "py-2 pr-4 text-sm text-stone-700";

function n(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function bps(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} bps` : "n/a";
}

function usd(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return value >= 100 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}

function rank(value) {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function signedBps(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)} bps`;
}

const stabilityMetricDefinitions = {
  endpointWinRate:
    "Stable wins plus fragile wins. The checkpoint leader won at close, whether the path was clean or fragile.",
  flipLossRate:
    "Checkpoint leader lost at close.",
  pathRiskRate:
    "Flip loss plus no-decision plus unknown path. This is the broad risk bucket.",
  noDecisionAtCheckpointRate:
    "BTC was inside the <=0.5 bps noise band at checkpoint, so there was no clean leader decision.",
};

const derivedStabilityMetrics = {
  endpointWinRate: {
    id: "endpointWinRate",
    label: "Endpoint win",
    positive: true,
    valueField: "endpointWinRate",
  },
};

const coreStabilityMetricIds = [
  "endpointWinRate",
  "flipLossRate",
  "noDecisionAtCheckpointRate",
  "pathRiskRate",
];

function getCoreStabilityMetrics(stability) {
  const metricsById = new Map(
    (stability.metrics ?? []).map((metric) => [metric.id, metric]),
  );

  return coreStabilityMetricIds
    .map((metricId) => derivedStabilityMetrics[metricId] ?? metricsById.get(metricId))
    .filter(Boolean);
}

function getStabilityCellValue(cell, metric) {
  if (!cell) {
    return null;
  }

  if (metric.id === "endpointWinRate") {
    if (
      !Number.isFinite(cell.stableLeaderWinRate) ||
      !Number.isFinite(cell.fragileWinRate)
    ) {
      return null;
    }

    return cell.stableLeaderWinRate + cell.fragileWinRate;
  }

  return cell[metric.valueField];
}

function stabilityMetricValue(metric, value) {
  return metric.id === "medianMaxAdverseBps" ? bps(value) : pct(value);
}

function stabilityExportCell(cell, metric) {
  if (!cell) {
    return "n/a";
  }

  if (cell.hidden) {
    return `hidden, N=${n(cell.N)}`;
  }

  return `${stabilityMetricValue(metric, getStabilityCellValue(cell, metric))} \\| N=${n(cell.N)} \\| p90 adverse=${bps(cell.p90MaxAdverseBps)}`;
}

function buildStabilityMetricMarkdown(stability, metric, computedAt, options = {}) {
  const cells = new Map(
    (stability.heatmap ?? []).map((cell) => [
      `${cell.checkpointSecond}:${cell.distanceBucket}`,
      cell,
    ]),
  );
  const titleLevel = options.titleLevel ?? 2;
  const titlePrefix = "#".repeat(titleLevel);
  const lines = [
    `${titlePrefix} Leader Stability Heatmap - ${metric.label}`,
    "",
    `Rollup computed: ${dateTime(computedAt)} UTC`,
    `Clean sample size: N=${n(stability.cleanCount)}`,
    `Metric definition: ${stabilityMetricDefinitions[metric.id] ?? metric.label}`,
    "Cell format: metric value | N | p90 adverse bps.",
    "Support note: cells below N=50 are hidden in the dashboard; cells from N=50 to N=99 are shown without color.",
    "",
    `| Checkpoint | ${stability.distanceBuckets.map((bucket) => bucket.id === "le_0_5" ? `${bucket.label} (no decision)` : bucket.label).join(" | ")} |`,
    `|---|${stability.distanceBuckets.map(() => "---:").join("|")}|`,
  ];

  for (const checkpointSecond of CHECKPOINTS) {
    const values = stability.distanceBuckets.map((bucket) =>
      stabilityExportCell(cells.get(`${checkpointSecond}:${bucket.id}`), metric),
    );

    lines.push(`| T+${checkpointSecond}s | ${values.join(" | ")} |`);
  }

  return lines.join("\n");
}

function buildAllStabilityMarkdown(stability, computedAt, metrics) {
  const lines = [
    "# BTC 5m Leader Stability Heatmaps",
    "",
    `Rollup computed: ${dateTime(computedAt)} UTC`,
    `Clean sample size: N=${n(stability.cleanCount)}`,
    "",
    "Definitions:",
    "- Endpoint win: stable win plus fragile win. The checkpoint leader won at close.",
    "- Flip loss: checkpoint leader lost at close.",
    "- No decision: BTC was inside the <=0.5 bps noise band at checkpoint.",
    "- Path risk: flip loss plus no decision plus unknown path.",
    "- p90 adverse: 90th percentile worst adverse move after checkpoint, in bps.",
    "",
  ];

  for (const metric of metrics) {
    lines.push(buildStabilityMetricMarkdown(stability, metric, computedAt, { titleLevel: 2 }));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function compactDiagnosticCell(cell, dimensionKey, dimensionLabelKey) {
  return {
    anyFlipAfterTRate: cell.anyFlipAfterTRate,
    checkpointSecond: cell.checkpointSecond,
    colorEligible: cell.colorEligible,
    distanceBucket: cell.distanceBucket,
    distanceBucketLabel: cell.distanceBucketLabel,
    flipLossRate: cell.flipLossRate,
    fragileWinRate: cell.fragileWinRate,
    leaderEligibleN: cell.leaderEligibleN,
    leaderWinRate: cell.leaderWinRate,
    medianLeaderAlignedMomentum30sBps: cell.medianLeaderAlignedMomentum30sBps,
    medianLeaderAlignedMomentum60sBps: cell.medianLeaderAlignedMomentum60sBps,
    medianMaxAdverseBps: cell.medianMaxAdverseBps,
    medianMaxAdverseDrawdownBps: cell.medianMaxAdverseDrawdownBps,
    medianMomentum30sBps: cell.medianMomentum30sBps,
    medianMomentum60sBps: cell.medianMomentum60sBps,
    medianPreCrossCountLast60s: cell.medianPreCrossCountLast60s,
    medianPreRange60sBps: cell.medianPreRange60sBps,
    medianPreRange120sBps: cell.medianPreRange120sBps,
    N: cell.N,
    p90MaxAdverseBps: cell.p90MaxAdverseBps,
    p90MaxAdverseDrawdownBps: cell.p90MaxAdverseDrawdownBps,
    sparse: cell.sparse,
    splitBucket: cell[dimensionKey],
    splitBucketLabel: cell[dimensionLabelKey],
    stableLeaderWinRate: cell.stableLeaderWinRate,
  };
}

function compactPathShapeCell(cell) {
  return {
    anyFlipAfterTRate: cell.anyFlipAfterTRate,
    checkpointSecond: cell.checkpointSecond,
    colorEligible: cell.colorEligible,
    distanceMedianBps: cell.distanceMedianBps,
    flipLossRate: cell.flipLossRate,
    fragileWinRate: cell.fragileWinRate,
    leaderEligibleN: cell.leaderEligibleN,
    leaderWinRate: cell.leaderWinRate,
    medianMaxAdverseBps: cell.medianMaxAdverseBps,
    medianMaxAdverseDrawdownBps: cell.medianMaxAdverseDrawdownBps,
    N: cell.N,
    p90MaxAdverseBps: cell.p90MaxAdverseBps,
    p90MaxAdverseDrawdownBps: cell.p90MaxAdverseDrawdownBps,
    prePathShape: cell.prePathShape,
    prePathShapeLabel: cell.prePathShapeLabel,
    shareOfCheckpoint: cell.shareOfCheckpoint,
    sparse: cell.sparse,
    stableLeaderWinRate: cell.stableLeaderWinRate,
  };
}

function buildLlmChartDataExport(stability, computedAt) {
  return JSON.stringify(
    {
      charts: {
        distanceBy30sMomentum: {
          buckets: stability.momentumAgreementBuckets,
          cells: (stability.momentumAgreement ?? []).map((cell) =>
            compactDiagnosticCell(
              cell,
              "momentumAgreementBucket",
              "momentumAgreementBucketLabel",
            ),
          ),
          description:
            "Checkpoint and leader-distance rows split by whether 30s BTC momentum agrees with the current leader.",
        },
        distanceByChop: {
          buckets: stability.chopBuckets,
          cells: (stability.pathRiskByChop ?? []).map((cell) =>
            compactDiagnosticCell(
              cell,
              "preChopBucket",
              "preChopBucketLabel",
            ),
          ),
          description:
            "Checkpoint and leader-distance rows split by pre-checkpoint chop bucket.",
        },
        preCheckpointPathShapes: {
          buckets: stability.prePathShapes?.buckets ?? [],
          cells: (stability.prePathShapes?.cells ?? []).map(compactPathShapeCell),
          description:
            "Checkpoint rows split by derived pre-checkpoint path shape.",
        },
      },
      computedAt,
      definitions: {
        chop: stability.preChopBucketDefinitions,
        diagnosticDistanceBuckets: stability.diagnosticDistanceBuckets,
        metricUnits: {
          rates: "0 to 1 probabilities",
          distances: "basis points",
          N: "row count",
        },
        support: stability.support,
        targetCheckpoints: stability.targetCheckpoints,
      },
      prompt:
        "Analyze these BTC 5-minute checkpoint charts. Focus on which signals separate leader win rate after holding checkpoint and distance fixed, where chop and 30s momentum disagree, and which cells are too sparse to trust.",
    },
    null,
    2,
  );
}

function compactHourlyCheckpoint(checkpoint) {
  if (!checkpoint) {
    return null;
  }

  return {
    anyFlipAfterTRate: checkpoint.anyFlipAfterTRate,
    checkpointSecond: checkpoint.checkpointSecond,
    colorEligible: checkpoint.colorEligible,
    flipLossRate: checkpoint.flipLossRate,
    hidden: checkpoint.hidden,
    highChopRate: checkpoint.highChopRate,
    leaderAgeSecondsMedian: checkpoint.leaderAgeSecondsMedian,
    leaderEligibleN: checkpoint.leaderEligibleN,
    leaderWinRate: checkpoint.leaderWinRate,
    medianMaxAdverseDrawdownBps: checkpoint.medianMaxAdverseDrawdownBps,
    medianPreCrossCountLast60s: checkpoint.medianPreCrossCountLast60s,
    medianPreNearLineSeconds: checkpoint.medianPreNearLineSeconds,
    medianPreRange120sBps: checkpoint.medianPreRange120sBps,
    multiFlipRate: checkpoint.multiFlipRate,
    N: checkpoint.N,
    nearLineHeavyRate: checkpoint.nearLineHeavyRate,
    noDecisionAtCheckpointRate: checkpoint.noDecisionAtCheckpointRate,
    pathRiskRate: checkpoint.pathRiskRate,
    p90MaxAdverseDrawdownBps: checkpoint.p90MaxAdverseDrawdownBps,
    recentLockRate: checkpoint.recentLockRate,
    riskEligibleN: checkpoint.riskEligibleN,
    stableLeaderWinRate: checkpoint.stableLeaderWinRate,
  };
}

function compactHourlyRow(row) {
  return {
    bestCheckpoint: compactHourlyCheckpoint(row.bestCheckpoint),
    checkpointSummary: compactHourlyCheckpoint(row.checkpointSummary),
    checkpoints: (row.checkpoints ?? []).map(compactHourlyCheckpoint),
    chopScore: row.chopScore,
    colorEligible: row.colorEligible,
    distanceTaxLabel: row.distanceTaxLabel,
    downRate: row.downRate,
    hidden: row.hidden,
    hourET: row.hourET,
    hourETLabel: row.hourETLabel,
    hourUTC: row.hourUTC,
    medianAbsCloseMoveBps: row.medianAbsCloseMoveBps,
    medianAbsMoveDollars: row.medianAbsMoveDollars,
    medianHardFlipCount: row.medianHardFlipCount,
    medianMaxDistanceBps: row.medianMaxDistanceBps,
    medianNoiseTouchCount: row.medianNoiseTouchCount,
    minimumDistanceTaxBuckets: row.minimumDistanceTaxBuckets,
    moveN: row.moveN,
    N: row.N,
    p90AbsCloseMoveBps: row.p90AbsCloseMoveBps,
    p90AbsMoveDollars: row.p90AbsMoveDollars,
    reliabilityScore: row.reliabilityScore,
    sessionET: row.sessionET,
    sessionETLabel: row.sessionETLabel,
    shareAbsMoveGte20: row.shareAbsMoveGte20,
    shareAbsMoveGte50: row.shareAbsMoveGte50,
    speedScore: row.speedScore,
    supportLevel: row.supportLevel,
    upRate: row.upRate,
  };
}

function buildHourlyProfileExport(hourly, computedAt) {
  return JSON.stringify(
    {
      charts: {
        hourlyMarketProfile: {
          description:
            "BTC 5-minute resolved-market hourly context by ET hour. Use this as a risk adjustment over checkpoint, distance, and path quality, not as a standalone signal.",
          rows: (hourly?.rows ?? []).map(compactHourlyRow),
        },
      },
      computedAt,
      definitions: {
        metricUnits: {
          bps: "basis points",
          dollars: "USD move estimated from priceToBeat and close margin bps",
          N: "market count",
          rates: "0 to 1 probabilities",
        },
        riskFlags: hourly?.definitions?.riskFlags,
        scoreMethod: hourly?.definitions?.scoreMethod,
        support: hourly?.support,
        targetCheckpoints: hourly?.targetCheckpoints,
        thresholds: hourly?.thresholds,
        timeZone: hourly?.definitions?.timeZone,
      },
    },
    null,
    2,
  );
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

function dateTime(ts) {
  if (!Number.isFinite(ts)) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function dayLabel(day) {
  if (typeof day !== "string" || day.trim() === "") {
    return "n/a";
  }

  const date = new Date(`${day}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return day;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(date);
}

function stabilityCellStyle(cell, metric) {
  if (!cell || cell.hidden || !cell.colorEligible) {
    return {};
  }

  const value = getStabilityCellValue(cell, metric);

  if (!Number.isFinite(value)) {
    return {};
  }

  const power =
    metric.id === "medianMaxAdverseBps"
      ? Math.min(value / 8, 1)
      : Math.min(value / 0.8, 1);
  const rgb = metric.positive ? "16, 185, 129" : "244, 63, 94";
  const alpha = 0.08 + power * 0.32;

  return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

function riskCellStyle(cell, positive = true) {
  if (!cell || cell.sparse || !cell.colorEligible) {
    return {};
  }

  const value = cell.leaderWinRate;

  if (!Number.isFinite(value)) {
    return {};
  }

  const rgb = positive ? "16, 185, 129" : "244, 63, 94";
  const power = Math.min(value / 0.9, 1);

  return { backgroundColor: `rgba(${rgb}, ${0.08 + power * 0.28})` };
}

function riskCell(cell, options = {}) {
  if (!cell) {
    return <span className="text-xs text-stone-400">n/a</span>;
  }

  const adverse = Number.isFinite(cell.p90MaxAdverseDrawdownBps)
    ? cell.p90MaxAdverseDrawdownBps
    : cell.p90MaxAdverseBps;
  const detailValue =
    options.detailField && Number.isFinite(cell[options.detailField])
      ? cell[options.detailField]
      : null;
  const detailFormatter = options.detailFormatter ?? bps;

  return (
    <>
      <span className="block font-semibold text-stone-950">
        {cell.sparse ? "sparse" : `WR ${pct(cell.leaderWinRate)}`}
      </span>
      <span className="block text-xs text-stone-600">
        SW {pct(cell.stableLeaderWinRate)} / FL {pct(cell.flipLossRate)}
      </span>
      <span className="block text-xs text-stone-600">N {n(cell.N)}</span>
      {options.showPrior ? (
        <span className="block text-xs text-stone-600">
          prior {n(cell.priorNMedian)}
        </span>
      ) : null}
      <span className="block text-xs text-stone-600">
        p90 dd {bps(adverse)}
      </span>
      {detailValue === null ? null : (
        <span className="block text-xs text-stone-600">
          {options.detailLabel} {detailFormatter(detailValue)}
        </span>
      )}
    </>
  );
}

function Panel({ children, label, title }) {
  return (
    <section className={panel}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-stone-950">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChopBucketDefinitions({ definitions }) {
  const ranks = definitions?.ranks;

  if (!ranks) {
    return null;
  }

  return (
    <div className="mb-4 rounded-[0.85rem] border border-black/10 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
      <p className="font-semibold text-stone-950">Chop bucket definitions</p>
      <dl className="mt-2 grid gap-2 md:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Pooled chop rank
          </dt>
          <dd>
            Low &lt; {rank(ranks.lowThreshold)}; high &gt;= {rank(ranks.highThreshold)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Near-line rank
          </dt>
          <dd>High &gt;= {rank(ranks.nearLineHighThreshold)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Oscillation rank
          </dt>
          <dd>High &gt;= {rank(ranks.oscillationHighThreshold)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-stone-500">
        Percentile ranks are pooled over target checkpoints{" "}
        {(ranks.targetCheckpoints ?? [])
          .map((second) => `T+${second}s`)
          .join(", ")}
        ; tie handling: {ranks.tieHandling ?? "n/a"}.
      </p>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={panel}>
          <div className="h-3 w-28 animate-pulse rounded-full bg-stone-200" />
          <div className="mt-4 h-8 animate-pulse rounded bg-stone-100" />
          <div className="mt-3 h-20 animate-pulse rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

function DatasetEligibility({ health, stability }) {
  const totalMarkets = health?.cohortFunnel?.analyticsRows ?? null;
  const notEligible = health?.cohortFunnel?.excluded ?? null;
  const eligible = health?.baseRates?.cleanCount ?? stability?.cleanCount ?? null;
  const notEligibleRate =
    Number.isFinite(totalMarkets) && totalMarkets > 0 && Number.isFinite(notEligible)
      ? notEligible / totalMarkets
      : null;

  return (
    <Panel label="Dataset" title="Market eligibility">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[0.85rem] border border-black/10 bg-stone-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Markets
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">
            {n(totalMarkets)}
          </p>
        </div>
        <div className="rounded-[0.85rem] border border-black/10 bg-stone-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Eligible
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">
            {n(eligible)}
          </p>
        </div>
        <div className="rounded-[0.85rem] border border-black/10 bg-stone-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Not eligible
          </p>
          <p className="mt-2 text-2xl font-semibold text-stone-950">
            {n(notEligible)}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {pct(notEligibleRate)} of stored markets
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-stone-700">
        Not eligible means the row failed the analytics quality gates, such as
        missing or stale checkpoint BTC, missing outcome, derived-only outcome,
        or missing price-to-beat.
      </p>
    </Panel>
  );
}

function dayCoverageTone(row) {
  if (!row || !Number.isFinite(row.count) || !Number.isFinite(row.expected)) {
    return "border-stone-200 bg-stone-50 text-stone-600";
  }

  if (row.count >= row.expected) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (row.count >= row.expected * 0.95) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-800";
}

function DailyMarketCoverage({ health, rows }) {
  const cleanByDay = new Map(
    (health?.baseRates?.cleanByDay ?? []).map((row) => [row.day, row.count]),
  );
  const visibleRows = Array.isArray(rows) ? rows : [];

  return (
    <Panel label="Coverage" title="Stored markets by day">
      <p className="mb-4 text-sm leading-6 text-stone-700">
        BTC 5-minute windows should produce about 288 markets per full UTC day.
        Stored counts come from the market catalog; clean analytics counts show
        how many of those rows passed the analytics quality gates.
      </p>
      {rows === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-[0.85rem] bg-stone-100"
            />
          ))}
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-stone-500">No stored market days found.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleRows.map((row) => {
            const cleanCount = cleanByDay.get(row.day);

            return (
              <div
                key={row.day}
                className="rounded-[0.85rem] border border-black/10 bg-stone-50 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
                      {dayLabel(row.day)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-stone-500">
                      {row.day} UTC
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${dayCoverageTone(row)}`}
                  >
                    {pct(row.pctExpected)}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold text-stone-950">
                  {n(row.count)} / {n(row.expected)}
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-sky-700"
                    style={{
                      width: `${Math.min((row.pctExpected ?? 0) * 100, 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
                  <span>Missing {n(row.missing)}</span>
                  <span>Clean {n(cleanCount)}</span>
                  <span>Closed {n(row.closed)}</span>
                  <span>Resolved {n(row.resolved)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function labelize(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "n/a";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function badgeTone(value) {
  if (["fast", "clean", "strong"].includes(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (["slow", "choppy", "weak"].includes(value)) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  if (value === "unsupported" || value === "unknown") {
    return "border-stone-200 bg-stone-50 text-stone-500";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function supportTone(level) {
  if (level === "strong") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (level === "soft") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (level === "preview") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-stone-200 bg-stone-50 text-stone-500";
}

function Badge({ tone, value }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>
      {value}
    </span>
  );
}

function HourlyMarketProfile({ computedAt, hourly }) {
  const [copyStatus, setCopyStatus] = useState("");
  const rows = Array.isArray(hourly?.rows) ? hourly.rows : [];
  const hasMarkets = rows.some((row) => row.N > 0);

  async function copyHourlyProfile() {
    try {
      await copyText(buildHourlyProfileExport(hourly, computedAt));
      setCopyStatus("Copied hourly profile");
      window.setTimeout(() => setCopyStatus(""), 2500);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  return (
    <Panel label="Hourly context" title="Hourly market profile">
      <p className="mb-4 text-sm leading-6 text-stone-700">
        ET hour is treated as a context layer over the checkpoint and distance
        model. Unsupported hours are shown for coverage but do not emit a rule.
      </p>
      {hasMarkets ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyHourlyProfile}
            className="rounded-full border border-black/10 bg-stone-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Copy all hourly profile
          </button>
          {copyStatus ? (
            <span className="text-xs font-medium text-stone-500">
              {copyStatus}
            </span>
          ) : null}
        </div>
      ) : null}
      {!hasMarkets ? (
        <p className="text-sm text-stone-500">No hourly market data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left">
            <thead>
              <tr>
                <th className={th}>Hour ET</th>
                <th className={`${th} text-right`}>N</th>
                <th className={th}>Support</th>
                <th className={th}>Speed</th>
                <th className={th}>Chop</th>
                <th className={th}>Reliability</th>
                <th className={`${th} text-right`}>Median move</th>
                <th className={`${th} text-right`}>Share &gt;= $50</th>
                <th className={`${th} text-right`}>Recent lock</th>
                <th className={`${th} text-right`}>Multi-flip</th>
                <th className={`${th} text-right`}>Near-line</th>
                <th className={`${th} text-right`}>Path risk</th>
                <th className={`${th} text-right`}>Flip loss</th>
                <th className={`${th} text-right`}>Best T</th>
                <th className={`${th} text-right`}>Distance tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((row) => {
                const summary = row.checkpointSummary ?? {};

                return (
                  <tr
                    key={row.hourET}
                    className={row.hidden ? "text-stone-400" : undefined}
                  >
                    <td className={`${td} font-medium text-stone-950`}>
                      {row.hourETLabel}
                      <span className="block text-xs font-normal text-stone-500">
                        {row.hourUTC === null ? "UTC n/a" : `${row.hourUTC}:00 UTC`} /{" "}
                        {row.sessionETLabel}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>{n(row.N)}</td>
                    <td className={td}>
                      <Badge
                        tone={supportTone(row.supportLevel)}
                        value={labelize(row.supportLevel)}
                      />
                    </td>
                    <td className={td}>
                      <Badge tone={badgeTone(row.speedScore)} value={labelize(row.speedScore)} />
                    </td>
                    <td className={td}>
                      <Badge tone={badgeTone(row.chopScore)} value={labelize(row.chopScore)} />
                    </td>
                    <td className={td}>
                      <Badge
                        tone={badgeTone(row.reliabilityScore)}
                        value={labelize(row.reliabilityScore)}
                      />
                    </td>
                    <td className={`${td} text-right`}>
                      {usd(row.medianAbsMoveDollars)}
                    </td>
                    <td className={`${td} text-right`}>
                      {pct(row.shareAbsMoveGte50)}
                    </td>
                    <td className={`${td} text-right`}>
                      {pct(summary.recentLockRate)}
                    </td>
                    <td className={`${td} text-right`}>
                      {pct(summary.multiFlipRate)}
                    </td>
                    <td className={`${td} text-right`}>
                      {pct(summary.nearLineHeavyRate)}
                    </td>
                    <td className={`${td} text-right`}>
                      {pct(summary.pathRiskRate)}
                    </td>
                    <td className={`${td} text-right`}>
                      {pct(summary.flipLossRate)}
                    </td>
                    <td className={`${td} text-right`}>
                      {row.bestCheckpoint
                        ? `T+${row.bestCheckpoint.checkpointSecond}s`
                        : "n/a"}
                    </td>
                    <td className={`${td} text-right`}>
                      {row.distanceTaxLabel ?? "n/a"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-stone-500">
        Supported at N &gt;= {n(hourly?.support?.floor)}, colored at N &gt;={" "}
        {n(hourly?.support?.colorFloor)}, strong at N &gt;={" "}
        {n(hourly?.support?.strongFloor)}.
      </p>
    </Panel>
  );
}

function Leader({ stability }) {
  const stabilityExample = stability?.byCheckpoint?.find(
    (row) => row.checkpointSecond === 270,
  );

  return (
    <Panel label={`Clean N ${n(stability.cleanCount)}`} title="Checkpoint outcome decomposition">
      <p className="mb-4 text-sm leading-6 text-stone-700">
        This is the main accounting table. Stable win is the clean state,
        fragile win combines noise-touch and hard-flip recovery wins, no
        decision means BTC was inside the noise band at checkpoint, and path
        risk means flip loss plus no decision plus unknown path.
      </p>
      {stabilityExample ? (
        <p className="mb-4 rounded-[0.75rem] border border-black/10 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
          Example: at T+270, {pct(stabilityExample.stableLeaderWinRate)} of
          markets were clean stable wins, {pct(stabilityExample.fragileWinRate)}
          were fragile endpoint wins, and {pct(stabilityExample.pathRiskRate)}
          were path-risk cases. {pct(stabilityExample.noDecisionAtCheckpointRate)}
          were treated as no-decision because BTC was inside the noise band.
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr>
              <th className={th}>Checkpoint</th>
              <th className={`${th} text-right`}>N</th>
              <th className={`${th} text-right`}>Eligible N</th>
              <th className={`${th} text-right`}>Stable win</th>
              <th className={`${th} text-right`}>Fragile win</th>
              <th className={`${th} text-right`}>Flip loss</th>
              <th className={`${th} text-right`}>No decision</th>
              <th className={`${th} text-right`}>Unknown</th>
              <th className={`${th} text-right`}>Path risk</th>
              <th className={`${th} text-right`}>Any flip</th>
              <th className={`${th} text-right`}>Med adverse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {stability.byCheckpoint.map((row) => (
              <tr key={row.checkpointSecond}>
                <td className={`${td} font-medium text-stone-950`}>
                  T+{row.checkpointSecond}s
                </td>
                <td className={`${td} text-right`}>{n(row.N)}</td>
                <td className={`${td} text-right`}>{n(row.leaderEligibleN)}</td>
                <td className="py-2 pr-4 text-right font-medium text-stone-950">
                  {pct(row.stableLeaderWinRate)}
                </td>
                <td className={`${td} text-right`}>{pct(row.fragileWinRate)}</td>
                <td className={`${td} text-right`}>{pct(row.flipLossRate)}</td>
                <td className={`${td} text-right`}>
                  {pct(row.noDecisionAtCheckpointRate)}
                </td>
                <td className={`${td} text-right`}>{pct(row.unknownPathRate)}</td>
                <td className={`${td} text-right`}>{pct(row.pathRiskRate)}</td>
                <td className={`${td} text-right`}>{pct(row.anyFlipAfterTRate)}</td>
                <td className={`${td} text-right`}>
                  {bps(row.medianMaxAdverseBps)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StabilityHeatmap({
  computedAt,
  metric,
  metrics,
  onMetricChange,
  stability,
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const cells = new Map(
    (stability.heatmap ?? []).map((cell) => [
      `${cell.checkpointSecond}:${cell.distanceBucket}`,
      cell,
    ]),
  );

  async function copyMetric(metricToCopy) {
    try {
      await copyText(buildStabilityMetricMarkdown(stability, metricToCopy, computedAt));
      setCopyStatus(`Copied ${metricToCopy.label}`);
      window.setTimeout(() => setCopyStatus(""), 2500);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  async function copyAllMetrics() {
    try {
      await copyText(buildAllStabilityMarkdown(stability, computedAt, metrics));
      setCopyStatus("Copied all metrics");
      window.setTimeout(() => setCopyStatus(""), 2500);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  return (
    <Panel label={`Stability N ${n(stability.cleanCount)}`} title="Leader stability heatmap">
      <p className="mb-4 text-sm leading-6 text-stone-700">
        This uses the BTC path after each checkpoint. Stable and fragile wins
        are combined as endpoint wins here; the decomposition table above keeps
        them separate for path-quality context.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {metrics.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onMetricChange(candidate.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              candidate.id === metric.id
                ? "border-stone-950 bg-stone-950 text-white"
                : "border-black/10 bg-white text-stone-700"
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => copyMetric(metric)}
          className="rounded-full border border-black/10 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Copy current heatmap
        </button>
        <button
          type="button"
          onClick={copyAllMetrics}
          className="rounded-full border border-black/10 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
        >
          Copy all heatmaps
        </button>
        {copyStatus ? (
          <span className="text-xs font-medium text-stone-500">
            {copyStatus}
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-separate border-spacing-1 text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="px-2 py-2 text-left">T</th>
              {stability.distanceBuckets.map((bucket) => (
                <th key={bucket.id} className="px-2 py-2 text-center">
                  {bucket.label}
                  {bucket.id === "le_0_5" ? (
                    <span className="block text-[10px] normal-case tracking-normal">
                      no decision
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHECKPOINTS.map((checkpointSecond) => (
              <tr key={checkpointSecond}>
                <th className="px-2 py-2 text-left font-semibold text-stone-950">
                  T+{checkpointSecond}s
                </th>
                {stability.distanceBuckets.map((bucket) => {
                  const cell = cells.get(`${checkpointSecond}:${bucket.id}`);
                  const value = getStabilityCellValue(cell, metric);

                  return (
                    <td
                      key={bucket.id}
                      style={stabilityCellStyle(cell, metric)}
                      className={`h-16 rounded-[0.65rem] border px-2 py-2 text-center ${
                        cell?.hidden
                          ? "border-stone-100 bg-stone-50 text-stone-400"
                          : "border-black/10 text-stone-950"
                      }`}
                    >
                      {cell?.hidden ? (
                        <span className="text-xs">N {n(cell.N)}</span>
                      ) : (
                        <>
                          <span className="block font-semibold">
                            {metric.id === "medianMaxAdverseBps"
                              ? bps(value)
                              : pct(value)}
                          </span>
                          <span className="block text-xs text-stone-600">
                            N {n(cell?.N)}
                          </span>
                          <span className="block text-xs text-stone-600">
                            p90 adverse {bps(cell?.p90MaxAdverseBps)}
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PathTypes({ stability }) {
  return (
    <Panel label="Market path" title="Path archetypes">
      <p className="mb-3 text-sm leading-6 text-stone-700">
        Each market is assigned one full-window path type based on when the
        eventual winner last took the BTC lead, how often BTC hard-flipped
        across the line, and whether the path stayed too close to the noise
        band.
      </p>
      <p className="mb-4 rounded-[0.75rem] border border-black/10 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
        Example: if DOWN took the final lead at T+210 and never lost it again,
        that market is mid-lock. If BTC hard-flipped three or more times, it is
        chop even if the final winner eventually became clear.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr>
              <th className={th}>Path type</th>
              <th className={`${th} text-right`}>N</th>
              <th className={`${th} text-right`}>UP</th>
              <th className={`${th} text-right`}>DOWN</th>
              <th className={`${th} text-right`}>T+270 stable win</th>
              <th className={`${th} text-right`}>Med close margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {stability.pathTypes.map((row) => (
              <tr key={row.pathType}>
                <td className={`${td} font-medium text-stone-950`}>
                  {row.pathType}
                </td>
                <td className={`${td} text-right`}>{n(row.N)}</td>
                <td className={`${td} text-right`}>{pct(row.upRate)}</td>
                <td className={`${td} text-right`}>{pct(row.downRate)}</td>
                <td className={`${td} text-right`}>
                  {pct(row.stableWinRateAt270)}
                </td>
                <td className={`${td} text-right`}>
                  {bps(row.closeMarginMedianBps)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function DiagnosticMatrix({
  buckets,
  cells,
  detailField,
  detailFormatter,
  detailLabel,
  dimensionKey,
  example,
  label,
  showPrior = false,
  summary,
  title,
}) {
  const distanceBuckets =
    stabilityDistanceBuckets(cells) ?? [];
  const byKey = new Map(
    (cells ?? []).map((cell) => [
      `${cell.checkpointSecond}:${cell.distanceBucket}:${cell[dimensionKey]}`,
      cell,
    ]),
  );

  if (!cells?.length || !buckets?.length || distanceBuckets.length === 0) {
    return null;
  }

  return (
    <Panel label={label} title={title}>
      {summary ? (
        <p className="mb-2 max-w-3xl text-sm leading-6 text-stone-700">
          {summary}
        </p>
      ) : null}
      {example ? (
        <p className="mb-4 max-w-3xl text-sm leading-6 text-stone-600">
          {example}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-separate border-spacing-1 text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="px-2 py-2 text-left">T / distance</th>
              {buckets.map((bucket) => (
                <th key={bucket.id} className="px-2 py-2 text-center">
                  {bucket.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TARGET_CHECKPOINTS.flatMap((checkpointSecond) =>
              distanceBuckets.map((distanceBucket) => (
                <tr key={`${checkpointSecond}:${distanceBucket.id}`}>
                  <th className="px-2 py-2 text-left font-semibold text-stone-950">
                    T+{checkpointSecond}s
                    <span className="block text-xs font-medium text-stone-500">
                      {distanceBucket.label}
                    </span>
                  </th>
                  {buckets.map((bucket) => {
                    const cell = byKey.get(
                      `${checkpointSecond}:${distanceBucket.id}:${bucket.id}`,
                    );

                    return (
                      <td
                        key={bucket.id}
                        style={riskCellStyle(cell)}
                        className="h-24 rounded-[0.65rem] border border-black/10 px-2 py-2 text-center"
                      >
                        {riskCell(cell, {
                          detailField,
                          detailFormatter,
                          detailLabel,
                          showPrior,
                        })}
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function stabilityDistanceBuckets(cells) {
  const seen = new Map();

  for (const cell of cells ?? []) {
    if (!cell.distanceBucket || seen.has(cell.distanceBucket)) {
      continue;
    }

    seen.set(cell.distanceBucket, {
      id: cell.distanceBucket,
      label: cell.distanceBucketLabel,
    });
  }

  return [...seen.values()];
}

function pathRiskChopExample(cells) {
  const supported = (cell) =>
    cell &&
    !cell.sparse &&
    Number.isFinite(cell.leaderWinRate) &&
    Number.isFinite(cell.N);
  const preferred = [
    { checkpointSecond: 220, distanceBucket: "3_4", preChopBucket: "high" },
    { checkpointSecond: 220, distanceBucket: "4_5", preChopBucket: "high" },
    { checkpointSecond: 200, distanceBucket: "3_4", preChopBucket: "high" },
    { checkpointSecond: 240, distanceBucket: "3_4", preChopBucket: "high" },
  ];
  const preferredCell = preferred
    .map((target) =>
      (cells ?? []).find(
        (cell) =>
          cell.checkpointSecond === target.checkpointSecond &&
          cell.distanceBucket === target.distanceBucket &&
          cell.preChopBucket === target.preChopBucket,
      ),
    )
    .find(supported);
  const cell = preferredCell ?? (cells ?? []).find(supported);

  if (!cell) {
    return null;
  }

  const drawdown = Number.isFinite(cell.p90MaxAdverseDrawdownBps)
    ? `, p90 adverse drawdown ${bps(cell.p90MaxAdverseDrawdownBps)}`
    : "";

  return `Example: T+${cell.checkpointSecond}s, ${cell.distanceBucketLabel}, ${cell.preChopBucketLabel}: leader won ${pct(cell.leaderWinRate)} across N ${n(cell.N)}${drawdown}.`;
}

function RiskPanels({ computedAt, stability }) {
  const durability = stability.durability ?? {};
  const chopDegenerate = stability.preChopBucketDefinitions?.ranks?.degenerate;
  const [copyStatus, setCopyStatus] = useState("");

  async function copyLlmChartData() {
    try {
      await copyText(buildLlmChartDataExport(stability, computedAt));
      setCopyStatus("Copied LLM chart data");
      window.setTimeout(() => setCopyStatus(""), 2500);
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  return (
    <div className="space-y-5">
      <Panel label="Working readout" title="Current leader durability rule">
        <div className="space-y-3 text-sm leading-6 text-stone-700">
          <p>
            Treat 3 bps as the first candidate threshold, not the sweet spot,
            and re-check the prior T+220 around 5 bps or T+240 around 4 bps
            candidate after each tightened cohort refresh.
          </p>
          <p>
            Then reject weak path-quality cases: recent-lock, near-line-heavy,
            multi-flip chop, or 30s momentum against the current leader.
          </p>
          <p>
            This is the clearest answer to why the current leader fails: many
            checkpoint leaders are not real locks yet. They are recent-lock
            leaders, multi-flip chop leaders, near-line-heavy leaders, or
            unresolved leaders with insufficient margin.
          </p>
          <dl className="grid gap-2 rounded-[0.85rem] border border-black/10 bg-stone-50 p-4 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-stone-950">Recent lock risk</dt>
              <dd>The leader just took control and has not proven it can hold.</dd>
            </div>
            <div>
              <dt className="font-semibold text-stone-950">Multi-flip chop risk</dt>
              <dd>BTC has already shown it can cross the line repeatedly.</dd>
            </div>
            <div>
              <dt className="font-semibold text-stone-950">Near-line-heavy risk</dt>
              <dd>BTC spent too much time near the noise band, so the apparent leader is weak.</dd>
            </div>
            <div>
              <dt className="font-semibold text-stone-950">Momentum-against-leader risk</dt>
              <dd>The current leader is ahead, but recent direction is pushing against it.</dd>
            </div>
          </dl>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
            Working conclusion from the current rollup; keep retesting as sample size grows.
          </p>
        </div>
      </Panel>
      <Panel label="LLM export" title="Copy chart data">
        <p className="mb-4 max-w-3xl text-sm leading-6 text-stone-700">
          Copies structured JSON for Distance x chop, Distance x 30s momentum,
          and Pre-checkpoint path shapes, including bucket definitions,
          support rules, raw rates, counts, adverse drawdowns, and diagnostic medians.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyLlmChartData}
            className="rounded-full border border-black/10 bg-stone-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Copy LLM chart data
          </button>
          {copyStatus ? (
            <span className="text-xs font-medium text-stone-500">
              {copyStatus}
            </span>
          ) : null}
        </div>
      </Panel>
      {chopDegenerate ? (
        <div className="rounded-[0.85rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Chop thresholds are degenerate for this rollup; valid rows are bucketed as medium chop.
        </div>
      ) : null}
      <ChopBucketDefinitions definitions={stability.preChopBucketDefinitions} />
      <DiagnosticMatrix
        buckets={stability.chopBuckets}
        cells={stability.pathRiskByChop}
        dimensionKey="preChopBucket"
        example={pathRiskChopExample(stability.pathRiskByChop)}
        label="Path risk"
        summary="Rows hold checkpoint time and leader distance constant; columns split the pre-checkpoint tape into low, medium, and high chop. Read across a row to see whether the same-size lead survives differently when the prior path was cleaner or more chaotic."
        title="Distance x chop"
      />
      <DiagnosticMatrix
        buckets={stability.momentumAgreementBuckets}
        cells={stability.momentumAgreement}
        detailField="medianLeaderAlignedMomentum30sBps"
        detailFormatter={signedBps}
        detailLabel="aligned"
        dimensionKey="momentumAgreementBucket"
        label="Momentum"
        title="Distance x 30s momentum"
      />
      <DiagnosticMatrix
        buckets={stability.leadAgeBuckets}
        cells={stability.leaderAgeByDistance}
        dimensionKey="leadAgeBucket"
        label="Leader age"
        title="Distance x lead age"
      />
      <DiagnosticMatrix
        buckets={durability.buckets}
        cells={durability.cells}
        dimensionKey="durabilityBucket"
        label="Cohort durability"
        showPrior
        title="Distance x durability"
      />
      <PrePathShapes stability={stability} />
    </div>
  );
}

function PrePathShapes({ stability }) {
  const shapes = stability.prePathShapes;

  if (!shapes?.cells?.length) {
    return null;
  }

  const cells = new Map(
    shapes.cells.map((cell) => [`${cell.checkpointSecond}:${cell.prePathShape}`, cell]),
  );

  return (
    <Panel label="Path shape" title="Pre-checkpoint path shapes">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-separate border-spacing-1 text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="px-2 py-2 text-left">T</th>
              {shapes.buckets.map((shape) => (
                <th key={shape.id} className="px-2 py-2 text-center">
                  {shape.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TARGET_CHECKPOINTS.map((checkpointSecond) => (
              <tr key={checkpointSecond}>
                <th className="px-2 py-2 text-left font-semibold text-stone-950">
                  T+{checkpointSecond}s
                </th>
                {shapes.buckets.map((shape) => {
                  const cell = cells.get(`${checkpointSecond}:${shape.id}`);

                  return (
                    <td
                      key={shape.id}
                      style={riskCellStyle(cell)}
                      className="h-24 rounded-[0.65rem] border border-black/10 px-2 py-2 text-center"
                    >
                      <span className="block font-semibold text-stone-950">
                        {pct(cell?.shareOfCheckpoint)}
                      </span>
                      <span className="block text-xs text-stone-600">
                        N {n(cell?.N)}
                      </span>
                      <span className="block text-xs text-stone-600">
                        WR {pct(cell?.leaderWinRate)}
                      </span>
                      <span className="block text-xs text-stone-600">
                        SW {pct(cell?.stableLeaderWinRate)} / FL {pct(cell?.flipLossRate)}
                      </span>
                      <span className="block text-xs text-stone-600">
                        med {bps(cell?.distanceMedianBps)}
                      </span>
                      <span className="block text-xs text-stone-600">
                        p90 dd {bps(cell?.p90MaxAdverseDrawdownBps)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StabilitySection({ computedAt, stability }) {
  const searchParams = useSearchParams();
  const metricId = searchParams.get("stabilityMetric");
  const metrics = getCoreStabilityMetrics(stability);
  const metric =
    metrics.find((candidate) => candidate.id === metricId) ?? metrics[0];

  if (!metric) {
    return null;
  }

  function setMetric(nextMetricId) {
    const params = new URLSearchParams(searchParams.toString());

    params.set("stabilityMetric", nextMetricId);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <StabilityHeatmap
        computedAt={computedAt}
        metric={metric}
        metrics={metrics}
        onMetricChange={setMetric}
        stability={stability}
      />
      <RiskPanels computedAt={computedAt} stability={stability} />
      <PathTypes stability={stability} />
    </div>
  );
}

export default function AnalyticsDashboard() {
  const dashboard = useQuery(api.analytics.getDashboard);
  const marketCountsByDay = useQuery(api.markets.listCountsByDay, {
    limitDays: 14,
  });

  if (!dashboard) {
    return <Loading />;
  }

  const { computedAt, health, hourly, stability } = dashboard;

  if (!stability?.cleanCount) {
    return (
      <Panel label="Leader stability" title="No stability data yet">
        <p className="text-sm leading-6 text-stone-700">
          The stability rollup has not produced a clean cohort yet.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <DatasetEligibility health={health} stability={stability} />
      <DailyMarketCoverage health={health} rows={marketCountsByDay} />
      <HourlyMarketProfile computedAt={computedAt} hourly={hourly} />
      <Leader stability={stability} />
      <StabilitySection computedAt={computedAt} stability={stability} />
      <p className="text-right text-xs text-stone-500">
        Rollup computed {dateTime(computedAt)} UTC
      </p>
    </div>
  );
}
