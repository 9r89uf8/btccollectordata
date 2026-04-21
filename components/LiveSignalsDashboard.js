"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";

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
  formatEtTime,
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
      <div className="h-[32rem] animate-pulse rounded-[2rem] bg-white/80" />
      <div className="h-80 animate-pulse rounded-[1.6rem] bg-white/80" />
    </section>
  );
}

function EmptyState({ message, title }) {
  return (
    <article className="rounded-[1.6rem] border border-dashed border-stone-300 bg-white/80 p-8 text-sm leading-7 text-stone-700">
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
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getToneClasses(
        tone,
      )}`}
    >
      {children}
    </span>
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

function formatSignalQuality(value) {
  if (value == null) {
    return "pending";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedBtcDelta(value) {
  if (value == null) {
    return "pending";
  }

  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatBtcUsd(
    Math.abs(value),
  )}`;
}

function formatRemainingDuration(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return { minutes: "00", seconds: "00" };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function formatTickAge(ageMs) {
  if (!Number.isFinite(ageMs)) {
    return "age pending";
  }

  if (ageMs < 1000) {
    return "just now";
  }

  const seconds = Math.round(ageMs / 1000);

  if (seconds < 60) {
    return `${seconds}s old`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds}s old`;
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
  const values = timeline
    .flatMap((item) => [item.btcChainlink, item.anchorPrice])
    .filter((value) => value != null);

  if (anchorPrice != null) {
    values.push(anchorPrice);
  }

  if (values.length === 0) {
    return [0, 1];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(10, Math.abs(min) * 0.001);
    return [min - padding, max + padding];
  }

  const padding = Math.max((max - min) * 0.1, 8);
  return [min - padding, max + padding];
}

function getBucketDomain(timeline, cadenceMs) {
  if (timeline.length === 0) {
    return [0, cadenceMs];
  }

  const firstBucket = timeline[0].secondBucket;
  const lastBucket = timeline[timeline.length - 1].secondBucket;

  if (firstBucket === lastBucket) {
    return [firstBucket, firstBucket + cadenceMs];
  }

  return [firstBucket, lastBucket];
}

function buildTickIndices(length) {
  if (length <= 1) {
    return [0];
  }

  const indices = new Set();
  const steps = Math.min(6, length);

  for (let index = 0; index < steps; index += 1) {
    indices.add(Math.round((index * (length - 1)) / Math.max(steps - 1, 1)));
  }

  return [...indices].sort((a, b) => a - b);
}

function buildLinePath(timeline, seriesKey, getX, getY) {
  let path = "";
  let drawing = false;

  for (const item of timeline) {
    const value = item?.[seriesKey];

    if (value == null) {
      drawing = false;
      continue;
    }

    const command = drawing ? "L" : "M";
    path += `${command} ${getX(item.secondBucket).toFixed(2)} ${getY(value).toFixed(2)} `;
    drawing = true;
  }

  return path.trim();
}

function findLastNonNullPoint(timeline, seriesKey) {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (timeline[index]?.[seriesKey] != null) {
      return timeline[index];
    }
  }

  return null;
}

function buildChartMarkers(market) {
  if (!market?.windowStartTs) {
    return [];
  }

  return LIVE_CHART_MARKERS.map((marker) => ({
    ...marker,
    secondBucket: market.windowStartTs + marker.second * 1000,
  }));
}

function LiveRemainingClock({ windowEndTs }) {
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const remainingMs =
    Number.isFinite(windowEndTs) && Number.isFinite(nowTs)
      ? Math.max(0, windowEndTs - nowTs)
      : null;
  const remaining = formatRemainingDuration(remainingMs);

  return (
    <div className="flex min-w-[9.5rem] items-start justify-end gap-4 text-right">
      <div>
        <p className="text-[2.4rem] font-semibold leading-none tracking-[-0.06em] text-rose-500">
          {remaining.minutes}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
          Mins
        </p>
      </div>
      <div>
        <p className="text-[2.4rem] font-semibold leading-none tracking-[-0.06em] text-rose-500">
          {remaining.seconds}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
          Sec
        </p>
      </div>
    </div>
  );
}

function SignalStripChart({
  anchorValue = null,
  axisFormatter,
  height = 270,
  markers = [],
  series,
  timeline,
  title,
  yDomain,
}) {
  if (timeline.length === 0) {
    return (
      <div className="rounded-[1.4rem] border border-black/5 bg-white/75 p-6 text-sm text-stone-600">
        No replay data yet for {title.toLowerCase()}.
      </div>
    );
  }

  const width = 980;
  const left = 0;
  const right = 88;
  const top = 14;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const cadenceMs = Math.max(
    timeline[1]?.secondBucket - timeline[0]?.secondBucket || 1000,
    1000,
  );
  const [bucketMin, bucketMax] = getBucketDomain(timeline, cadenceMs);
  const [domainMin, domainMax] = yDomain;
  const axisTicks = buildAxisTicks(yDomain, 4);
  const tickIndices = buildTickIndices(timeline.length);
  const getX = (bucket) =>
    left + ((bucket - bucketMin) / Math.max(bucketMax - bucketMin, cadenceMs)) * plotWidth;
  const getY = (value) =>
    top + ((domainMax - value) / Math.max(domainMax - domainMin, 0.000001)) * plotHeight;
  const lastSeriesPoint = findLastNonNullPoint(timeline, series[0]?.key);

  return (
    <div className="rounded-[1.45rem] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(247,245,240,0.98))] p-4 shadow-[0_16px_50px_rgba(30,30,30,0.06)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {axisTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={getY(tick)}
              y2={getY(tick)}
              stroke="rgba(120,113,108,0.18)"
            />
            <text
              x={width - right + 10}
              y={getY(tick) + 4}
              fill="#78716c"
              fontSize="12"
              textAnchor="start"
            >
              {axisFormatter(tick)}
            </text>
          </g>
        ))}

        {markers
          .filter(
            (marker) =>
              marker.secondBucket >= bucketMin && marker.secondBucket <= bucketMax,
          )
          .map((marker) => (
            <g key={marker.id}>
              <line
                x1={getX(marker.secondBucket)}
                x2={getX(marker.secondBucket)}
                y1={top}
                y2={top + plotHeight}
                stroke="rgba(251,146,60,0.26)"
                strokeDasharray="4 7"
              />
              <text
                x={getX(marker.secondBucket)}
                y={top + plotHeight + 18}
                fill="#d97706"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
              >
                {marker.label}
              </text>
            </g>
          ))}

        {anchorValue != null ? (
          <g>
            <line
              x1={left}
              x2={width - right}
              y1={getY(anchorValue)}
              y2={getY(anchorValue)}
              stroke="#f59e0b"
              strokeDasharray="8 8"
            />
            <g transform={`translate(${width - right + 2}, ${getY(anchorValue) - 11})`}>
              <rect
                width="64"
                height="22"
                rx="11"
                fill="#9ca3af"
              />
              <text
                x="32"
                y="15"
                fill="white"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
              >
                Target
              </text>
            </g>
          </g>
        ) : null}

        {series.map((item) => {
          const path = buildLinePath(timeline, item.key, getX, getY);

          if (!path) {
            return null;
          }

          return (
            <path
              key={item.key}
              d={path}
              fill="none"
              stroke={item.color}
              strokeDasharray={item.dashArray ?? undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          );
        })}

        {lastSeriesPoint ? (
          <circle
            cx={getX(lastSeriesPoint.secondBucket)}
            cy={getY(lastSeriesPoint[series[0].key])}
            fill={series[0].color}
            r="4"
            stroke="white"
            strokeWidth="2"
          />
        ) : null}

        {tickIndices.map((index) => {
          const item = timeline[index];
          const x = getX(item.secondBucket);

          return (
            <g key={`${title}-${index}`}>
              <text
                x={x}
                y={height - 8}
                fill="#78716c"
                fontSize="11"
                textAnchor="middle"
              >
                {formatEtTime(item.ts)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SignalExplainRow({ evaluation }) {
  if (!evaluation?.ready) {
    return null;
  }

  return (
    <div className="grid gap-3 border-t border-black/8 pt-5 sm:grid-cols-3">
      <div className="rounded-[1.1rem] bg-stone-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          Signal quality
        </p>
        <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950">
          {formatSignalQuality(evaluation.signalQualityScore)}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          {evaluation.qualityBucketLabel}. Higher means BTC reached its current
          side more directly, with less chop.
        </p>
      </div>

      <div className="rounded-[1.1rem] bg-stone-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          BTC side at checkpoint
        </p>
        <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950">
          {evaluation.side === "up" ? "Up" : "Down"} {evaluation.distanceBucketLabel}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          At {evaluation.checkpointLabel}, BTC was {formatSignedBtcDelta(evaluation.deltaFromAnchorUsd)} from the anchor.
        </p>
      </div>

      <div className="rounded-[1.1rem] bg-stone-50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          Historical checkpoint read
        </p>
        <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950">
          {formatProbability(evaluation.displayedProbability)}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Displayed price for the current side at the sampled checkpoint.
        </p>
      </div>
    </div>
  );
}

function EvaluationGrid({ rules, signal }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {signal.evaluations.map((evaluation) => {
        const matchedRule =
          evaluation.ready
            ? rules.find(
                (rule) =>
                  rule.checkpointSecond === evaluation.checkpointSecond &&
                  rule.side === evaluation.side &&
                  rule.distanceBucketId === evaluation.distanceBucketId &&
                  rule.qualityBucketId === evaluation.qualityBucketId,
              ) ?? null
            : null;

        return (
          <article
            key={evaluation.checkpointId}
            className="rounded-[1.35rem] border border-black/10 bg-white/88 p-5 shadow-[0_14px_40px_rgba(30,30,30,0.05)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                {evaluation.checkpointLabel}
              </p>
              {!evaluation.ready ? (
                <Pill tone="stone">Waiting</Pill>
              ) : (
                <Pill tone={evaluation.side === "up" ? "emerald" : "rose"}>
                  {evaluation.side === "up" ? "Up side" : "Down side"}
                </Pill>
              )}
            </div>

            {!evaluation.ready ? (
              <p className="mt-4 text-sm leading-7 text-stone-700">
                {evaluation.reason === "checkpoint_not_reached"
                  ? "Checkpoint not reached yet."
                  : evaluation.reason === "missing_anchor"
                    ? "Price to beat is not available yet."
                    : "No BTC snapshot was captured close enough to this checkpoint."}
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1rem] bg-stone-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                      BTC vs anchor
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950">
                      {formatSignedBtcDelta(evaluation.deltaFromAnchorUsd)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {evaluation.distanceBucketLabel}
                    </p>
                  </div>
                  <div className="rounded-[1rem] bg-stone-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                      Signal quality
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950">
                      {formatSignalQuality(evaluation.signalQualityScore)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {evaluation.qualityBucketLabel}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-7 text-stone-700">
                  {matchedRule
                    ? `${matchedRule.checkpointLabel}, ${matchedRule.side === "up" ? "Up" : "Down"} ${matchedRule.distanceBucketLabel}, ${matchedRule.qualityBucketLabel}. Historical win rate ${formatProbability(
                        matchedRule.winRate,
                      )} on ${formatCount(matchedRule.sampleCount)} markets.`
                    : "This checkpoint state does not map to one of the historical 70%+ / 40-sample rules yet."}
                </p>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

function LiveMarketHero({ latestBtcTick, rules, signal, timeline, cadenceMs }) {
  const call = buildLiveCall(signal, rules);
  const activeEvaluation = call.activeEvaluation;
  const matchedRule = call.matchedRule;
  const latestTickPrice = Number.isFinite(latestBtcTick?.price)
    ? latestBtcTick.price
    : null;
  const displayedCurrentBtcPrice = latestTickPrice ?? signal.currentBtcPrice;
  const displayedCurrentDelta =
    displayedCurrentBtcPrice != null && signal.anchorPrice != null
      ? displayedCurrentBtcPrice - signal.anchorPrice
      : null;
  const currentPriceSource = latestTickPrice != null
    ? `${latestBtcTick?.stale ? "Stale " : ""}Chainlink tick, ${formatTickAge(
        latestBtcTick?.ageMs,
      )}`
    : `Snapshot bucket, ${formatSamplingCadence(cadenceMs)} cadence`;
  const chartMarkers = buildChartMarkers(signal.market);
  const btcTimeline = timeline.map((item) => ({
    ...item,
    anchorPrice: signal.anchorPrice,
  }));
  const btcDomain = getBtcDomain(btcTimeline, signal.anchorPrice);
  const probabilityDomain = [0, 1];

  return (
    <article className="overflow-hidden rounded-[2rem] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,245,240,0.98))] p-6 shadow-[0_28px_90px_rgba(24,24,24,0.1)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[0.95rem] bg-[#f7931a] text-[2.2rem] font-semibold leading-none text-white">
            ₿
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Pill tone={call.status === "up" ? "emerald" : call.status === "down" ? "rose" : "stone"}>
                {call.label}
              </Pill>
              <Pill tone="stone">{signal.market.captureMode}</Pill>
              <Pill tone="stone">{signal.market.dataQuality}</Pill>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-stone-950 sm:text-[2.3rem]">
              {signal.market.question}
            </h2>
            <p className="mt-2 text-lg text-slate-600">
              {formatEtRange(signal.market.windowStartTs, signal.market.windowEndTs)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-6">
          <Link
            href={`/markets/${signal.market.slug}`}
            className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-950 hover:text-stone-50"
          >
            Open detail
          </Link>
          <LiveRemainingClock windowEndTs={signal.market.windowEndTs} />
        </div>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.25rem] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]">
          <p className="text-sm font-semibold text-slate-500">Price To Beat</p>
          <p className="mt-2 text-[2.15rem] font-semibold tracking-[-0.05em] text-slate-500">
            {formatBtcUsd(signal.anchorPrice)}
          </p>
        </div>

        <div className="rounded-[1.25rem] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]">
          <p className="text-sm font-semibold text-[#f7931a]">
            Current Price{" "}
            <span
              className={
                displayedCurrentDelta == null
                  ? "text-stone-400"
                  : displayedCurrentDelta >= 0
                    ? "text-emerald-500"
                    : "text-rose-500"
              }
            >
              {displayedCurrentDelta == null
                ? ""
                : `${displayedCurrentDelta >= 0 ? "▲" : "▼"} ${formatSignedBtcDelta(
                    displayedCurrentDelta,
                  )}`}
            </span>
          </p>
          <p className="mt-2 text-[2.15rem] font-semibold tracking-[-0.05em] text-[#f7931a]">
            {formatBtcUsd(displayedCurrentBtcPrice)}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            {currentPriceSource}
          </p>
        </div>

        <div className="rounded-[1.25rem] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]">
          <p className="text-sm font-semibold text-slate-500">Current Market Price</p>
          <div className="mt-2 space-y-1 text-lg font-semibold tracking-[-0.04em] text-stone-950">
            <p>Up {formatProbability(signal.currentUpDisplayed)}</p>
            <p>Down {formatProbability(signal.currentDownDisplayed)}</p>
          </div>
        </div>

        <div className="rounded-[1.25rem] bg-white px-5 py-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]">
          <p className="text-sm font-semibold text-slate-500">Live read</p>
          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-stone-950">
            {activeEvaluation?.ready
              ? `${activeEvaluation.checkpointLabel} ${activeEvaluation.side === "up" ? "Up" : "Down"}`
              : "Waiting"}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Latest observed {signal.latestSnapshotTs ? formatEtDateTime(signal.latestSnapshotTs) : "pending"} at {formatSamplingCadence(cadenceMs)} cadence.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <SignalStripChart
          anchorValue={signal.anchorPrice}
          axisFormatter={(tick) =>
            new Intl.NumberFormat("en-US", {
              maximumFractionDigits: 0,
            }).format(tick)
          }
          height={340}
          markers={chartMarkers}
          series={[
            {
              color: "#f7931a",
              key: "btcChainlink",
            },
          ]}
          timeline={btcTimeline}
          title="BTC"
          yDomain={btcDomain}
        />
        <p className="text-sm leading-7 text-stone-700">
          {matchedRule
            ? `Historical match: ${matchedRule.checkpointLabel}, ${matchedRule.side === "up" ? "Up" : "Down"} ${matchedRule.distanceBucketLabel}, ${matchedRule.qualityBucketLabel}. That setup won ${formatProbability(
                matchedRule.winRate,
              )} across ${formatCount(matchedRule.sampleCount)} markets.`
            : call.reason}
        </p>
      </div>

      <div className="mt-6">
        <SignalExplainRow evaluation={activeEvaluation} />
      </div>

      <div className="mt-6">
        <SignalStripChart
          axisFormatter={(tick) => formatProbability(tick)}
          height={260}
          markers={chartMarkers}
          series={[
            {
              color: "#0f766e",
              key: "upDisplayed",
            },
            {
              color: "#be185d",
              key: "downDisplayed",
            },
          ]}
          timeline={timeline}
          title="Displayed Price"
          yDomain={probabilityDomain}
        />
      </div>
    </article>
  );
}

export default function LiveSignalsDashboard() {
  const rulesResponse = useQuery(api.signals.getLiveCallRules, {
    dateRange: LIVE_CALL_RULE_DATE_RANGE,
    quality: "all",
  });
  const liveSignalResponse = useQuery(api.signals.getActiveLiveSignals, {});
  const latestBtcTickResponse = useQuery(api.btc.getLatestChainlinkBtc, {});

  if (rulesResponse === undefined || liveSignalResponse === undefined) {
    return <LoadingState />;
  }

  const rules = rulesResponse?.rules ?? [];
  const signal = liveSignalResponse?.signal ?? null;
  const latestBtcTick = latestBtcTickResponse ?? null;
  const replaySnapshots = liveSignalResponse?.snapshots ?? [];
  const replay = signal ? buildReplayTimeline(signal.market, replaySnapshots) : null;
  const cadenceMs = replay?.cadenceMs ?? 1000;
  const timeline = replay?.timeline ?? [];

  return (
    <section className="space-y-6">
      {!signal ? (
        <EmptyState
          title="No live market"
          message="No active BTC 5-minute market is currently inside its live window, so the checklist has nothing to score."
        />
      ) : (
        <>
          <LiveMarketHero
            latestBtcTick={latestBtcTick}
            rules={rules}
            signal={signal}
            timeline={timeline}
            cadenceMs={cadenceMs}
          />

          <EvaluationGrid rules={rules} signal={signal} />
        </>
      )}

      <article className="rounded-[1.45rem] border border-black/10 bg-white/88 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
              Historical rule table
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              Setups that currently qualify for the live checklist
            </h3>
          </div>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-stone-500">
            <span>Window {LIVE_CALL_RULE_DATE_RANGE.toUpperCase()}</span>
            <span>{formatCount(LIVE_CALL_RULE_MIN_SAMPLE_SIZE)}+ samples</span>
            <span>{formatProbability(LIVE_CALL_RULE_MIN_WIN_RATE)}+ win rate</span>
          </div>
        </div>

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
