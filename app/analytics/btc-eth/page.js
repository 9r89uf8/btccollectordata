import { Suspense } from "react";

import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import CryptoPairAnalytics from "@/components/CryptoPairAnalytics";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | BTC/ETH 5m Analytics",
  description:
    "Last-24-hour settlement comparison for paired Polymarket BTC and ETH Up/Down 5-minute markets.",
};

export default function BtcEthAnalyticsPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/analytics/btc-eth" />

      <section className="rounded-[1.6rem] border border-black/10 bg-white/85 p-7 shadow-[0_16px_48px_rgba(30,30,30,0.06)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-stone-600">
          <span className="rounded-full bg-stone-950 px-3 py-1 text-white">
            BTC/ETH
          </span>
          <span className="rounded-full border border-black/10 bg-white px-3 py-1">
            24h pairs
          </span>
          <span className="rounded-full border border-black/10 bg-white px-3 py-1">
            Settled outcomes
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-emerald-700">
            Crypto pair analytics
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Last-24-hour BTC and ETH settlement comparison.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-700">
            Markets are paired by the shared 5-minute timestamp and counted by
            same, opposite, missing, or unresolved settlement state.
          </p>
        </div>
      </section>

      {convexConfigured ? (
        <Suspense
          fallback={
            <div className="rounded-[1.2rem] border border-black/10 bg-white/88 p-5 text-sm text-stone-600">
              Loading comparison...
            </div>
          }
        >
          <CryptoPairAnalytics />
        </Suspense>
      ) : (
        <ConvexSetupNotice
          title="Comparison unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL to enable the BTC/ETH analytics page."
        />
      )}
    </main>
  );
}
