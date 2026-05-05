import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import MarketsArchive from "@/components/MarketsArchive";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | Saved Markets",
  description:
    "Browse saved Polymarket BTC and ETH Up/Down 5-minute markets from the Convex catalog archive.",
};

export default function MarketsPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/markets" />

      <section className="rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(255,248,239,0.96),rgba(240,246,255,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)]">
        <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
          <span className="rounded-full bg-black px-3 py-1 text-white">
            Archive
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Saved markets
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Paginated catalog
          </span>
          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
            Convex-backed
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-amber-700">
            Market archive
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
            Past BTC and ETH 5-minute markets have a dedicated archive page.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-stone-700 sm:text-lg">
            Use this route to page through ended, resolved, or fully saved
            markets from Convex instead of relying on the small recent list from
            the dashboard.
          </p>
        </div>
      </section>

      {convexConfigured ? (
        <MarketsArchive />
      ) : (
        <ConvexSetupNotice
          title="Saved market archive unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL in Vercel to enable the paginated market archive."
        />
      )}
    </main>
  );
}
