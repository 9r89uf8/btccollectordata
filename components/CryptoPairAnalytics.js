"use client";

import Link from "next/link";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { formatEtRange, formatUsd } from "@/components/marketFormat";

const STATUS_META = {
  missing_btc: {
    label: "Missing BTC",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  missing_eth: {
    label: "Missing ETH",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  opposite: {
    label: "Opposite",
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  same: {
    label: "Same",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  unresolved: {
    label: "Unresolved",
    className: "border-stone-200 bg-stone-50 text-stone-700",
  },
};

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "-";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "-";
}

function formatUtcTime(ts) {
  if (!Number.isFinite(ts)) {
    return "-";
  }

  return new Date(ts).toISOString().replace("T", " ").slice(0, 16);
}

function StatCard({ label, value, detail }) {
  return (
    <div className="rounded-[1rem] border border-black/10 bg-white p-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">
        {value}
      </p>
      {detail ? <p className="mt-2 text-sm text-stone-600">{detail}</p> : null}
    </div>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.unresolved;

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function OutcomeBadge({ outcome }) {
  if (outcome !== "up" && outcome !== "down") {
    return (
      <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-600">
        Pending
      </span>
    );
  }

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
        outcome === "up"
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-stone-300 bg-stone-100 text-stone-800"
      }`}
    >
      {outcome}
    </span>
  );
}

function MarketCell({ label, market }) {
  if (!market) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          {label}
        </p>
        <p className="text-sm text-stone-500">Missing</p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={market.winningOutcome} />
        <span className="text-xs text-stone-500">{market.dataQuality}</span>
      </div>
      <Link
        href={`/markets/${market.slug}`}
        className="block truncate text-sm font-medium text-stone-900 hover:text-amber-700"
      >
        {market.slug}
      </Link>
    </div>
  );
}

function PairRow({ pair }) {
  return (
    <article className="grid gap-4 rounded-[1rem] border border-black/10 bg-white p-4 shadow-[0_10px_28px_rgba(30,30,30,0.04)] md:grid-cols-[1.25fr_1fr_1fr_auto] md:items-center">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          {pair.timestampSlug}
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {formatEtRange(pair.windowStartTs, pair.windowEndTs)}
        </p>
      </div>
      <MarketCell label="BTC" market={pair.btc} />
      <MarketCell label="ETH" market={pair.eth} />
      <div className="md:justify-self-end">
        <StatusBadge status={pair.status} />
      </div>
    </article>
  );
}

function FlipBadge({ flipped, label }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
        flipped
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-stone-200 bg-stone-50 text-stone-600"
      }`}
    >
      {label}
    </span>
  );
}

function FlipEvidence({ window }) {
  if (!window?.flipped) {
    return <span className="text-stone-500">No flip evidence</span>;
  }

  const details = [];

  if (window.probabilityFlip) {
    details.push(
      `${window.probabilityFlip.side} ${Math.round(
        window.probabilityFlip.price * 100,
      )}c ${window.probabilityFlip.priceSource} at T-${window.probabilityFlip.secondsBeforeClose}s`,
    );
  }

  if (window.referenceFlip) {
    details.push(
      `${window.referenceFlip.side} reference ${formatUsd(
        window.referenceFlip.ethChainlink,
      )} vs ${formatUsd(window.referenceFlip.priceToBeat)} at T-${window.referenceFlip.secondsBeforeClose}s`,
    );
  }

  return <span>{details.join(" / ")}</span>;
}

function EthFlipRow({ row }) {
  return (
    <Link
      href={`/markets/${row.slug}`}
      className="group grid gap-4 rounded-[1rem] border border-black/10 bg-white p-4 shadow-[0_10px_28px_rgba(30,30,30,0.04)] transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(30,30,30,0.08)] lg:grid-cols-[1.3fr_0.8fr_1.4fr_auto] lg:items-center"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          {row.slug}
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-700">
          {formatEtRange(row.windowStartTs, row.windowEndTs)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={row.winningOutcome} />
        <span className="text-xs text-stone-500">{row.dataQuality}</span>
      </div>
      <div className="space-y-2 text-sm leading-6 text-stone-700">
        <p>
          10s: <FlipEvidence window={row.tenSecond} />
        </p>
        <p>
          5s: <FlipEvidence window={row.fiveSecond} />
        </p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <FlipBadge flipped={row.tenSecond?.flipped} label="10s" />
        <FlipBadge flipped={row.fiveSecond?.flipped} label="5s" />
      </div>
    </Link>
  );
}

function EthFinalFlipSection({ flips }) {
  if (!flips) {
    return (
      <div className="rounded-[1.2rem] border border-black/10 bg-white/85 p-5 text-sm text-stone-600 shadow-[0_12px_38px_rgba(30,30,30,0.05)]">
        Loading ETH final-window flips...
      </div>
    );
  }

  const { rows, scannedSnapshots, summary } = flips;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          detail={`${formatPercent(summary.flip10sRate)} of resolved ETH`}
          label="ETH flip 10s"
          value={formatNumber(summary.flip10s)}
        />
        <StatCard
          detail={`${formatPercent(summary.flip5sRate)} of resolved ETH`}
          label="ETH flip 5s"
          value={formatNumber(summary.flip5s)}
        />
        <StatCard
          detail={`${formatNumber(summary.marketsWithFinalSnapshots)} with final rows`}
          label="Resolved ETH"
          value={formatNumber(summary.resolvedEthMarkets)}
        />
        <StatCard
          detail={`${formatNumber(scannedSnapshots)} final snapshots scanned`}
          label="ETH markets"
          value={formatNumber(summary.ethMarkets)}
        />
      </div>

      <div className="rounded-[1.2rem] border border-black/10 bg-white/85 p-5 shadow-[0_12px_38px_rgba(30,30,30,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
          ETH final-window flips
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
          Strong late ETH side that settled the other way
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
          Probability flip uses an opposite displayed side at 80c or higher,
          falling back to ask only if displayed price is missing. Reference flip
          uses ETH Chainlink versus the market price to beat.
        </p>
        <div className="mt-4 grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
          <p>10s probability flips: {formatNumber(summary.probabilityFlip10s)}</p>
          <p>10s reference flips: {formatNumber(summary.referenceFlip10s)}</p>
          <p>Unresolved ETH: {formatNumber(summary.unresolvedEthMarkets)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[1rem] border border-dashed border-stone-300 bg-white/70 p-6 text-sm text-stone-700">
          No ETH final-window flips were found for the last 24 hours.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <EthFlipRow key={row.slug} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-[1rem] border border-black/10 bg-white"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[1rem] border border-black/10 bg-white" />
    </div>
  );
}

export default function CryptoPairAnalytics() {
  const dashboard = useQuery(api.cryptoAnalytics.getBtcEthOutcomeComparison, {
    hours: 24,
    rowLimit: 96,
  });
  const ethFinalFlips = useQuery(api.cryptoAnalytics.getEthFinalFlipAnalytics, {
    hours: 24,
    rowLimit: 50,
  });

  if (!dashboard) {
    return <LoadingState />;
  }

  const { pairs, scannedMarkets, scanLimit, summary, toTs } = dashboard;

  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          detail={`${formatNumber(summary.pairedWindows)} paired windows`}
          label="Resolved pairs"
          value={formatNumber(summary.resolvedPairs)}
        />
        <StatCard
          detail={`${formatPercent(summary.sameOutcomeRate)} of resolved pairs`}
          label="Same"
          value={formatNumber(summary.sameOutcome)}
        />
        <StatCard
          detail={`${formatPercent(summary.oppositeOutcomeRate)} of resolved pairs`}
          label="Opposite"
          value={formatNumber(summary.oppositeOutcome)}
        />
        <StatCard
          detail={`${formatNumber(summary.btcMarkets)} BTC / ${formatNumber(
            summary.ethMarkets,
          )} ETH`}
          label="Markets"
          value={formatNumber(summary.totalWindows)}
        />
      </div>

      <div className="rounded-[1.2rem] border border-black/10 bg-white/85 p-5 shadow-[0_12px_38px_rgba(30,30,30,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
              Last 24 hours
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
              BTC and ETH settlement pairs
            </h2>
          </div>
          <div className="rounded-full border border-black/10 bg-stone-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
            {formatNumber(scannedMarkets)} / {formatNumber(scanLimit)} scanned
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
          <p>Missing BTC windows: {formatNumber(summary.missingBtc)}</p>
          <p>Missing ETH windows: {formatNumber(summary.missingEth)}</p>
          <p>Unresolved pairs: {formatNumber(summary.unresolvedPairs)}</p>
        </div>
      </div>

      <EthFinalFlipSection flips={ethFinalFlips} />

      {pairs.length === 0 ? (
        <div className="rounded-[1rem] border border-dashed border-stone-300 bg-white/70 p-6 text-sm text-stone-700">
          No BTC/ETH market pairs are available for the last 24 hours.
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair) => (
            <PairRow key={pair.windowStartTs} pair={pair} />
          ))}
        </div>
      )}

      <p className="text-right text-xs text-stone-500">
        Updated {formatUtcTime(toTs)} UTC
      </p>
    </section>
  );
}
