"use client";

import { startTransition, useDeferredValue, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  ANALYTICS_DATE_RANGE_OPTIONS,
  ANALYTICS_MIN_SAMPLE_OPTIONS,
  ANALYTICS_QUALITY_OPTIONS,
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

function formatSideLabel(side) {
  if (side === "up") {
    return "Up";
  }

  if (side === "down") {
    return "Down";
  }

  return side ?? "pending";
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

export default function AnalyticsDashboard() {
  const [filters, setFilters] = useState({
    dateRange: "7d",
    minSampleSize: 3,
    quality: "all",
  });
  const deferredFilters = useDeferredValue(filters);
  const analytics = useQuery(api.analytics.getDashboard, deferredFilters);

  function updateFilter(key, value) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        [key]: key === "minSampleSize" ? Number(value) : value,
      }));
    });
  }

  if (analytics === undefined) {
    return <LoadingState />;
  }

  const {
    boundaryMoveBuckets,
    boundaryMoveHeadline,
    boundaryMoveOverview,
    boundaryMoveThresholdStats,
    appliedFilters,
    calibrationRows,
    crossingDistributions,
    headlineFinding,
    overview,
    thresholdStats,
  } = analytics;

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
