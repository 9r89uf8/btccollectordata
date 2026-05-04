"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";

import { api } from "@/convex/_generated/api";

const CHECKPOINTS = [30, 60, 90, 120, 180, 200, 210, 220, 240, 270, 285, 295];
const panel = "rounded-[1.2rem] border border-black/10 bg-white/88 p-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]";

function n(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function bps(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} bps` : "n/a";
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
        are combined as endpoint wins here; flip loss, no-decision, and path
        risk stay available as separate metric views.
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
    </div>
  );
}

export default function AnalyticsDashboard() {
  const dashboard = useQuery(api.analytics.getDashboard);

  if (!dashboard) {
    return <Loading />;
  }

  const { computedAt, health, marketCountsByDay, stability } = dashboard;

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
      <StabilitySection computedAt={computedAt} stability={stability} />
      <p className="text-right text-xs text-stone-500">
        Rollup computed {dateTime(computedAt)} UTC
      </p>
    </div>
  );
}
