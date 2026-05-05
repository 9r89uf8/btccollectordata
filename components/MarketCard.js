"use client";

import Link from "next/link";

import {
  formatReferenceValue,
  getAssetLabel,
  getChainlinkSnapshotKey,
  formatEtRange,
  formatProbability,
  getMarketState,
  getSnapshotQualityTone,
  getToneClasses,
} from "@/components/marketFormat";

function Pill({ tone, children }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getToneClasses(tone)}`}
    >
      {children}
    </span>
  );
}

export default function MarketCard({ market, snapshot = null }) {
  const state = getMarketState(market);
  const assetLabel = getAssetLabel(market);
  const chainlinkSnapshotKey = getChainlinkSnapshotKey(market);
  const chainlinkPrice = snapshot?.[chainlinkSnapshotKey];
  const startReference =
    market.priceToBeatOfficial ?? market.priceToBeatDerived ?? null;
  const startReferenceValueLabel = market.active
    ? "not published yet"
    : market.closed || market.resolved
      ? "missing"
      : "pending";
  const startReferenceLabel =
    market.priceToBeatOfficial != null
      ? "official"
      : market.priceToBeatDerived != null
        ? "derived"
        : market.active
          ? "awaiting source reference"
          : "reference unavailable";

  return (
    <Link
      href={`/markets/${market.slug}`}
      className="group rounded-[1.35rem] border border-black/10 bg-white p-5 shadow-[0_14px_38px_rgba(30,30,30,0.05)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(30,30,30,0.09)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            {market.slug}
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-7 tracking-[-0.02em] text-stone-950">
            {market.question}
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={market.asset === "eth" ? "emerald" : "sky"}>
            {assetLabel}
          </Pill>
          <Pill tone={state.tone}>{state.label}</Pill>
          <Pill tone="stone">{market.captureMode}</Pill>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1rem] bg-stone-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Window
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {formatEtRange(market.windowStartTs, market.windowEndTs)}
          </p>
        </div>
        <div className="rounded-[1rem] bg-stone-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Outcome labels
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {market.outcomeLabels.upLabel} / {market.outcomeLabels.downLabel}
          </p>
        </div>
        <div className="rounded-[1rem] bg-stone-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Price to beat
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {formatReferenceValue(startReference, startReferenceValueLabel)}
          </p>
          <p className="text-sm leading-6 text-stone-500">
            {startReferenceLabel}
          </p>
        </div>
      </div>

      {snapshot ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1rem] bg-sky-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
              Displayed probability
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              {market.outcomeLabels.upLabel}: {formatProbability(snapshot.upDisplayed)}
            </p>
            <p className="text-sm leading-6 text-stone-700">
              {market.outcomeLabels.downLabel}: {formatProbability(snapshot.downDisplayed)}
            </p>
          </div>
          <div className="rounded-[1rem] bg-stone-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              {assetLabel} and source
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              Chainlink {assetLabel}: {chainlinkPrice?.toFixed(2) ?? "pending"}
            </p>
            <p className="text-sm leading-6 text-stone-700">
              Rule: {snapshot.displayRuleUsed}
            </p>
          </div>
          <div className="rounded-[1rem] bg-stone-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Snapshot quality
            </p>
            <div className="mt-2">
              <Pill tone={getSnapshotQualityTone(snapshot.sourceQuality)}>
                {snapshot.sourceQuality}
              </Pill>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3 text-sm text-stone-600">
        <span>Data quality: {market.dataQuality}</span>
        <span className="font-medium text-stone-900 group-hover:text-amber-700">
          {snapshot ? "Open live detail" : "Open scaffold"}
        </span>
      </div>
    </Link>
  );
}
