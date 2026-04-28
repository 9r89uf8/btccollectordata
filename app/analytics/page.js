import { Suspense } from "react";

import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | BTC 5m Analytics",
  description:
    "Reference-only postmortem analytics for Polymarket BTC Up/Down 5-minute markets.",
};

export default function AnalyticsPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/analytics" />

      <section className="rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(246,250,255,0.96),rgba(248,250,244,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
          <span className="rounded-full bg-black px-3 py-1 text-white">
            Analytics
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Reference-only
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            No live signals
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            No market odds
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-700">
            BTC 5-minute postmortems
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Current-leader and distance analytics for resolved BTC windows.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-700 sm:text-lg">
            This page only uses the BTC reference line, Chainlink ticks, and the
            final winning side. It starts with dataset health so weak rows are
            visible before any heatmap.
          </p>
        </div>
      </section>

      {convexConfigured ? (
        <Suspense
          fallback={
            <div className="rounded-[1.2rem] border border-black/10 bg-white/88 p-5 text-sm text-stone-600">
              Loading analytics...
            </div>
          }
        >
          <AnalyticsDashboard />
        </Suspense>
      ) : (
        <ConvexSetupNotice
          title="Analytics unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL to enable the BTC 5-minute analytics dashboard."
        />
      )}
    </main>
  );
}
