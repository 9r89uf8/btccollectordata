import { Suspense } from "react";

import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import PaperTradingDashboard from "@/components/PaperTradingDashboard";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | Paper Trading",
  description: "Paper trading state for BTC 5-minute leader-distance experiments.",
};

export default function PaperPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/paper" />

      <section className="rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(245,252,249,0.96),rgba(246,248,255,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
          <span className="rounded-full bg-black px-3 py-1 text-white">
            Paper
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Simulated
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Leader distance v0
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-emerald-700">
            BTC 5-minute paper trades
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Live paper state for the current-leader strategy.
          </h1>
        </div>
      </section>

      {convexConfigured ? (
        <Suspense
          fallback={
            <div className="rounded-[1.2rem] border border-black/10 bg-white/88 p-5 text-sm text-stone-600">
              Loading paper trades...
            </div>
          }
        >
          <PaperTradingDashboard />
        </Suspense>
      ) : (
        <ConvexSetupNotice
          title="Paper trading unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL to enable the paper trading dashboard."
        />
      )}
    </main>
  );
}
