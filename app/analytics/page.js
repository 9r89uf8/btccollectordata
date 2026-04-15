import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import SiteHeader from "@/components/SiteHeader";

export const metadata = {
  title: "BTCGT | Analytics",
  description:
    "Threshold, calibration, and crossing-time analytics for Polymarket BTC 5-minute markets.",
};

export default function AnalyticsPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/analytics" />

      <section className="rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(255,248,239,0.96),rgba(240,246,255,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
          <span className="rounded-full bg-black px-3 py-1 text-white">
            Analytics
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Stored summaries
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Threshold stats
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Calibration
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Crossing timing
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-emerald-700">
            Step 9
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Finalized BTC 5-minute markets now roll up into a research surface.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-700 sm:text-lg">
            This route reads stored `market_summaries` from Convex and answers
            the core research questions directly: how often a side wins after
            clearing a probability threshold, whether displayed odds are
            calibrated, and when key upside thresholds are first crossed.
          </p>
        </div>
      </section>

      <AnalyticsDashboard />
    </main>
  );
}
