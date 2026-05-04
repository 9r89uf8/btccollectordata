"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import ReplayLineChart from "@/components/charts/ReplayLineChart";
import {
  buildReplayTimeline,
  findLatestReplayIssue,
  getQualityBreakdown,
  getReplayCoverage,
} from "@/components/marketReplay.mjs";
import {
  formatBtcReferenceValue,
  formatBtcUsd,
  formatElapsedMarketTime,
  formatEtDateTime,
  formatEtRange,
  formatEtTimeWithSeconds,
  formatProbability,
  formatRelativeSecond,
  formatSnapshotQualityLabel,
  getMarketState,
  getSnapshotQualityTone,
  getToneClasses,
  truncateTokenId,
} from "@/components/marketFormat";
import { api } from "@/convex/_generated/api";

function Pill({ tone, children }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${getToneClasses(tone)}`}
    >
      {children}
    </span>
  );
}

function LoadingState() {
  return (
    <section className="space-y-6">
      <div className="h-8 w-52 animate-pulse rounded-full bg-stone-200" />
      <div className="h-48 animate-pulse rounded-[1.8rem] bg-white/80" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-40 animate-pulse rounded-[1.4rem] bg-white/80" />
        <div className="h-40 animate-pulse rounded-[1.4rem] bg-white/80" />
        <div className="h-40 animate-pulse rounded-[1.4rem] bg-white/80" />
      </div>
      <div className="h-80 animate-pulse rounded-[1.8rem] bg-white/80" />
    </section>
  );
}

function InfoCard({ children, eyebrow, title }) {
  return (
    <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-stone-950">
        {title}
      </h3>
      <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">{children}</div>
    </article>
  );
}

function formatDepth(value) {
  if (value == null) {
    return "pending";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedPercent(value) {
  if (value == null) {
    return "pending";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function formatCoverageShare(numerator, denominator) {
  if (!denominator) {
    return "pending";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
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

function formatSummaryFlag(flag) {
  if (!flag) {
    return "pending";
  }

  return flag.replaceAll("_", " ").replace(":", ": ");
}

function formatSummaryOutcome(summary, market) {
  if (!summary?.resolvedOutcome) {
    return "pending";
  }

  return summary.resolvedOutcome === "up"
    ? market.outcomeLabels.upLabel
    : market.outcomeLabels.downLabel;
}

function formatCrossingSecond(value) {
  if (value == null) {
    return "not reached";
  }

  return formatRelativeSecond(value);
}

function getMarketWindowSeconds(market) {
  if (
    !Number.isFinite(market?.windowStartTs) ||
    !Number.isFinite(market?.windowEndTs)
  ) {
    return null;
  }

  return Math.round((market.windowEndTs - market.windowStartTs) / 1000);
}

function getBucketPhase(secondBucket, market) {
  if (secondBucket < market.windowStartTs) {
    return "pre";
  }

  if (secondBucket >= market.windowEndTs) {
    return "post";
  }

  return "live";
}

function buildMissingFinalWindowEntry(market, secondBucket) {
  return {
    _id: `final-missing-${market.slug}-${secondBucket}`,
    btcBinance: null,
    btcChainlink: null,
    displayRuleUsed: "unknown",
    downAsk: null,
    downBid: null,
    downDepthAskTop: null,
    downDepthBidTop: null,
    downDisplayed: null,
    downLast: null,
    downMid: null,
    downSpread: null,
    marketId: market.marketId,
    marketImbalance: null,
    marketSlug: market.slug,
    missing: true,
    phase: getBucketPhase(secondBucket, market),
    secondBucket,
    secondsFromWindowStart: Math.round(
      (secondBucket - market.windowStartTs) / 1000,
    ),
    sourceQuality: "missing",
    ts: secondBucket,
    upAsk: null,
    upBid: null,
    upDepthAskTop: null,
    upDepthBidTop: null,
    upDisplayed: null,
    upLast: null,
    upMid: null,
    upSpread: null,
    writtenAt: null,
  };
}

function buildFinalWindowSecondRows(timeline, market) {
  const windowSeconds = getMarketWindowSeconds(market);

  if (!Number.isFinite(windowSeconds)) {
    return [];
  }

  const startSecond = Math.max(0, windowSeconds - 10);
  const rowsByBucket = new Map(
    timeline.map((snapshot) => [snapshot.secondBucket, snapshot]),
  );
  const rows = [];

  for (let second = startSecond; second <= windowSeconds; second += 1) {
    const secondBucket = market.windowStartTs + second * 1000;
    rows.push(
      rowsByBucket.get(secondBucket) ??
        buildMissingFinalWindowEntry(market, secondBucket),
    );
  }

  return rows;
}

function getBtcDomain(timeline) {
  const btcValues = timeline
    .map((item) => item.btcChainlink)
    .filter((value) => value != null);

  if (btcValues.length === 0) {
    return [0, 1];
  }

  const min = Math.min(...btcValues);
  const max = Math.max(...btcValues);

  if (min === max) {
    const padding = Math.max(10, min * 0.001);
    return [min - padding, max + padding];
  }

  const padding = Math.max((max - min) * 0.08, 8);
  return [min - padding, max + padding];
}

function MarketPagerButton({ direction, market }) {
  const isPrevious = direction === "previous";
  const title = isPrevious ? "Previous market" : "Next market";

  if (!market) {
    return (
      <div className="rounded-[1.2rem] border border-dashed border-stone-300 bg-white/70 px-4 py-4 text-sm text-stone-500">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
          {title}
        </p>
        <p className="mt-2">No saved market in that direction.</p>
      </div>
    );
  }

  return (
    <Link
      href={`/markets/${market.slug}`}
      className="group rounded-[1.2rem] border border-black/10 bg-white/80 px-4 py-4 transition-colors hover:border-stone-300 hover:bg-white"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {title}
      </p>
      <p className="mt-2 text-sm font-semibold text-stone-950 transition-colors group-hover:text-amber-700">
        {formatEtRange(market.windowStartTs, market.windowEndTs)}
      </p>
      <p className="mt-1 text-xs leading-6 text-stone-600">{market.slug}</p>
    </Link>
  );
}

function FinalTenSecondTape({ market, rows }) {
  const windowSeconds = getMarketWindowSeconds(market);
  const startSecond = Number.isFinite(windowSeconds)
    ? Math.max(0, windowSeconds - 10)
    : null;

  return (
    <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
            Final 10 seconds
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-stone-950">
            Displayed probability tape
          </h3>
        </div>
        <p className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
          {startSecond == null
            ? "window pending"
            : `${formatRelativeSecond(startSecond)} to ${formatRelativeSecond(
                windowSeconds,
              )}`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-stone-700">
          Final-window replay rows are pending.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-[1.1rem] border border-black/10">
          <table className="min-w-full text-left text-sm text-stone-700">
            <thead className="bg-stone-950 text-[11px] uppercase tracking-[0.16em] text-stone-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Bucket ET</th>
                <th className="px-4 py-3 font-semibold">Captured ET</th>
                <th className="px-4 py-3 font-semibold">Elapsed</th>
                <th className="px-4 py-3 font-semibold">Second</th>
                <th className="px-4 py-3 font-semibold">Up</th>
                <th className="px-4 py-3 font-semibold">Down</th>
                <th className="px-4 py-3 font-semibold">BTC</th>
                <th className="px-4 py-3 font-semibold">Rule</th>
                <th className="px-4 py-3 font-semibold">Quality</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((snapshot) => (
                <tr
                  key={snapshot._id}
                  className={`border-t border-stone-200/80 ${
                    snapshot.missing ? "bg-rose-50/55" : "bg-white"
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-stone-950">
                    {formatEtTimeWithSeconds(snapshot.secondBucket)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {snapshot.missing
                      ? "missing"
                      : formatEtTimeWithSeconds(snapshot.ts)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-stone-950">
                    {formatElapsedMarketTime(snapshot.secondsFromWindowStart)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatRelativeSecond(snapshot.secondsFromWindowStart)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatProbability(snapshot.upDisplayed)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatProbability(snapshot.downDisplayed)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatBtcUsd(snapshot.btcChainlink)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatSnapshotQualityLabel(snapshot.displayRuleUsed)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Pill tone={getSnapshotQualityTone(snapshot.sourceQuality)}>
                      {formatSnapshotQualityLabel(snapshot.sourceQuality)}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function FinalTenSecondChart({ market, rows }) {
  const windowSeconds = getMarketWindowSeconds(market);

  return (
    <ReplayLineChart
      chartHeight={390}
      chartWidth={1180}
      eyebrow="Final 10 seconds"
      title="Expanded displayed probability"
      description={`${formatElapsedMarketTime(
        Math.max(0, (windowSeconds ?? 300) - 10),
      )} to ${formatElapsedMarketTime(windowSeconds ?? 300)}`}
      emptyMessage="Final-window replay rows are pending."
      formatAxisValue={(tick) => formatProbability(tick)}
      formatPrimaryXValue={(entry) =>
        formatElapsedMarketTime(entry?.secondsFromWindowStart)
      }
      formatSecondaryXValue={(entry) =>
        formatEtTimeWithSeconds(entry?.secondBucket ?? entry?.ts)
      }
      minSvgWidth={1120}
      sampleCadenceMs={1000}
      series={[
        {
          color: "#0f766e",
          key: "upDisplayed",
          label: market.outcomeLabels.upLabel,
        },
        {
          color: "#be185d",
          key: "downDisplayed",
          label: market.outcomeLabels.downLabel,
        },
      ]}
      timeline={rows}
      xTickMode="all"
      yDomain={[0, 1]}
      yTicks={[0, 0.25, 0.5, 0.75, 1]}
    />
  );
}

export default function MarketDetailScaffold({ slug }) {
  const market = useQuery(api.markets.getBySlug, { slug });
  const adjacentMarkets = useQuery(api.markets.getAdjacentBySlug, { slug });
  const latestSnapshot = useQuery(api.snapshots.getLatestByMarketSlug, { slug });
  const replaySnapshots = useQuery(
    api.snapshots.listReplayByMarketSlug,
    market
      ? {
          slug,
          windowEndTs: market.windowEndTs,
          windowStartTs: market.windowStartTs,
          limit: 420,
        }
      : "skip",
  );
  const marketSummary = useQuery(api.summaries.getByMarketSlug, { slug });

  if (
    market === undefined ||
    adjacentMarkets === undefined ||
    latestSnapshot === undefined ||
    (market && replaySnapshots === undefined) ||
    marketSummary === undefined
  ) {
    return <LoadingState />;
  }

  if (!market) {
    return (
      <section className="rounded-[1.8rem] border border-dashed border-stone-300 bg-white/75 p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-700">
          Market not found
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">
          No catalog row exists for `{slug}`.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">
          This route only renders markets that have been discovered into the
          Convex catalog.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-stone-50"
        >
          Back to dashboard
        </Link>
      </section>
    );
  }

  const state = getMarketState(market);
  const { cadenceMs, timeline } = buildReplayTimeline(market, replaySnapshots ?? []);
  const coverage = getReplayCoverage(timeline);
  const qualityBreakdown = getQualityBreakdown(timeline);
  const latestIssue = findLatestReplayIssue(timeline);
  const currentSnapshot =
    latestSnapshot ?? [...timeline].reverse().find((item) => !item.missing) ?? null;
  const probabilityTicks = [0, 0.25, 0.5, 0.75, 1];
  const btcDomain = getBtcDomain(timeline);
  const btcTicks = [
    btcDomain[0],
    btcDomain[0] + (btcDomain[1] - btcDomain[0]) / 3,
    btcDomain[0] + ((btcDomain[1] - btcDomain[0]) * 2) / 3,
    btcDomain[1],
  ];
  const timelineRows = [...timeline].reverse();
  const finalWindowSecondRows = buildFinalWindowSecondRows(timeline, market);
  const liveWindowSeconds = coverage.liveObservedCount + coverage.liveMissingCount;
  const finalWindowStartTs = Number.isFinite(market.windowEndTs)
    ? market.windowEndTs - 10 * 1000
    : null;
  const probabilityMarkers = [
    Number.isFinite(finalWindowStartTs)
      ? {
          color: "#d97706",
          key: "final-window-start",
          label: "Final 10s",
          secondBucket: finalWindowStartTs,
        }
      : null,
    Number.isFinite(market.windowEndTs)
      ? {
          color: "#1f2937",
          key: "market-close",
          label: "Close",
          secondBucket: market.windowEndTs,
        }
      : null,
  ].filter(Boolean);
  const displayedPriceToBeat =
    market.priceToBeatOfficial ?? market.priceToBeatDerived ?? null;
  const displayedCloseReference =
    market.closeReferencePriceOfficial ?? market.closeReferencePriceDerived ?? null;
  const activeReferenceFallback = market.active ? "not published yet" : "missing";
  const derivedReferenceFallback =
    market.active && !market.resolved ? "computed on finalize" : "missing";
  const displayedPriceToBeatLabel =
    market.priceToBeatOfficial != null
      ? "official"
      : market.priceToBeatDerived != null
        ? "derived"
        : market.active
          ? "awaiting official reference"
          : "reference unavailable";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/markets"
          className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-950 hover:text-stone-50"
        >
          Back to markets
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-950 hover:text-stone-50"
        >
          Dashboard
        </Link>
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        <MarketPagerButton
          direction="previous"
          market={adjacentMarkets.previous}
        />
        <MarketPagerButton direction="next" market={adjacentMarkets.next} />
      </section>

      <section className="grid gap-5 rounded-[1.9rem] border border-black/10 bg-[linear-gradient(145deg,rgba(255,252,245,0.96),rgba(244,246,255,0.9))] p-8 shadow-[0_20px_60px_rgba(24,24,24,0.08)] lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={state.tone}>{state.label}</Pill>
            <Pill tone="stone">{market.captureMode}</Pill>
            <Pill tone="amber">{market.dataQuality}</Pill>
            {currentSnapshot ? (
              <Pill tone={getSnapshotQualityTone(currentSnapshot.sourceQuality)}>
                {formatSnapshotQualityLabel(currentSnapshot.sourceQuality)}
              </Pill>
            ) : (
              <Pill tone="stone">snapshot pending</Pill>
            )}
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
            {market.slug}
          </p>
          <h2 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-stone-950">
            {market.question}
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-700">
            This page is now the replay surface for a BTC 5-minute market. It
            shows current displayed probabilities, the Chainlink BTC reference,
            replay-sample quality state, and explicit missing rows instead of
            smoothing over gaps.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="rounded-[1.35rem] border border-black/10 bg-white/80 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Current up / down
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              {currentSnapshot ? formatProbability(currentSnapshot.upDisplayed) : "pending"}
            </p>
            <p className="mt-1 text-sm text-stone-700">
              {currentSnapshot ? formatProbability(currentSnapshot.downDisplayed) : "pending"}
            </p>
          </div>
          <div className="rounded-[1.35rem] border border-black/10 bg-white/80 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Current BTC
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              {currentSnapshot ? formatBtcUsd(currentSnapshot.btcChainlink) : "pending"}
            </p>
            <p className="mt-1 text-sm text-stone-700">
              {currentSnapshot ? formatRelativeSecond(currentSnapshot.secondsFromWindowStart) : "pending"}
            </p>
          </div>
          <div className="rounded-[1.35rem] border border-black/10 bg-white/80 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Loaded replay span
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              {timeline.length}s
            </p>
            <p className="mt-1 text-sm text-stone-700">
              {coverage.observedCount} observed / {coverage.missingCount} missing
            </p>
          </div>
          <div className="rounded-[1.35rem] border border-black/10 bg-white/80 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Price to beat
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              {formatBtcReferenceValue(displayedPriceToBeat, activeReferenceFallback)}
            </p>
            <p className="mt-1 text-sm text-stone-700">
              {displayedPriceToBeatLabel}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-4">
        <InfoCard eyebrow="Window and lifecycle" title="Market timing">
          <p>Window: {formatEtRange(market.windowStartTs, market.windowEndTs)}</p>
          <p>Created: {formatEtDateTime(market.createdAt)}</p>
          <p>Accepting orders: {formatEtDateTime(market.acceptingOrdersAt)}</p>
          <p>Closed at: {formatEtDateTime(market.closedAt)}</p>
          <p>Resolved at: {formatEtDateTime(market.resolvedAt)}</p>
        </InfoCard>

        <InfoCard eyebrow="Outcome mapping" title="Token IDs">
          <div>
            <p className="font-semibold text-stone-950">{market.outcomeLabels.upLabel}</p>
            <p>{truncateTokenId(market.tokenIdsByOutcome.up)}</p>
          </div>
          <div>
            <p className="font-semibold text-stone-950">{market.outcomeLabels.downLabel}</p>
            <p>{truncateTokenId(market.tokenIdsByOutcome.down)}</p>
          </div>
          <p>Condition ID: {truncateTokenId(market.conditionId)}</p>
        </InfoCard>

        <InfoCard eyebrow="Resolution reference" title="Stored BTC thresholds">
          <p>
            Official price to beat:{" "}
            {formatBtcReferenceValue(
              market.priceToBeatOfficial,
              activeReferenceFallback,
            )}
          </p>
          <p>
            Derived price to beat:{" "}
            {formatBtcReferenceValue(
              market.priceToBeatDerived,
              derivedReferenceFallback,
            )}
          </p>
          <p>
            Official close reference:{" "}
            {formatBtcReferenceValue(
              market.closeReferencePriceOfficial,
              activeReferenceFallback,
            )}
          </p>
          <p>
            Derived close reference:{" "}
            {formatBtcReferenceValue(
              market.closeReferencePriceDerived,
              derivedReferenceFallback,
            )}
          </p>
          <p>
            Active view:{" "}
            {formatBtcReferenceValue(displayedPriceToBeat, activeReferenceFallback)} /{" "}
            {formatBtcReferenceValue(
              displayedCloseReference,
              activeReferenceFallback,
            )}
          </p>
        </InfoCard>

        <InfoCard eyebrow="Replay coverage" title="Loaded replay buckets">
          <p>Sampling cadence: {formatSamplingCadence(cadenceMs)}</p>
          <p>Loaded sample buckets: {coverage.loadedSeconds}</p>
          <p>Observed snapshots: {coverage.observedCount}</p>
          <p>Missing sample buckets: {coverage.missingCount}</p>
          <p>
            Live-window coverage:{" "}
            {formatCoverageShare(coverage.liveObservedCount, liveWindowSeconds)}
          </p>
          <p>
            Good quality:{" "}
            {formatCoverageShare(coverage.goodCount, coverage.observedCount)}
          </p>
        </InfoCard>
      </section>

      {marketSummary ? (
        <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <InfoCard eyebrow="Resolved summary" title="Finalized market output">
            <p>Outcome: {formatSummaryOutcome(marketSummary, market)}</p>
            <p>Finalized: {formatEtDateTime(marketSummary.finalizedAt)}</p>
            <p>
              Official start / end BTC:{" "}
              {formatBtcUsd(marketSummary.priceToBeatOfficial)} /{" "}
              {formatBtcUsd(marketSummary.closeReferencePriceOfficial)}
            </p>
            <p>
              Derived start / end BTC:{" "}
              {formatBtcUsd(marketSummary.priceToBeatDerived)} /{" "}
              {formatBtcUsd(marketSummary.closeReferencePriceDerived)}
            </p>
            <p>
              Crossed 60 / 70 / 80:{" "}
              {formatCrossingSecond(marketSummary.firstTimeAbove60)} /{" "}
              {formatCrossingSecond(marketSummary.firstTimeAbove70)} /{" "}
              {formatCrossingSecond(marketSummary.firstTimeAbove80)}
            </p>
          </InfoCard>

          <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
              Summary checkpoints
            </p>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-stone-950">
              Stored checkpoints and volatility
            </h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["T+0", marketSummary.upDisplayedAtT0],
                ["T+15", marketSummary.upDisplayedAtT15],
                ["T+30", marketSummary.upDisplayedAtT30],
                ["T+60", marketSummary.upDisplayedAtT60],
                ["T+120", marketSummary.upDisplayedAtT120],
                ["T+240", marketSummary.upDisplayedAtT240],
                ["T+295", marketSummary.upDisplayedAtT295],
                ["Std dev", marketSummary.upStdDev],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    {label}
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950">
                    {label === "Std dev"
                      ? formatSignedPercent(value)
                      : formatProbability(value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["Max", marketSummary.upMax],
                ["Min", marketSummary.upMin],
                ["Range", marketSummary.upRange],
                ["Drawdown", marketSummary.upMaxDrawdown],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                    {label}
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950">
                    {formatProbability(value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {marketSummary.qualityFlags.map((flag) => (
                <Pill key={flag} tone="stone">
                  {formatSummaryFlag(flag)}
                </Pill>
              ))}
            </div>
          </article>
        </section>
      ) : market.closed || market.resolved ? (
        <article className="rounded-[1.45rem] border border-dashed border-black/15 bg-white/70 p-6 text-sm leading-7 text-stone-700">
          This market is closed, but no finalized `market_summaries` row is
          stored yet. The finalizer should populate it on the next reconciliation
          pass.
        </article>
      ) : null}

      <ReplayLineChart
        eyebrow="Replay"
        title="Displayed probability over time"
        description={`Lines break when an expected replay sample bucket is missing. ${market.outcomeLabels.upLabel} and ${market.outcomeLabels.downLabel} use the left probability axis, while Chainlink BTC overlays on the right USD axis. The strip below shows whether each loaded ${formatSamplingCadence(
          cadenceMs,
        )} bucket was good, stale, gap-filled, or missing.`}
        emptyMessage="No snapshot history has been written for this market yet."
        formatAxisValue={(tick) => formatProbability(tick)}
        formatSecondaryAxisValue={(tick) =>
          new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 0,
          }).format(tick)
        }
        formatTimeValue={formatEtTimeWithSeconds}
        markers={probabilityMarkers}
        sampleCadenceMs={cadenceMs}
        secondaryYDomain={btcDomain}
        secondaryYTicks={btcTicks}
        series={[
          {
            color: "#0f766e",
            key: "upDisplayed",
            label: market.outcomeLabels.upLabel,
          },
          {
            color: "#be185d",
            key: "downDisplayed",
            label: market.outcomeLabels.downLabel,
          },
          {
            axis: "secondary",
            color: "#1d4ed8",
            dashArray: "8 6",
            key: "btcChainlink",
            label: "Chainlink BTC",
          },
        ]}
        timeline={timeline}
        yDomain={[0, 1]}
        yTicks={probabilityTicks}
      />

      <FinalTenSecondChart market={market} rows={finalWindowSecondRows} />

      <FinalTenSecondTape market={market} rows={finalWindowSecondRows} />

      <ReplayLineChart
        eyebrow="Reference BTC"
        title="Chainlink BTC over the same replay buckets"
        description={`This chart uses the same ${formatSamplingCadence(
          cadenceMs,
        )} replay buckets as the displayed-probability chart so the market and BTC reference can be read together.`}
        emptyMessage="No BTC-linked snapshots have been written for this market yet."
        formatAxisValue={(tick) =>
          new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 0,
          }).format(tick)
        }
        formatTimeValue={formatEtTimeWithSeconds}
        sampleCadenceMs={cadenceMs}
        series={[
          {
            color: "#1d4ed8",
            key: "btcChainlink",
            label: "Chainlink BTC",
          },
        ]}
        timeline={timeline}
        yDomain={btcDomain}
        yTicks={btcTicks}
      />

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <InfoCard eyebrow="Debug" title="Latest snapshot fields">
          {currentSnapshot ? (
            <>
              <p>Captured: {formatEtDateTime(currentSnapshot.ts)}</p>
              <p>Phase: {currentSnapshot.phase}</p>
              <p>
                Relative second:{" "}
                {formatRelativeSecond(currentSnapshot.secondsFromWindowStart)}
              </p>
              <p>
                Display rule:{" "}
                {formatSnapshotQualityLabel(currentSnapshot.displayRuleUsed)}
              </p>
              <p>Market imbalance: {formatSignedPercent(currentSnapshot.marketImbalance)}</p>
              <p>
                Up bid / ask: {formatProbability(currentSnapshot.upBid)} /{" "}
                {formatProbability(currentSnapshot.upAsk)}
              </p>
              <p>
                Down bid / ask: {formatProbability(currentSnapshot.downBid)} /{" "}
                {formatProbability(currentSnapshot.downAsk)}
              </p>
              <p>
                Up spread / down spread:{" "}
                {formatProbability(currentSnapshot.upSpread)} /{" "}
                {formatProbability(currentSnapshot.downSpread)}
              </p>
              <p>
                Top depth up / down: {formatDepth(currentSnapshot.upDepthBidTop)} /{" "}
                {formatDepth(currentSnapshot.downDepthBidTop)}
              </p>
            </>
          ) : (
            <p>No snapshot has been written for this market yet.</p>
          )}
        </InfoCard>

        <article className="rounded-[1.45rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
            Latest quality anomaly
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-stone-950">
            Most recent non-good replay bucket
          </h3>

          {latestIssue ? (
            <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
              <div className="flex flex-wrap gap-2">
                <Pill tone={getSnapshotQualityTone(latestIssue.sourceQuality)}>
                  {formatSnapshotQualityLabel(latestIssue.sourceQuality)}
                </Pill>
                <Pill tone="stone">
                  {formatRelativeSecond(latestIssue.secondsFromWindowStart)}
                </Pill>
              </div>
              <p>Captured: {formatEtDateTime(latestIssue.ts)}</p>
              <p>Phase: {latestIssue.phase}</p>
              <p>
                Up / Down: {formatProbability(latestIssue.upDisplayed)} /{" "}
                {formatProbability(latestIssue.downDisplayed)}
              </p>
              <p>BTC: {formatBtcUsd(latestIssue.btcChainlink)}</p>
              <p>Display rule: {formatSnapshotQualityLabel(latestIssue.displayRuleUsed)}</p>
              <p>
                Missing row: {latestIssue.missing ? "yes, explicit gap row" : "no"}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-7 text-stone-700">
              All loaded replay buckets are currently marked good.
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Object.entries(qualityBreakdown).map(([quality, count]) => (
              <div
                key={quality}
                className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {formatSnapshotQualityLabel(quality)}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950">
                  {count}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="rounded-[1.7rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-amber-700">
              Replay table
            </p>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              Loaded replay rows
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
              Missing replay buckets are rendered as explicit rows so capture
              gaps stay visible instead of being silently omitted.
            </p>
          </div>
          <div className="rounded-[1rem] border border-black/10 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            Showing {timelineRows.length} loaded replay bucket
            {timelineRows.length === 1 ? "" : "s"}
            {" "}at {formatSamplingCadence(cadenceMs)}
          </div>
        </div>

        {timelineRows.length === 0 ? (
          <p className="mt-6 text-sm leading-7 text-stone-700">
            Snapshot rows will appear here once the collector has captured this
            market.
          </p>
        ) : (
          <div className="mt-6 max-h-[34rem] overflow-auto rounded-[1.25rem] border border-black/10">
            <table className="min-w-full text-left text-sm text-stone-700">
              <thead className="sticky top-0 bg-stone-950 text-[11px] uppercase tracking-[0.18em] text-stone-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Second</th>
                  <th className="px-4 py-3 font-semibold">Captured</th>
                  <th className="px-4 py-3 font-semibold">Phase</th>
                  <th className="px-4 py-3 font-semibold">Up</th>
                  <th className="px-4 py-3 font-semibold">Down</th>
                  <th className="px-4 py-3 font-semibold">BTC</th>
                  <th className="px-4 py-3 font-semibold">Rule</th>
                  <th className="px-4 py-3 font-semibold">Quality</th>
                </tr>
              </thead>
              <tbody>
                {timelineRows.map((snapshot) => (
                  <tr
                    key={snapshot._id}
                    className={`border-t border-stone-200/80 ${snapshot.missing ? "bg-rose-50/55" : "bg-white"}`}
                  >
                    <td className="px-4 py-3 font-medium text-stone-950">
                      {formatRelativeSecond(snapshot.secondsFromWindowStart)}
                    </td>
                    <td className="px-4 py-3">
                      {snapshot.missing ? "missing" : formatEtDateTime(snapshot.ts)}
                    </td>
                    <td className="px-4 py-3">{snapshot.phase}</td>
                    <td className="px-4 py-3">
                      {formatProbability(snapshot.upDisplayed)}
                    </td>
                    <td className="px-4 py-3">
                      {formatProbability(snapshot.downDisplayed)}
                    </td>
                    <td className="px-4 py-3">{formatBtcUsd(snapshot.btcChainlink)}</td>
                    <td className="px-4 py-3">
                      {formatSnapshotQualityLabel(snapshot.displayRuleUsed)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={getSnapshotQualityTone(snapshot.sourceQuality)}>
                        {formatSnapshotQualityLabel(snapshot.sourceQuality)}
                      </Pill>
                    </td>
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
