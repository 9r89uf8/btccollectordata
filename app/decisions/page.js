import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import DecisionsDashboard from "@/components/DecisionsDashboard";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | Decision Signals",
  description:
    "Shadow decision engine rows, ENTER candidates, and reason-code diagnostics for BTC 5-minute markets.",
};

export default function DecisionsPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/decisions" />

      <section className="rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(246,250,255,0.96),rgba(248,250,244,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
          <span className="rounded-full bg-black px-3 py-1 text-white">
            Decisions
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Shadow mode
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Muted ENTER audit
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Reason-code drilldown
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-sky-700">
            BTC 5-minute shadow engine
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Decision rows, wait reasons, and would-have-entered candidates.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-700 sm:text-lg">
            This view reads persisted shadow rows only. Muted ENTER rows remain
            visible through actionPreMute so the audit trail stays intact while
            live actions are disabled.
          </p>
        </div>
      </section>

      {convexConfigured ? (
        <DecisionsDashboard />
      ) : (
        <ConvexSetupNotice
          title="Decision signals unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL to enable the shadow decision dashboard."
        />
      )}
    </main>
  );
}
