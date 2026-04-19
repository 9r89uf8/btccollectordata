"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  ANALYTICS_DATE_RANGE_OPTIONS,
  ANALYTICS_MIN_SAMPLE_OPTIONS,
  ANALYTICS_QUALITY_OPTIONS,
  COHORT_DRILLDOWN_CHECKPOINT_OPTIONS,
  COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS,
  COHORT_DRILLDOWN_SIDE_OPTIONS,
} from "@/packages/shared/src/analytics.js";
import {
  formatBtcUsd,
  formatEtDateTime,
  formatProbability,
  getToneClasses,
} from "@/components/marketFormat";

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

function ControlField({ children, label }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-stone-700">
      <span className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function MetricPanel({ detail, label, value }) {
  return (
    <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-stone-700">{detail}</p>
    </div>
  );
}

function TableShell({ caption, children, title }) {
  return (
    <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
            {caption}
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
            {title}
          </h3>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function LoadingState() {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-[1.35rem] bg-white/80"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-[1.45rem] bg-white/80" />
      <div className="h-80 animate-pulse rounded-[1.45rem] bg-white/80" />
    </section>
  );
}

function EmptyTable({ message }) {
  return (
    <div className="rounded-[1.2rem] border border-dashed border-stone-300 bg-stone-50/70 p-5 text-sm leading-7 text-stone-700">
      {message}
    </div>
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

function formatCountMetric(value) {
  if (value == null) {
    return "pending";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value);
}

function formatSideLabel(side) {
  if (side === "up") {
    return "Up";
  }

  if (side === "down") {
    return "Down";
  }

  return side ?? "pending";
}

function formatSignedBtcUsd(value) {
  if (value == null) {
    return "pending";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${formatBtcUsd(value)}`;
}

function formatRateDifference(value) {
  if (value == null) {
    return "pending";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)} pts`;
}

function formatRangeCi(low, high, formatter) {
  if (low == null || high == null) {
    return "95% CI unavailable";
  }

  return `95% CI ${formatter(low)} to ${formatter(high)}`;
}

function formatProbabilityCi(summary) {
  if (!summary || summary.rate == null) {
    return "95% CI unavailable";
  }

  return formatRangeCi(summary.ciLow, summary.ciHigh, formatProbability);
}

function formatValueByMetric(value, format) {
  if (format === "share") {
    return formatProbability(value);
  }

  if (format === "count") {
    return formatCountMetric(value);
  }

  if (format === "signedBtcUsd") {
    return formatSignedBtcUsd(value);
  }

  return formatBtcUsd(value);
}

function formatStatusLabel(status) {
  if (status === "supported") {
    return "supported at 95%";
  }

  if (status === "not_supported") {
    return "not supported";
  }

  return "underpowered";
}

function getStatusTone(status) {
  if (status === "supported") {
    return "emerald";
  }

  if (status === "not_supported") {
    return "stone";
  }

  return "amber";
}

function formatCalibrationGap(value) {
  if (value == null) {
    return "pending";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)} pts`;
}

function formatBoundaryMoveHeadline(headline) {
  if (!headline || headline.sampleCount === 0) {
    return "No finalized markets in the current filter set have both a start and end BTC reference yet.";
  }

  return `${formatProbability(headline.share)} of usable markets moved at least ${formatBtcUsd(
    headline.thresholdUsd,
  )} from price to beat to close over 5 minutes.`;
}

function formatSupportFloorMessage(usableCount, minSampleSize) {
  if (usableCount >= minSampleSize) {
    return "Share of usable markets whose absolute BTC move clears each USD threshold.";
  }

  return `At least ${formatCount(minSampleSize)} usable markets are required by the current support floor, but only ${formatCount(
    usableCount,
  )} currently have both boundary references.`;
}

function formatHeadlineFinding(headlineFinding) {
  if (!headlineFinding || headlineFinding.sampleCount === 0) {
    return "No finalized markets in the current filter set reached Up >= 70% at T+60.";
  }

  return `When Up was at least 70% by T+60, Up won ${formatProbability(headlineFinding.winRate)} of the time across ${formatCount(headlineFinding.sampleCount)} market${headlineFinding.sampleCount === 1 ? "" : "s"}.`;
}

function formatDateSpan(minTs, maxTs) {
  if (minTs == null || maxTs == null) {
    return "No finalized market windows match the current filters.";
  }

  return `${formatEtDateTime(minTs)} to ${formatEtDateTime(maxTs)}`;
}

function formatRelativeSecond(value) {
  if (value === null || value === undefined) {
    return "Never";
  }

  return `T+${formatCount(value)}s`;
}

function formatOffsetClock(second) {
  if (second === null || second === undefined) {
    return "Never";
  }

  const totalSeconds = Math.max(0, Number(second) || 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeSecondWithClock(value) {
  if (value === null || value === undefined) {
    return "Never";
  }

  return `${formatRelativeSecond(value)} (${formatOffsetClock(value)})`;
}

function formatCheckpointLabel(checkpointSecond) {
  return `T+${formatCount(checkpointSecond)}s (${formatOffsetClock(checkpointSecond)})`;
}

function formatBtcWinningSideHeadline(headline) {
  if (!headline || headline.sampleCount === 0) {
    return "No finalized markets match the current filters for BTC first-winning-side timing yet.";
  }

  return `${formatProbability(headline.share)} of filtered markets first reached the eventual winning side by ${formatCheckpointLabel(
    headline.checkpointSecond,
  )}.`;
}

function formatBestSignalDetail(card, minSampleSize) {
  if (!card || card.bucketLabel == null) {
    return `No ${formatSideLabel(card?.side)} bucket at ${formatCheckpointLabel(
      card?.checkpointSecond ?? 0,
    )} meets the ${formatCount(minSampleSize)}-sample floor.`;
  }

  return `${card.bucketLabel} on ${formatCount(card.sampleCount)} samples, average BTC delta ${formatBtcUsd(
    card.averageDeltaUsd,
  )}.`;
}

function formatEdgeDetail(card, minSampleSize) {
  if (!card || card.bucketLabel == null) {
    return `No ${formatSideLabel(card?.side)} edge row at ${formatCheckpointLabel(
      card?.checkpointSecond ?? 0,
    )} meets the ${formatCount(minSampleSize)}-sample floor.`;
  }

  return `${card.bucketLabel} on ${formatCount(card.sampleCount)} samples. Market priced ${formatSideLabel(
    card.side,
  )} at ${formatProbability(card.averageDisplayedProbability)} on average versus a realized win rate of ${formatProbability(
    card.winRate,
  )}.`;
}

function formatCadenceMix(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "Cadence mix unavailable.";
  }

  return rows
    .map((row) => `${row.label}: ${formatProbability(row.share)}`)
    .join(" · ");
}

function FilterSelect({ onChange, options, value }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="rounded-[1rem] border border-black/10 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-stone-950"
    >
      {options.map((option) => (
        <option key={String(option.id ?? option)} value={option.id ?? option}>
          {option.label ?? option}
        </option>
      ))}
    </select>
  );
}

function CrossingDistribution({ distribution }) {
  return (
    <article className="rounded-[1.2rem] border border-black/10 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            First crossing
          </p>
          <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950">
            Above {distribution.thresholdLabel}
          </h4>
        </div>
        <span className="rounded-full border border-black/10 bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
          {formatCount(distribution.crossedCount)} crossed
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {distribution.buckets.map((bucket) => (
          <div key={bucket.label} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm text-stone-700">
              <span>{bucket.label}</span>
              <span>
                {formatCount(bucket.count)} / {formatProbability(bucket.share)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-stone-950"
                style={{ width: `${Math.max(0, Math.min((bucket.share ?? 0) * 100, 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function QualityPill({ quality }) {
  const tone =
    quality === "good"
      ? "emerald"
      : quality === "partial"
        ? "amber"
        : quality === "gap"
          ? "rose"
          : "stone";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getToneClasses(tone)}`}
    >
      {quality}
    </span>
  );
}

const EMPTY_BOUNDARY_MOVE_OVERVIEW = {
  averageAbsMoveUsd: null,
  averageSignedMoveUsd: null,
  excludedCount: 0,
  maxAbsMoveUsd: null,
  medianAbsMoveUsd: null,
  p75AbsMoveUsd: null,
  p90AbsMoveUsd: null,
  usableCount: 0,
};

const EMPTY_BOUNDARY_MOVE_ROWS = [];

const EMPTY_BTC_WINNING_SIDE_OVERVIEW = {
  conflictCount: 0,
  matchingCount: 0,
  medianWinningSideSecond: null,
  missingAnchorCount: 0,
  noBtcDataCount: 0,
  p25WinningSideSecond: null,
  p75WinningSideSecond: null,
  sampleCount: 0,
  neverMatchedCount: 0,
};

const EMPTY_BTC_WINNING_SIDE_HEADLINE = {
  checkpointLabel: "T+120",
  checkpointSecond: 120,
  matchingCount: 0,
  sampleCount: 0,
  share: null,
};

const EMPTY_BTC_BEST_SIGNAL_ROWS = [];
const EMPTY_BTC_MARKET_EDGE_ROWS = [];

const EMPTY_OVERVIEW = {
  downWins: 0,
  gapCount: 0,
  goodCount: 0,
  partialCount: 0,
  sampleCount: 0,
  unknownCount: 0,
  upWins: 0,
  windowStartMax: null,
  windowStartMin: null,
};

const EMPTY_APPLIED_FILTERS = {
  dateRange: "7d",
  minSampleSize: 1,
  quality: "all",
};

const EMPTY_HEADLINE_FINDING = {
  averageDisplayed: null,
  checkpoint: "t60",
  checkpointLabel: "T+60",
  sampleCount: 0,
  side: "up",
  threshold: 0.7,
  winCount: 0,
  winRate: null,
};

const EMPTY_RATE_SUMMARY = {
  ciHigh: null,
  ciLow: null,
  rate: null,
  sampleCount: 0,
  successCount: 0,
};

const EMPTY_COHORT_DRILLDOWN = {
  checkpoint: "t120",
  checkpointLabel: "T+120",
  checkpointSecond: 120,
  distanceBucketId: "30_50",
  distanceBucketLabel: "$30-$49.99",
  hourRows: [],
  hypotheses: [],
  lossRate: EMPTY_RATE_SUMMARY,
  loserCount: 0,
  numericMetrics: [],
  sampleCount: 0,
  selectionSide: "down",
  sessionRows: [],
  winRate: EMPTY_RATE_SUMMARY,
  winnerCount: 0,
};

export default function AnalyticsDashboard() {
  const [filters, setFilters] = useState({
    dateRange: "7d",
    minSampleSize: 3,
    quality: "all",
  });
  const [cohortSelection, setCohortSelection] = useState({
    checkpoint: "t120",
    distanceBucket: "30_50",
    side: "down",
  });
  const deferredFilters = useDeferredValue(filters);
  const deferredCohortSelection = useDeferredValue(cohortSelection);
  const analytics = useQuery(api.analytics.getDashboard, deferredFilters);
  const cohortDrilldown = useQuery(api.analytics.getCohortDrilldown, {
    checkpoint: deferredCohortSelection.checkpoint,
    dateRange: deferredFilters.dateRange,
    distanceBucket: deferredCohortSelection.distanceBucket,
    quality: deferredFilters.quality,
    side: deferredCohortSelection.side,
  });

  function updateFilter(key, value) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        [key]: key === "minSampleSize" ? Number(value) : value,
      }));
    });
  }

  function updateCohortSelection(key, value) {
    startTransition(() => {
      setCohortSelection((current) => ({
        ...current,
        [key]: value,
      }));
    });
  }

  if (analytics === undefined) {
    return <LoadingState />;
  }

  const {
    boundaryMoveBuckets = [],
    boundaryMoveByHour = EMPTY_BOUNDARY_MOVE_ROWS,
    boundaryMoveBySession = EMPTY_BOUNDARY_MOVE_ROWS,
    boundaryMoveHeadline = null,
    boundaryMoveOverview = EMPTY_BOUNDARY_MOVE_OVERVIEW,
    boundaryMoveThresholdStats = [],
    btcBestSignalCards = EMPTY_BTC_BEST_SIGNAL_ROWS,
    btcBestSignalMinSamples = 40,
    btcMarketEdgeBucketRows = EMPTY_BTC_MARKET_EDGE_ROWS,
    btcMarketEdgeCards = EMPTY_BTC_MARKET_EDGE_ROWS,
    btcMarketEdgeMinSamples = 40,
    btcWinningSideCadenceMix = EMPTY_BOUNDARY_MOVE_ROWS,
    btcConditionalReliabilityBucketRows = EMPTY_BOUNDARY_MOVE_ROWS,
    btcConditionalReliabilityRows = EMPTY_BOUNDARY_MOVE_ROWS,
    btcWinningSideCheckpointStats = EMPTY_BOUNDARY_MOVE_ROWS,
    btcWinningSideDistanceStats = EMPTY_BOUNDARY_MOVE_ROWS,
    btcWinningSideHeadline = EMPTY_BTC_WINNING_SIDE_HEADLINE,
    btcWinningSideOutcomeSplit = EMPTY_BOUNDARY_MOVE_ROWS,
    btcWinningSideOverview = EMPTY_BTC_WINNING_SIDE_OVERVIEW,
    appliedFilters = EMPTY_APPLIED_FILTERS,
    calibrationRows = [],
    crossingDistributions = [],
    headlineFinding = EMPTY_HEADLINE_FINDING,
    overview = EMPTY_OVERVIEW,
    thresholdStats = [],
  } = analytics;
  const activeCohortDrilldown =
    cohortDrilldown === undefined ? EMPTY_COHORT_DRILLDOWN : cohortDrilldown;
  const {
    checkpointLabel: cohortCheckpointLabel,
    checkpointSecond: cohortCheckpointSecond,
    distanceBucketLabel: cohortDistanceBucketLabel,
    hourRows: cohortHourRows,
    hypotheses: cohortHypotheses,
    lossRate: cohortLossRate,
    loserCount: cohortLoserCount,
    numericMetrics: cohortNumericMetrics,
    sampleCount: cohortSampleCount,
    selectionSide: cohortSide,
    sessionRows: cohortSessionRows,
    winRate: cohortWinRate,
    winnerCount: cohortWinnerCount,
  } = activeCohortDrilldown;

  return (
    <section className="space-y-6">
      <section className="rounded-[1.65rem] border border-black/10 bg-[linear-gradient(145deg,rgba(255,252,245,0.96),rgba(244,246,255,0.9))] p-6 shadow-[0_18px_54px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Stored-summary analytics
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">
              Threshold win rates, calibration, and crossing timing
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
              Every number below is computed from stored `market_summaries`, not
              browser-side replay reconstruction. Rows below the current minimum
              support are hidden from the threshold and calibration tables.
            </p>
          </div>
          <QualityPill quality={appliedFilters.quality} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <ControlField label="Date range">
            <FilterSelect
              value={filters.dateRange}
              onChange={(event) => updateFilter("dateRange", event.target.value)}
              options={ANALYTICS_DATE_RANGE_OPTIONS}
            />
          </ControlField>

          <ControlField label="Quality filter">
            <FilterSelect
              value={filters.quality}
              onChange={(event) => updateFilter("quality", event.target.value)}
              options={ANALYTICS_QUALITY_OPTIONS}
            />
          </ControlField>

          <ControlField label="Minimum support">
            <FilterSelect
              value={filters.minSampleSize}
              onChange={(event) =>
                updateFilter("minSampleSize", event.target.value)
              }
              options={ANALYTICS_MIN_SAMPLE_OPTIONS}
            />
          </ControlField>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
        <StatCard
          eyebrow="Headline question"
          title={headlineFinding.sampleCount > 0 ? formatProbability(headlineFinding.winRate) : "No sample"}
          body={formatHeadlineFinding(headlineFinding)}
        />
        <StatCard
          eyebrow="Filtered sample"
          title={formatCount(overview.sampleCount)}
          body="Finalized markets currently included by the filters above."
        />
        <StatCard
          eyebrow="Outcome split"
          title={`${formatCount(overview.upWins)} up / ${formatCount(overview.downWins)} down`}
          body="Resolved outcome counts inside the filtered summary set."
        />
        <StatCard
          eyebrow="Quality mix"
          title={`${formatCount(overview.goodCount)} good`}
          body={`${formatCount(overview.partialCount)} partial and ${formatCount(overview.gapCount)} gap rows remain in the filtered sample.`}
        />
        <StatCard
          eyebrow="Window span"
          title={overview.sampleCount > 0 ? "Covered" : "Empty"}
          body={formatDateSpan(overview.windowStartMin, overview.windowStartMax)}
        />
      </section>

      <TableShell
        caption="5-minute BTC move"
        title="How far BTC moves from price to beat to close"
      >
        <p className="mb-5 max-w-3xl text-sm leading-7 text-stone-700">
          This block uses stored market boundary references from `market_summaries`.
          It prefers official prices when available and falls back to derived
          Chainlink start/end references otherwise.
        </p>

        {boundaryMoveOverview.usableCount === 0 ? (
          <EmptyTable message="No filtered markets currently have both a usable start and end BTC reference." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
            <MetricPanel
              label="Headline"
              value={formatProbability(boundaryMoveHeadline.share)}
              detail={formatBoundaryMoveHeadline(boundaryMoveHeadline)}
            />
            <MetricPanel
              label="Usable sample"
              value={formatCount(boundaryMoveOverview.usableCount)}
              detail={`${formatCount(boundaryMoveOverview.excludedCount)} filtered market${boundaryMoveOverview.excludedCount === 1 ? "" : "s"} excluded because one boundary reference is missing.`}
            />
            <MetricPanel
              label="Median abs move"
              value={formatBtcUsd(boundaryMoveOverview.medianAbsMoveUsd)}
              detail="Median absolute BTC move over the 5-minute market window."
            />
            <MetricPanel
              label="P90 abs move"
              value={formatBtcUsd(boundaryMoveOverview.p90AbsMoveUsd)}
              detail="90th-percentile absolute move across usable 5-minute markets."
            />
            <MetricPanel
              label="Max abs move"
              value={formatBtcUsd(boundaryMoveOverview.maxAbsMoveUsd)}
              detail="Largest absolute 5-minute move in the current filtered sample."
            />
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Move thresholds"
        title="Share of markets that move at least $20, $30, $40, and beyond"
      >
        <p className="mb-5 max-w-3xl text-sm leading-7 text-stone-700">
          {formatSupportFloorMessage(
            boundaryMoveOverview.usableCount,
            appliedFilters.minSampleSize,
          )}
        </p>
        {boundaryMoveThresholdStats.length === 0 ? (
          <EmptyTable message="No BTC move threshold rows meet the current support floor." />
        ) : (
          <div className="overflow-auto rounded-[1.2rem] border border-black/10">
            <table className="min-w-full text-left text-sm text-stone-700">
              <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Abs move threshold</th>
                  <th className="px-4 py-3 font-semibold">Usable markets</th>
                  <th className="px-4 py-3 font-semibold">Markets at or above</th>
                  <th className="px-4 py-3 font-semibold">Share</th>
                </tr>
              </thead>
              <tbody>
                {boundaryMoveThresholdStats.map((row) => (
                  <tr
                    key={row.thresholdUsd}
                    className="border-t border-stone-200/80 bg-white"
                  >
                    <td className="px-4 py-3 font-medium text-stone-950">
                      {formatBtcUsd(row.thresholdUsd)}
                    </td>
                    <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                    <td className="px-4 py-3">{formatCount(row.hitCount)}</td>
                    <td className="px-4 py-3">{formatProbability(row.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Move distribution"
        title="Absolute move distribution by BTC dollar bucket"
      >
        {boundaryMoveOverview.usableCount === 0 ? (
          <EmptyTable message="No usable BTC boundary moves are available for bucketed distribution yet." />
        ) : (
          <div className="overflow-auto rounded-[1.2rem] border border-black/10">
            <table className="min-w-full text-left text-sm text-stone-700">
              <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Abs move bucket</th>
                  <th className="px-4 py-3 font-semibold">Markets</th>
                  <th className="px-4 py-3 font-semibold">Share</th>
                </tr>
              </thead>
              <tbody>
                {boundaryMoveBuckets.map((row) => (
                  <tr key={row.label} className="border-t border-stone-200/80 bg-white">
                    <td className="px-4 py-3 font-medium text-stone-950">
                      {row.label}
                    </td>
                    <td className="px-4 py-3">{formatCount(row.count)}</td>
                    <td className="px-4 py-3">{formatProbability(row.share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Time-of-day split"
        title="When 5-minute BTC markets tend to move more or less"
      >
        <p className="mb-5 max-w-3xl text-sm leading-7 text-stone-700">
          These buckets are grouped by each market window's start time in
          Eastern Time. Hours or sessions with fewer than{" "}
          {formatCount(appliedFilters.minSampleSize)} usable market
          {appliedFilters.minSampleSize === 1 ? "" : "s"} are hidden.
        </p>
        {boundaryMoveOverview.usableCount === 0 ? (
          <EmptyTable message="No usable BTC boundary moves are available for ET hour/session analysis yet." />
        ) : boundaryMoveByHour.length === 0 && boundaryMoveBySession.length === 0 ? (
          <EmptyTable message="No ET hour or session buckets currently meet the support floor." />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                ET sessions
              </p>
              {boundaryMoveBySession.length === 0 ? (
                <EmptyTable message="No ET session buckets currently meet the support floor." />
              ) : (
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Session</th>
                        <th className="px-4 py-3 font-semibold">ET range</th>
                        <th className="px-4 py-3 font-semibold">Markets</th>
                        <th className="px-4 py-3 font-semibold">Median abs move</th>
                        <th className="px-4 py-3 font-semibold">Avg abs move</th>
                        <th className="px-4 py-3 font-semibold">Share &gt;= $20</th>
                        <th className="px-4 py-3 font-semibold">Share &gt;= $50</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boundaryMoveBySession.map((row) => (
                        <tr key={row.id} className="border-t border-stone-200/80 bg-white">
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {row.label}
                          </td>
                          <td className="px-4 py-3">{row.rangeLabel}</td>
                          <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                          <td className="px-4 py-3">
                            {formatBtcUsd(row.medianAbsMoveUsd)}
                          </td>
                          <td className="px-4 py-3">
                            {formatBtcUsd(row.averageAbsMoveUsd)}
                          </td>
                          <td className="px-4 py-3">
                            {formatProbability(row.shareAt20Usd)}
                          </td>
                          <td className="px-4 py-3">
                            {formatProbability(row.shareAt50Usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                ET hour of day
              </p>
              {boundaryMoveByHour.length === 0 ? (
                <EmptyTable message="No ET hour buckets currently meet the support floor." />
              ) : (
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">ET hour</th>
                        <th className="px-4 py-3 font-semibold">Markets</th>
                        <th className="px-4 py-3 font-semibold">Median abs move</th>
                        <th className="px-4 py-3 font-semibold">Avg abs move</th>
                        <th className="px-4 py-3 font-semibold">Share &gt;= $20</th>
                        <th className="px-4 py-3 font-semibold">Share &gt;= $50</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boundaryMoveByHour.map((row) => (
                        <tr
                          key={row.hour}
                          className="border-t border-stone-200/80 bg-white"
                        >
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {row.label}
                          </td>
                          <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                          <td className="px-4 py-3">
                            {formatBtcUsd(row.medianAbsMoveUsd)}
                          </td>
                          <td className="px-4 py-3">
                            {formatBtcUsd(row.averageAbsMoveUsd)}
                          </td>
                          <td className="px-4 py-3">
                            {formatProbability(row.shareAt20Usd)}
                          </td>
                          <td className="px-4 py-3">
                            {formatProbability(row.shareAt50Usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="BTC first winning side"
        title="When BTC first reaches the eventual winning side"
      >
        <p className="mb-5 max-w-3xl text-sm leading-7 text-stone-700">
          This block answers a simpler question than the old lock metric: when
          was BTC first on the eventual winning side of the anchor price? It
          does not require BTC to stay there for the rest of the window.
        </p>
        <p className="mb-5 text-sm leading-7 text-stone-600">
          Cadence mix: {formatCadenceMix(btcWinningSideCadenceMix)}
        </p>

        {btcWinningSideOverview.sampleCount === 0 ? (
          <EmptyTable message="No finalized markets currently match the filters for BTC first-winning-side timing." />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
              <MetricPanel
                label={`Reached by ${formatCheckpointLabel(btcWinningSideHeadline.checkpointSecond)}`}
                value={
                  btcWinningSideHeadline.sampleCount > 0
                    ? formatProbability(btcWinningSideHeadline.share)
                    : "No sample"
                }
                detail={formatBtcWinningSideHeadline(btcWinningSideHeadline)}
              />
              <MetricPanel
                label="Matching sample"
                value={`${formatCount(btcWinningSideOverview.matchingCount)} / ${formatCount(btcWinningSideOverview.sampleCount)}`}
                detail="Markets with a non-null first BTC winning-side second inside the filtered summary set."
              />
              <MetricPanel
                label="Median first match"
                value={formatRelativeSecondWithClock(btcWinningSideOverview.medianWinningSideSecond)}
                detail="Median earliest observed second when BTC first reached the eventual winning side."
              />
              <MetricPanel
                label="P25 first match"
                value={formatRelativeSecondWithClock(btcWinningSideOverview.p25WinningSideSecond)}
                detail="25th-percentile first-winning-side timing across matching markets."
              />
              <MetricPanel
                label="P75 first match"
                value={formatRelativeSecondWithClock(btcWinningSideOverview.p75WinningSideSecond)}
                detail="75th-percentile first-winning-side timing across matching markets."
              />
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Best signals
              </p>
              <p className="max-w-3xl text-sm leading-7 text-stone-700">
                These cards pick the strongest non-overlapping BTC-distance bucket
                at the actionable checkpoints only, with a hard minimum support floor
                of {` ${formatCount(btcBestSignalMinSamples)} `}samples.
              </p>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {btcBestSignalCards.map((card) => (
                  <MetricPanel
                    key={`${card.checkpointSecond}-${card.side}`}
                    label={`Best ${formatSideLabel(card.side)} at ${formatCheckpointLabel(
                      card.checkpointSecond,
                    )}`}
                    value={
                      card.bucketLabel == null
                        ? "No signal"
                        : formatProbability(card.winRate)
                    }
                    detail={formatBestSignalDetail(card, btcBestSignalMinSamples)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                BTC signal vs market price edge
              </p>
              <p className="max-w-3xl text-sm leading-7 text-stone-700">
                This compares the historical win rate for a BTC-distance bucket
                against the average market price for that same side. Positive edge
                means the market underpriced the signal on average; negative edge
                means it overpriced it.
              </p>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                {btcMarketEdgeCards.map((card) => (
                  <MetricPanel
                    key={`${card.checkpointSecond}-${card.side}`}
                    label={`Best ${formatSideLabel(card.side)} edge at ${formatCheckpointLabel(
                      card.checkpointSecond,
                    )}`}
                    value={
                      card.bucketLabel == null
                        ? "No edge"
                        : formatCalibrationGap(card.averageEdge)
                    }
                    detail={formatEdgeDetail(card, btcMarketEdgeMinSamples)}
                  />
                ))}
              </div>
              {btcMarketEdgeBucketRows.length === 0 ? (
                <EmptyTable message="No BTC signal vs market-price edge rows meet the current support floor." />
              ) : (
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Checkpoint</th>
                        <th className="px-4 py-3 font-semibold">BTC side</th>
                        <th className="px-4 py-3 font-semibold">Distance bucket</th>
                        <th className="px-4 py-3 font-semibold">Samples</th>
                        <th className="px-4 py-3 font-semibold">Avg market price</th>
                        <th className="px-4 py-3 font-semibold">Realized win rate</th>
                        <th className="px-4 py-3 font-semibold">Edge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btcMarketEdgeBucketRows.map((row) => (
                        <tr
                          key={`${row.checkpoint}-${row.side}-${row.minUsd}`}
                          className="border-t border-stone-200/80 bg-white"
                        >
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {formatCheckpointLabel(row.checkpointSecond)}
                          </td>
                          <td className="px-4 py-3">{formatSideLabel(row.side)}</td>
                          <td className="px-4 py-3">{row.bucketLabel}</td>
                          <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                          <td className="px-4 py-3">
                            {formatProbability(row.averageDisplayedProbability)}
                          </td>
                          <td className="px-4 py-3">{formatProbability(row.winRate)}</td>
                          <td className="px-4 py-3">{formatCalibrationGap(row.averageEdge)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  First winning-side by checkpoint
                </p>
                {btcWinningSideCheckpointStats.length === 0 ? (
                  <EmptyTable message="No BTC first-winning-side checkpoint rows meet the current support floor." />
                ) : (
                  <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                    <table className="min-w-full text-left text-sm text-stone-700">
                      <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Checkpoint</th>
                          <th className="px-4 py-3 font-semibold">Markets</th>
                        <th className="px-4 py-3 font-semibold">Reached winning side</th>
                        <th className="px-4 py-3 font-semibold">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                        {btcWinningSideCheckpointStats.map((row) => (
                          <tr
                            key={row.checkpointSecond}
                            className="border-t border-stone-200/80 bg-white"
                          >
                            <td className="px-4 py-3 font-medium text-stone-950">
                              {formatCheckpointLabel(row.checkpointSecond)}
                            </td>
                            <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                            <td className="px-4 py-3">{formatCount(row.matchingCount)}</td>
                            <td className="px-4 py-3">{formatProbability(row.share)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Outcome split
                </p>
                {btcWinningSideOutcomeSplit.length === 0 ? (
                  <EmptyTable message="No Up/Down BTC first-winning-side rows meet the current support floor." />
                ) : (
                  <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                    <table className="min-w-full text-left text-sm text-stone-700">
                      <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                        <tr>
                        <th className="px-4 py-3 font-semibold">Outcome</th>
                        <th className="px-4 py-3 font-semibold">Markets</th>
                        <th className="px-4 py-3 font-semibold">Reached side</th>
                        <th className="px-4 py-3 font-semibold">Share</th>
                        <th className="px-4 py-3 font-semibold">Median first match</th>
                      </tr>
                    </thead>
                    <tbody>
                        {btcWinningSideOutcomeSplit.map((row) => (
                          <tr key={row.side} className="border-t border-stone-200/80 bg-white">
                            <td className="px-4 py-3 font-medium text-stone-950">
                              {formatSideLabel(row.side)}
                            </td>
                            <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                            <td className="px-4 py-3">{formatCount(row.matchingCount)}</td>
                            <td className="px-4 py-3">{formatProbability(row.share)}</td>
                            <td className="px-4 py-3">
                              {formatRelativeSecondWithClock(row.medianWinningSideSecond)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rounded-[1.2rem] border border-black/10 bg-stone-50 px-5 py-4 text-sm leading-7 text-stone-700">
                  <p>
                    Conflicts: {formatCount(btcWinningSideOverview.conflictCount)} BTC-path
                    vs resolved-outcome disagreements.
                  </p>
                  <p>
                    Never reached winning side: {formatCount(btcWinningSideOverview.neverMatchedCount)} filtered markets.
                  </p>
                  <p>
                    Missing anchor / no BTC data: {formatCount(btcWinningSideOverview.missingAnchorCount)} /
                    {" "}
                    {formatCount(btcWinningSideOverview.noBtcDataCount)}.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Winning-side distance thresholds
              </p>
              {btcWinningSideDistanceStats.length === 0 ? (
                <EmptyTable message="No BTC winning-side-by-distance rows meet the current support floor." />
              ) : (
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Winning-side distance</th>
                        <th className="px-4 py-3 font-semibold">Reached</th>
                        <th className="px-4 py-3 font-semibold">Median first match</th>
                        <th className="px-4 py-3 font-semibold">By 0:15</th>
                        <th className="px-4 py-3 font-semibold">By 0:30</th>
                        <th className="px-4 py-3 font-semibold">By 1:00</th>
                        <th className="px-4 py-3 font-semibold">By 2:00</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btcWinningSideDistanceStats.map((row) => {
                        const by15 = row.checkpointStats.find(
                          (item) => item.checkpointSecond === 15,
                        );
                        const by30 = row.checkpointStats.find(
                          (item) => item.checkpointSecond === 30,
                        );
                        const by60 = row.checkpointStats.find(
                          (item) => item.checkpointSecond === 60,
                        );
                        const by120 = row.checkpointStats.find(
                          (item) => item.checkpointSecond === 120,
                        );

                        return (
                          <tr
                            key={row.thresholdUsd}
                            className="border-t border-stone-200/80 bg-white"
                          >
                            <td className="px-4 py-3 font-medium text-stone-950">
                              {formatBtcUsd(row.thresholdUsd)}
                            </td>
                            <td className="px-4 py-3">
                              {formatCount(row.matchingCount)} / {formatProbability(row.share)}
                            </td>
                            <td className="px-4 py-3">
                              {formatRelativeSecondWithClock(row.medianWinningSideSecond)}
                            </td>
                            <td className="px-4 py-3">
                              {formatProbability(by15?.share)}
                            </td>
                            <td className="px-4 py-3">
                              {formatProbability(by30?.share)}
                            </td>
                            <td className="px-4 py-3">
                              {formatProbability(by60?.share)}
                            </td>
                            <td className="px-4 py-3">
                              {formatProbability(by120?.share)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Conditional outcome reliability
              </p>
              <p className="max-w-3xl text-sm leading-7 text-stone-700">
                This asks the predictive question directly: at a given checkpoint,
                if BTC is above or below the anchor by at least a threshold amount,
                how often does that side actually win? These are cumulative
                thresholds, so the $30 rows are nested inside the $10 and $20 rows.
              </p>
              {btcConditionalReliabilityRows.length === 0 ? (
                <EmptyTable message="No BTC conditional reliability rows meet the current support floor." />
              ) : (
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Checkpoint</th>
                        <th className="px-4 py-3 font-semibold">BTC side</th>
                        <th className="px-4 py-3 font-semibold">Threshold</th>
                        <th className="px-4 py-3 font-semibold">Samples</th>
                        <th className="px-4 py-3 font-semibold">Avg BTC delta</th>
                        <th className="px-4 py-3 font-semibold">Win rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btcConditionalReliabilityRows.map((row) => (
                        <tr
                          key={`${row.checkpoint}-${row.side}-${row.thresholdUsd}`}
                          className="border-t border-stone-200/80 bg-white"
                        >
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {formatCheckpointLabel(row.checkpointSecond)}
                          </td>
                          <td className="px-4 py-3">{formatSideLabel(row.side)}</td>
                          <td className="px-4 py-3">{formatBtcUsd(row.thresholdUsd)}</td>
                          <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                          <td className="px-4 py-3">{formatBtcUsd(row.averageDeltaUsd)}</td>
                          <td className="px-4 py-3">{formatProbability(row.winRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Distance buckets
              </p>
              <p className="max-w-3xl text-sm leading-7 text-stone-700">
                These rows are non-overlapping BTC distance buckets, which makes
                the predictive strength easier to compare than the cumulative
                threshold table above.
              </p>
              {btcConditionalReliabilityBucketRows.length === 0 ? (
                <EmptyTable message="No BTC distance-bucket reliability rows meet the current support floor." />
              ) : (
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Checkpoint</th>
                        <th className="px-4 py-3 font-semibold">BTC side</th>
                        <th className="px-4 py-3 font-semibold">Distance bucket</th>
                        <th className="px-4 py-3 font-semibold">Samples</th>
                        <th className="px-4 py-3 font-semibold">Avg BTC delta</th>
                        <th className="px-4 py-3 font-semibold">Win rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btcConditionalReliabilityBucketRows.map((row) => (
                        <tr
                          key={`${row.checkpoint}-${row.side}-${row.minUsd}`}
                          className="border-t border-stone-200/80 bg-white"
                        >
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {formatCheckpointLabel(row.checkpointSecond)}
                          </td>
                          <td className="px-4 py-3">{formatSideLabel(row.side)}</td>
                          <td className="px-4 py-3">{row.bucketLabel}</td>
                          <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                          <td className="px-4 py-3">{formatBtcUsd(row.averageDeltaUsd)}</td>
                          <td className="px-4 py-3">{formatProbability(row.winRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Cohort drilldown"
        title="Why the selected BTC bucket still fails sometimes"
      >
        <p className="mb-5 max-w-3xl text-sm leading-7 text-stone-700">
          This block compares winners and losers inside one BTC checkpoint cohort.
          The default view is the exact `T+120 / Down / $30-$49.99` row that
          raised the question about why a meaningful share of those markets still
          flipped before the close.
        </p>

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ControlField label="Checkpoint">
            <FilterSelect
              value={cohortSelection.checkpoint}
              onChange={(event) =>
                updateCohortSelection("checkpoint", event.target.value)
              }
              options={COHORT_DRILLDOWN_CHECKPOINT_OPTIONS}
            />
          </ControlField>
          <ControlField label="BTC side">
            <FilterSelect
              value={cohortSelection.side}
              onChange={(event) =>
                updateCohortSelection("side", event.target.value)
              }
              options={COHORT_DRILLDOWN_SIDE_OPTIONS}
            />
          </ControlField>
          <ControlField label="Distance bucket">
            <FilterSelect
              value={cohortSelection.distanceBucket}
              onChange={(event) =>
                updateCohortSelection("distanceBucket", event.target.value)
              }
              options={COHORT_DRILLDOWN_DISTANCE_BUCKET_OPTIONS}
            />
          </ControlField>
        </div>

        {cohortDrilldown === undefined ? (
          <EmptyTable message="Loading cohort drilldown..." />
        ) : cohortSampleCount === 0 ? (
          <EmptyTable message="No finalized markets match the selected checkpoint, side, distance bucket, and filters." />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <MetricPanel
                label="Selected cohort"
                value={`${formatSideLabel(cohortSide)} ${cohortDistanceBucketLabel}`}
                detail={`${formatCheckpointLabel(
                  cohortCheckpointSecond,
                )} with ${formatCount(cohortSampleCount)} filtered market${cohortSampleCount === 1 ? "" : "s"} in the bucket.`}
              />
              <MetricPanel
                label="Cohort win rate"
                value={formatProbability(cohortWinRate.rate)}
                detail={`${formatCount(cohortWinnerCount)} wins out of ${formatCount(
                  cohortSampleCount,
                )}. ${formatProbabilityCi(cohortWinRate)}`}
              />
              <MetricPanel
                label="Cohort loss rate"
                value={formatProbability(cohortLossRate.rate)}
                detail={`${formatCount(cohortLoserCount)} losses out of ${formatCount(
                  cohortSampleCount,
                )}. ${formatProbabilityCi(cohortLossRate)}`}
              />
              <MetricPanel
                label="Question"
                value="Winners vs losers"
                detail={`What separated the ${formatSideLabel(
                  cohortSide,
                )} winners from the failures inside ${cohortCheckpointLabel} / ${cohortDistanceBucketLabel}?`}
              />
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Numeric comparisons
              </p>
              <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                <table className="min-w-full text-left text-sm text-stone-700">
                  <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Metric</th>
                      <th className="px-4 py-3 font-semibold">
                        {formatSideLabel(cohortSide)} winners
                      </th>
                      <th className="px-4 py-3 font-semibold">Losers</th>
                      <th className="px-4 py-3 font-semibold">Winner - loser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortNumericMetrics.map((metric) => (
                      <tr
                        key={metric.id}
                        className="border-t border-stone-200/80 bg-white align-top"
                      >
                        <td className="px-4 py-3 font-medium text-stone-950">
                          {metric.label}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="font-medium text-stone-950">
                              {formatValueByMetric(metric.winners.mean, metric.format)}
                            </p>
                            <p className="text-xs text-stone-500">
                              {formatCount(metric.winners.sampleCount)} observations
                            </p>
                            <p className="text-xs text-stone-500">
                              {formatRangeCi(
                                metric.winners.ciLow,
                                metric.winners.ciHigh,
                                (value) => formatValueByMetric(value, metric.format),
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="font-medium text-stone-950">
                              {formatValueByMetric(metric.losers.mean, metric.format)}
                            </p>
                            <p className="text-xs text-stone-500">
                              {formatCount(metric.losers.sampleCount)} observations
                            </p>
                            <p className="text-xs text-stone-500">
                              {formatRangeCi(
                                metric.losers.ciLow,
                                metric.losers.ciHigh,
                                (value) => formatValueByMetric(value, metric.format),
                              )}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <p className="font-medium text-stone-950">
                              {formatValueByMetric(metric.difference.mean, metric.format)}
                            </p>
                            <p className="text-xs text-stone-500">
                              {formatRangeCi(
                                metric.difference.ciLow,
                                metric.difference.ciHigh,
                                (value) => formatValueByMetric(value, metric.format),
                              )}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  ET session loss rates
                </p>
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Session</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">Wins</th>
                        <th className="px-4 py-3 font-semibold">Losses</th>
                        <th className="px-4 py-3 font-semibold">Loss rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortSessionRows.map((row) => (
                        <tr key={row.id} className="border-t border-stone-200/80 bg-white">
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {row.label}
                          </td>
                          <td className="px-4 py-3">{formatCount(row.totalCount)}</td>
                          <td className="px-4 py-3">{formatCount(row.winnerCount)}</td>
                          <td className="px-4 py-3">{formatCount(row.loserCount)}</td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="font-medium text-stone-950">
                                {formatProbability(row.lossRate.rate)}
                              </p>
                              <p className="text-xs text-stone-500">
                                {formatProbabilityCi(row.lossRate)}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  ET hour loss rates
                </p>
                <div className="overflow-auto rounded-[1.2rem] border border-black/10">
                  <table className="min-w-full text-left text-sm text-stone-700">
                    <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">ET hour</th>
                        <th className="px-4 py-3 font-semibold">Total</th>
                        <th className="px-4 py-3 font-semibold">Wins</th>
                        <th className="px-4 py-3 font-semibold">Losses</th>
                        <th className="px-4 py-3 font-semibold">Loss rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortHourRows.map((row) => (
                        <tr
                          key={row.hour}
                          className="border-t border-stone-200/80 bg-white"
                        >
                          <td className="px-4 py-3 font-medium text-stone-950">
                            {row.label}
                          </td>
                          <td className="px-4 py-3">{formatCount(row.totalCount)}</td>
                          <td className="px-4 py-3">{formatCount(row.winnerCount)}</td>
                          <td className="px-4 py-3">{formatCount(row.loserCount)}</td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <p className="font-medium text-stone-950">
                                {formatProbability(row.lossRate.rate)}
                              </p>
                              <p className="text-xs text-stone-500">
                                {formatProbabilityCi(row.lossRate)}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Hypothesis results
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                {cohortHypotheses.map((hypothesis) => (
                  <article
                    key={hypothesis.id}
                    className="rounded-[1.2rem] border border-black/10 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          {hypothesis.id.toUpperCase()}
                        </p>
                        <h4 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-stone-950">
                          {hypothesis.label}
                        </h4>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getToneClasses(
                          getStatusTone(hypothesis.status),
                        )}`}
                      >
                        {formatStatusLabel(hypothesis.status)}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-[1rem] bg-stone-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          {hypothesis.groupALabel}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-stone-950">
                          {formatProbability(hypothesis.groupA.rate)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {formatProbabilityCi(hypothesis.groupA)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {formatCount(hypothesis.groupA.sampleCount)} rows
                        </p>
                      </div>
                      <div className="rounded-[1rem] bg-stone-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          {hypothesis.groupBLabel}
                        </p>
                        <p className="mt-2 text-lg font-semibold text-stone-950">
                          {formatProbability(hypothesis.groupB.rate)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {formatProbabilityCi(hypothesis.groupB)}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">
                          {formatCount(hypothesis.groupB.sampleCount)} rows
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-stone-700">
                      Difference: {formatRateDifference(hypothesis.difference.difference)}.
                      {" "}
                      {formatRangeCi(
                        hypothesis.difference.ciLow,
                        hypothesis.difference.ciHigh,
                        formatRateDifference,
                      )}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Threshold stats"
        title="Win rate when displayed probability clears a threshold"
      >
        {thresholdStats.length === 0 ? (
          <EmptyTable message="No threshold rows meet the current filter and support floor." />
        ) : (
          <div className="overflow-auto rounded-[1.2rem] border border-black/10">
            <table className="min-w-full text-left text-sm text-stone-700">
              <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Checkpoint</th>
                  <th className="px-4 py-3 font-semibold">Side</th>
                  <th className="px-4 py-3 font-semibold">Threshold</th>
                  <th className="px-4 py-3 font-semibold">Samples</th>
                  <th className="px-4 py-3 font-semibold">Avg shown</th>
                  <th className="px-4 py-3 font-semibold">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {thresholdStats.map((row) => (
                  <tr key={`${row.checkpoint}-${row.side}-${row.threshold}`} className="border-t border-stone-200/80 bg-white">
                    <td className="px-4 py-3 font-medium text-stone-950">
                      {row.checkpointLabel}
                    </td>
                    <td className="px-4 py-3">{formatSideLabel(row.side)}</td>
                    <td className="px-4 py-3">{formatProbability(row.threshold)}</td>
                    <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                    <td className="px-4 py-3">
                      {formatProbability(row.averageDisplayed)}
                    </td>
                    <td className="px-4 py-3">
                      {formatProbability(row.winRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Calibration"
        title="Displayed probability versus realized win rate"
      >
        <p className="mb-5 max-w-3xl text-sm leading-7 text-stone-700">
          Gap is computed as realized win rate minus average displayed probability.
          Positive values mean the market was underconfident; negative values mean
          it was overconfident.
        </p>
        {calibrationRows.length === 0 ? (
          <EmptyTable message="No calibration rows meet the current filter and support floor." />
        ) : (
          <div className="overflow-auto rounded-[1.2rem] border border-black/10">
            <table className="min-w-full text-left text-sm text-stone-700">
              <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Checkpoint</th>
                  <th className="px-4 py-3 font-semibold">Side</th>
                  <th className="px-4 py-3 font-semibold">Bucket</th>
                  <th className="px-4 py-3 font-semibold">Samples</th>
                  <th className="px-4 py-3 font-semibold">Avg shown</th>
                  <th className="px-4 py-3 font-semibold">Win rate</th>
                  <th className="px-4 py-3 font-semibold">Gap</th>
                </tr>
              </thead>
              <tbody>
                {calibrationRows.map((row) => (
                  <tr
                    key={`${row.checkpoint}-${row.side}-${row.bucketStart}`}
                    className="border-t border-stone-200/80 bg-white"
                  >
                    <td className="px-4 py-3 font-medium text-stone-950">
                      {row.checkpointLabel}
                    </td>
                    <td className="px-4 py-3">{formatSideLabel(row.side)}</td>
                    <td className="px-4 py-3">{row.bucketLabel}</td>
                    <td className="px-4 py-3">{formatCount(row.sampleCount)}</td>
                    <td className="px-4 py-3">
                      {formatProbability(row.averageDisplayed)}
                    </td>
                    <td className="px-4 py-3">{formatProbability(row.winRate)}</td>
                    <td className="px-4 py-3">
                      {formatCalibrationGap(row.calibrationGap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableShell>

      <TableShell
        caption="Crossing timing"
        title="When the market first clears key Up thresholds"
      >
        {overview.sampleCount === 0 ? (
          <EmptyTable message="No finalized market summaries match the current filters." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            {crossingDistributions.map((distribution) => (
              <CrossingDistribution
                key={distribution.threshold}
                distribution={distribution}
              />
            ))}
          </div>
        )}
      </TableShell>
    </section>
  );
}
