"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import ReplayLineChart from "@/components/charts/ReplayLineChart";
import { buildReplayTimeline } from "@/components/marketReplay.mjs";
import { api } from "@/convex/_generated/api";
import {
  buildLiveCall,
  LIVE_CALL_RULE_DATE_RANGE,
  LIVE_CALL_RULE_MIN_SAMPLE_SIZE,
  LIVE_CALL_RULE_MIN_WIN_RATE,
} from "@/packages/shared/src/liveSignals.js";
import {
  formatBtcUsd,
  formatEtDateTime,
  formatEtRange,
  formatProbability,
  getToneClasses,
} from "@/components/marketFormat";

const LIVE_CHART_MARKERS = [
  { id: "t60", label: "T+60", second: 60 },
  { id: "t120", label: "T+120", second: 120 },
  { id: "t180", label: "T+180", second: 180 },
  { id: "t240", label: "T+240", second: 240 },
  { id: "t295", label: "T+295", second: 295 },
];

function LoadingState() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-[1.35rem] bg-white/80"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-[1.45rem] bg-white/80" />
    </section>
  );
}

function EmptyState({ message, title }) {
  return (
    <article className="rounded-[1.45rem] border border-dashed border-stone-300 bg-white/80 p-6 text-sm leading-7 text-stone-700">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
        {title}
      </p>
      <p className="mt-3">{message}</p>
    </article>
  );
}

function Pill({ tone, children }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getToneClasses(
        tone,
      )}`}
    >
      {children}
    </span>
  );
}

function StatCard({ eyebrow, title, body }) {
  return (
    <article className="rounded-[1.35rem] border border-black/10 bg-white/85 p-5 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-7 text-stone-700">{body}</p>
    </article>
  );
}

function formatCount(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeSecond(value) {
  if (!Number.isFinite(value)) {
    return "pending";
  }

  return `T+${formatCount(value)}s`;
}

function formatSignalQuality(value) {
  if (value == null) {
    return "pending";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatSamplingCadence(cadenceMs) {
  if (!Number.isFinite(cadenceMs) || cadenceMs <= 0) {
    return "pending";
  }

  if (cadenceMs % 1000 === 0) {
    return `${cadenceMs / 1000}s`;
  }

  return `${(cadenceMs / 1000).toFixed(1)}s`;
}

function getCallTone(status) {
  if (status === "up") {
    return "emerald";
  }

  if (status === "down") {
    return "rose";
  }

  return "stone";
}

function getEvaluationTone(side) {
  if (side === "up") {
    return "emerald";
  }

  if (side === "down") {
    return "rose";
  }

  return "stone";
}

function formatRuleRead(rule) {
  if (!rule) {
    return "No historically strong setup matched this checkpoint state.";
  }

  return `${rule.checkpointLabel}, ${rule.side === "up" ? "Up" : "Down"} ${rule.distanceBucketLabel}, ${rule.qualityBucketLabel}. Historical win rate ${formatProbability(
    rule.winRate,
  )} on ${formatCount(rule.sampleCount)} markets.`;
}

function buildAxisTicks(domain, count = 4) {
  const [min, max] = domain;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }

  if (min === max) {
    return [min];
  }

  const ticks = [];

  for (let index = 0; index < count; index += 1) {
    ticks.push(min + ((max - min) * index) / Math.max(count - 1, 1));
  }

  return ticks;
}

function getBtcDomain(timeline, anchorPrice) {
  const btcValues = timeline
    .map((item) => item.btcChainlink)
    .filter((value) => value != null);

  if (anchorPrice != null) {
    btcValues.push(anchorPrice);
  }

  if (btcValues.length === 0) {
    return [0, 1];
  }

  const min = Math.min(...btcValues);
  const max = Math.max(...btcValues);

  if (min === max) {
    const padding = Math.max(10, Math.abs(min) * 0.001);
    return [min - padding, max + padding];
  }

  const padding = Math.max((max - min) * 0.08, 8);
  return [min - padding, max + padding];
}

function buildChartMarkers(market) {
  if (!market?.windowStartTs) {
    return [];
  }

  return LIVE_CHART_MARKERS.map((marker) => ({
    key: marker.id,
    label: marker.label,
    secondBucket: market.windowStartTs + marker.second * 1000,
  }));
}

function EvaluationCard({ evaluation, matchedRule }) {
  if (!evaluation) {
    return (
      <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          Checkpoint
        </p>
        <p className="mt-2 text-sm text-stone-700">No checkpoint data yet.</p>
      </div>
    );
  }

  if (!evaluation.ready) {
    return (
      <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            {evaluation.checkpointLabel}
          </p>
          <Pill tone="stone">waiting</Pill>
        </div>
        <p className="mt-3 text-sm text-stone-700">
          {evaluation.reason === "checkpoint_not_reached"
            ? "Checkpoint not reached yet."
            : evaluation.reason === "missing_anchor"
              ? "Anchor is still missing."
              : "No BTC snapshot close enough to this checkpoint."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          {evaluation.checkpointLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <Pill tone={getEvaluationTone(evaluation.side)}>
            {evaluation.side === "up" ? "Up side" : "Down side"}
          </Pill>
          {matchedRule ? (
            <Pill tone="emerald">historical match</Pill>
          ) : (
            <Pill tone="stone">no rule match</Pill>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            BTC vs anchor
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {evaluation.deltaFromAnchorUsd == null
              ? "pending"
              : `${evaluation.deltaFromAnchorUsd > 0 ? "+" : ""}${formatBtcUsd(
                  evaluation.deltaFromAnchorUsd,
                )}`}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {evaluation.distanceBucketLabel ?? "below tracked bucket"}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Signal quality
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {formatSignalQuality(evaluation.signalQualityScore)}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {evaluation.qualityBucketLabel ?? "not bucketed"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-stone-700">
        {matchedRule
          ? formatRuleRead(matchedRule)
          : "This checkpoint state does not map to one of the historical 70%+ / 40-sample rules yet."}
      </p>
    </div>
  );
}

function MarketSignalCard({ rules, signal }) {
  const call = buildLiveCall(signal, rules);
  const activeEvaluation = call.activeEvaluation;
  const matchedRule = call.matchedRule;

  return (
    <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={getCallTone(call.status)}>{call.label}</Pill>
            <Pill tone="stone">{signal.market.captureMode}</Pill>
            <Pill tone="stone">{signal.market.dataQuality}</Pill>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Current market
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
            {signal.market.question}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
            {call.reason}
          </p>
        </div>
        <Link
          href={`/markets/${signal.market.slug}`}
          className="inline-flex rounded-full border border-black/10 bg-stone-950 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
        >
          Open market detail
        </Link>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-5">
        <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Window
          </p>
          <p className="mt-2 text-sm leading-7 text-stone-700">
            {formatEtRange(signal.market.windowStartTs, signal.market.windowEndTs)}
          </p>
        </div>
        <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Price to beat
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {formatBtcUsd(signal.anchorPrice)}
          </p>
        </div>
        <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Latest BTC / second
          </p>
          <p className="mt-2 text-lg font-semibold text-stone-950">
            {formatBtcUsd(signal.currentBtcPrice)}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {formatRelativeSecond(signal.latestObservedSecond)}
          </p>
        </div>
        <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Current displayed
          </p>
          <p className="mt-2 text-sm leading-7 text-stone-700">
            Up {formatProbability(signal.currentUpDisplayed)}
          </p>
          <p className="text-sm leading-7 text-stone-700">
            Down {formatProbability(signal.currentDownDisplayed)}
          </p>
        </div>
        <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Snapshot quality
          </p>
          <p className="mt-2 text-sm leading-7 text-stone-700">
            {signal.currentSnapshotQuality ?? "pending"}
          </p>
          <p className="text-xs text-stone-500">
            {formatCount(signal.liveSnapshotsLoaded)} live buckets loaded
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {signal.evaluations.map((evaluation) => (
          <EvaluationCard
            key={evaluation.checkpointId}
            evaluation={evaluation}
            matchedRule={
              evaluation.ready
                ? rules.find(
                    (rule) =>
                      rule.checkpointSecond === evaluation.checkpointSecond &&
                      rule.side === evaluation.side &&
                      rule.distanceBucketId === evaluation.distanceBucketId &&
                      rule.qualityBucketId === evaluation.qualityBucketId,
                  ) ?? null
                : null
            }
          />
        ))}
      </div>

      {matchedRule && activeEvaluation ? (
        <div className="mt-6 rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-7 text-emerald-950">
          <p className="font-semibold uppercase tracking-[0.16em]">
            Historical read
          </p>
          <p className="mt-2">
            At {activeEvaluation.checkpointLabel}, this exact BTC bucket won{" "}
            <strong>{formatProbability(matchedRule.winRate)}</strong> across{" "}
            <strong>{formatCount(matchedRule.sampleCount)}</strong> markets.
            Average displayed price at that checkpoint was{" "}
            <strong>{formatProbability(matchedRule.averageDisplayedProbability)}</strong>.
          </p>
        </div>
      ) : null}

      <p className="mt-4 text-xs uppercase tracking-[0.16em] text-stone-500">
        Latest snapshot captured {formatEtDateTime(signal.latestSnapshotTs)}.
      </p>
    </article>
  );
}

export default function LiveSignalsDashboard() {
  const rulesResponse = useQuery(api.signals.getLiveCallRules, {
    dateRange: LIVE_CALL_RULE_DATE_RANGE,
    quality: "all",
  });
  const liveSignalResponse = useQuery(api.signals.getActiveLiveSignals, {});

  if (rulesResponse === undefined || liveSignalResponse === undefined) {
    return <LoadingState />;
  }

  const rules = rulesResponse?.rules ?? [];
  const signal = liveSignalResponse?.signal ?? null;
  const replaySnapshots = liveSignalResponse?.snapshots ?? [];

  const replay = signal ? buildReplayTimeline(signal.market, replaySnapshots) : null;
  const cadenceMs = replay?.cadenceMs ?? 1000;
  const timeline = replay?.timeline ?? [];
  const chartMarkers = signal ? buildChartMarkers(signal.market) : [];
  const btcTimeline = timeline.map((item) => ({
    ...item,
    anchorPrice: signal?.anchorPrice ?? null,
  }));
  const btcDomain = getBtcDomain(timeline, signal?.anchorPrice ?? null);
  const btcTicks = buildAxisTicks(btcDomain, 4);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        <StatCard
          eyebrow="Rule window"
          title={LIVE_CALL_RULE_DATE_RANGE.toUpperCase()}
          body="Historical rule rows are derived from the last seven days of finalized summaries."
        />
        <StatCard
          eyebrow="Support floor"
          title={`${formatCount(LIVE_CALL_RULE_MIN_SAMPLE_SIZE)} markets`}
          body="Only rows with at least forty historical examples make it into the live checklist."
        />
        <StatCard
          eyebrow="Hit-rate floor"
          title={formatProbability(LIVE_CALL_RULE_MIN_WIN_RATE)}
          body="The page only promotes setups that historically cleared a 70% win rate."
        />
      </div>

      <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
          Live checklist
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">
          Call the current market from BTC state, not just the displayed percentage
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
          The page scores a single current BTC 5-minute market, waits for the
          latest completed checkpoint, maps BTC distance from the anchor plus
          path quality into the historically strong rule table, and returns{" "}
          <strong>Call Up</strong>, <strong>Call Down</strong>, or{" "}
          <strong>No clear call</strong>. The charts below keep BTC, the price
          to beat, and the live Up / Down prices on the same checkpoint labels.
        </p>
      </article>

      {!signal ? (
        <EmptyState
          title="No live market"
          message="No active BTC 5-minute market is currently inside its live window, so the checklist has nothing to score."
        />
      ) : (
        <>
          <MarketSignalCard rules={rules} signal={signal} />

          <ReplayLineChart
            description={`This chart follows the current ${formatSamplingCadence(
              cadenceMs,
            )} replay buckets for the live market. The blue line is observed Chainlink BTC, the amber line is the price to beat, and the dashed markers label the live checkpoints directly on the chart.`}
            emptyMessage="No BTC-linked snapshots have been written for this market yet."
            eyebrow="BTC state"
            formatAxisValue={(tick) =>
              new Intl.NumberFormat("en-US", {
                maximumFractionDigits: 0,
              }).format(tick)
            }
            markers={chartMarkers}
            sampleCadenceMs={cadenceMs}
            series={[
              {
                color: "#1d4ed8",
                key: "btcChainlink",
                label: "Chainlink BTC",
              },
              {
                color: "#d97706",
                dashArray: "8 6",
                key: "anchorPrice",
                label: "Price to beat",
              },
            ]}
            timeline={btcTimeline}
            title="BTC price vs. price to beat"
            yDomain={btcDomain}
            yTicks={btcTicks}
          />

          <ReplayLineChart
            description={`Up and Down displayed prices stay on the same ${formatSamplingCadence(
              cadenceMs,
            )} replay buckets as BTC so you can compare market pricing against the checkpoint labels without leaving the page.`}
            emptyMessage="No displayed-price snapshots have been written for this market yet."
            eyebrow="Market price"
            formatAxisValue={(tick) => formatProbability(tick)}
            markers={chartMarkers}
            sampleCadenceMs={cadenceMs}
            series={[
              {
                color: "#0f766e",
                key: "upDisplayed",
                label: signal.market.outcomeLabels.upLabel,
              },
              {
                color: "#be185d",
                key: "downDisplayed",
                label: signal.market.outcomeLabels.downLabel,
              },
            ]}
            timeline={timeline}
            title="Displayed Up / Down price over time"
            yDomain={[0, 1]}
            yTicks={[0, 0.25, 0.5, 0.75, 1]}
          />
        </>
      )}

      <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
          Historical rule table
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
          Setups that currently qualify for the live checklist
        </h3>

        {rules.length === 0 ? (
          <p className="mt-4 text-sm leading-7 text-stone-700">
            No historical rows currently clear the live checklist thresholds.
          </p>
        ) : (
          <div className="mt-5 overflow-auto rounded-[1.2rem] border border-black/10">
            <table className="min-w-full text-left text-sm text-stone-700">
              <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Checkpoint</th>
                  <th className="px-4 py-3 font-semibold">Side</th>
                  <th className="px-4 py-3 font-semibold">Distance bucket</th>
                  <th className="px-4 py-3 font-semibold">Quality bucket</th>
                  <th className="px-4 py-3 font-semibold">Samples</th>
                  <th className="px-4 py-3 font-semibold">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr
                    key={`${rule.checkpoint}-${rule.side}-${rule.distanceBucketId}-${rule.qualityBucketId}`}
                    className="border-t border-stone-200/80 bg-white"
                  >
                    <td className="px-4 py-3 font-medium text-stone-950">
                      {rule.checkpointLabel}
                    </td>
                    <td className="px-4 py-3">
                      {rule.side === "up" ? "Up" : "Down"}
                    </td>
                    <td className="px-4 py-3">{rule.distanceBucketLabel}</td>
                    <td className="px-4 py-3">{rule.qualityBucketLabel}</td>
                    <td className="px-4 py-3">{formatCount(rule.sampleCount)}</td>
                    <td className="px-4 py-3">{formatProbability(rule.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
