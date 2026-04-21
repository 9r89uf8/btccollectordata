import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import LiveSignalsDashboard from "@/components/LiveSignalsDashboard";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | Signals",
  description:
    "Live BTC-anchor checklist for Polymarket BTC Up/Down 5-minute markets.",
};

export default function SignalsPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/signals" />

      <section className="rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(255,248,239,0.96),rgba(240,246,255,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
          <span className="rounded-full bg-black px-3 py-1 text-white">
            Signals
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Live checklist
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            BTC vs anchor
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Path quality
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-emerald-700">
            Live call surface
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            A separate page for calling Up or Down from live BTC state.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-700 sm:text-lg">
            This route takes the strongest historical checkpoint rules and maps
            the active market into them. The output is intentionally simple:
            call Up, call Down, or say no clear call yet.
          </p>
        </div>
      </section>

      {convexConfigured ? (
        <LiveSignalsDashboard />
      ) : (
        <ConvexSetupNotice
          title="Signals unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL in Vercel to enable Convex-backed live signal queries."
        />
      )}
    </main>
  );
}
