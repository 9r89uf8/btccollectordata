"use client";

import { useDeferredValue } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import MarketCard from "@/components/MarketCard";

function SectionHeader({ eyebrow, title, description, count }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-stone-950">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-700">
          {description}
        </p>
      </div>
      <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700">
        {count} markets
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <article
          key={index}
          className="rounded-[1.35rem] border border-black/10 bg-white p-5 shadow-[0_14px_38px_rgba(30,30,30,0.05)]"
        >
          <div className="h-4 w-32 animate-pulse rounded-full bg-stone-200" />
          <div className="mt-4 h-8 animate-pulse rounded-[0.8rem] bg-stone-100" />
          <div className="mt-5 h-24 animate-pulse rounded-[1rem] bg-stone-100" />
        </article>
      ))}
    </div>
  );
}

export default function MarketsDashboard() {
  const activeMarkets = useQuery(api.markets.listActiveBtc5m);
  const activeSnapshots = useQuery(
    api.snapshots.listLatestByMarketSlugs,
    activeMarkets === undefined
      ? "skip"
      : { slugs: activeMarkets.map((market) => market.slug) },
  );
  const recentMarkets = useQuery(api.markets.listRecentBtc5m, { limit: 6 });

  const deferredActiveMarkets = useDeferredValue(activeMarkets);
  const deferredActiveSnapshots = useDeferredValue(activeSnapshots);
  const deferredRecentMarkets = useDeferredValue(recentMarkets);

  if (
    deferredActiveMarkets === undefined ||
    deferredActiveSnapshots === undefined ||
    deferredRecentMarkets === undefined
  ) {
    return (
      <section className="space-y-10">
        <SectionHeader
          eyebrow="Catalog"
          title="Discovered BTC 5-minute markets"
          description="Loading the active and recent catalog from Convex."
          count="..."
        />
        <LoadingGrid />
      </section>
    );
  }

  const active = deferredActiveMarkets;
  const snapshotsBySlug = new Map(
    deferredActiveSnapshots.map((snapshot) => [snapshot.marketSlug, snapshot]),
  );
  const recent = deferredRecentMarkets.filter(
    (market) => !active.some((activeMarket) => activeMarket._id === market._id),
  );
  const nowTs = Date.now();
  const liveCount = active.filter(
    (market) => market.windowStartTs <= nowTs && nowTs < market.windowEndTs,
  ).length;
  const upcomingCount = active.filter((market) => market.windowStartTs > nowTs).length;

  return (
    <section className="space-y-10">
      <SectionHeader
        eyebrow="Catalog"
        title="Discovered BTC 5-minute markets"
        description="Active markets now include the latest polled snapshot state from CLOB plus Chainlink BTC. Recent entries below remain catalog-only until they have replay data."
        count={active.length + recent.length}
      />

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-stone-950">
              Active markets
            </h3>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">
              {liveCount} live / {upcomingCount} upcoming
            </span>
          </div>

          {active.length === 0 ? (
            <div className="rounded-[1.35rem] border border-dashed border-stone-300 bg-white/70 p-6 text-sm leading-7 text-stone-700">
              No active BTC 5-minute markets are cataloged right now.
            </div>
          ) : (
            <div className="grid gap-4">
              {active.map((market) => (
                <MarketCard
                  key={market._id}
                  market={market}
                  snapshot={snapshotsBySlug.get(market.slug) ?? null}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-stone-950">
              Recent catalog
            </h3>
            <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
              {recent.length} recent
            </span>
          </div>

          {recent.length === 0 ? (
            <div className="rounded-[1.35rem] border border-dashed border-stone-300 bg-white/70 p-6 text-sm leading-7 text-stone-700">
              Recent non-active catalog entries will appear here after discovery runs over more windows.
            </div>
          ) : (
            <div className="grid gap-4">
              {recent.map((market) => (
                <MarketCard key={market._id} market={market} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
