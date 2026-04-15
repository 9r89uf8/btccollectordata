import Link from "next/link";

import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import ProjectStatusPanel from "@/components/ProjectStatusPanel";
import MarketsDashboard from "@/components/MarketsDashboard";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export default function Home() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/" />

      <section className="grid gap-6 rounded-[2rem] border border-black/10 bg-[linear-gradient(140deg,rgba(255,248,239,0.96),rgba(240,246,255,0.94))] p-8 shadow-[0_22px_70px_rgba(24,24,24,0.08)] lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-600">
            <span className="rounded-full bg-black px-3 py-1 text-white">
              Dashboard
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              Gamma discovery
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              Convex catalog
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              CLOB polling
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              Replay detail
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              Summary finalizer
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              Analytics
            </span>
            <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
              Market WS shadow
            </span>
          </div>
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-amber-700">
              Polymarket BTC Up/Down 5m
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl">
              Discovery, replay, analytics, and WS shadow capture are now live.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-700 sm:text-lg">
              Active BTC 5-minute markets are pulled from Gamma into Convex and
              surfaced here. Chainlink BTC ticks and one-second CLOB polling
              snapshots now flow through the collector into Convex, and the
              market WebSocket now runs beside polling in shadow mode to store
              raw events and measure parity. Each market route renders replay
              charts plus the gap-aware timeline, and the analytics route turns
              stored summaries into threshold, calibration, and crossing-time
              views.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.2rem] border border-black/10 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Step 10
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                Market WebSocket shadow capture with parity tracking
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-black/10 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Current sources
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                Gamma discovery, Chainlink RTDS BTC, CLOB polls, and market WS shadow
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-black/10 bg-white/75 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Next layer
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                Hardening, repair, and restart-safe backfill
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/analytics"
              className="inline-flex rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-800"
            >
              Open analytics
            </Link>
          </div>
        </div>

        {convexConfigured ? (
          <ProjectStatusPanel />
        ) : (
          <ConvexSetupNotice
            title="The app is wired for Convex, but this deployment does not have a valid public Convex URL."
            message="Set NEXT_PUBLIC_CONVEX_URL in Vercel to the full https://...convex.cloud URL for the deployment that your collector writes to."
          />
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-[1.6rem] border border-black/10 bg-white/85 p-6 shadow-[0_12px_40px_rgba(30,30,30,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
            Framework guardrails
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <li>Keep `layout.js` and `page.js` server-first by default.</li>
            <li>Limit Convex hooks to narrow client components.</li>
            <li>Stay in the root app until the codebase forces a split.</li>
          </ul>
        </article>

        <article className="rounded-[1.6rem] border border-black/10 bg-white/85 p-6 shadow-[0_12px_40px_rgba(30,30,30,0.06)]">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Step 10 live
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <li>Collector batches now post BTC ticks and market snapshots through the private Convex ingest route.</li>
            <li>Chainlink `btc/usd` RTDS ticks and CLOB polling snapshots now write into Convex together.</li>
            <li>Market WebSocket shadow capture now stores raw events in `market_events_raw` and keeps in-memory orderbook state for parity checks.</li>
            <li>Polling remains the persisted snapshot source while capture-mode rollout is gated by parity metrics and reconnect health.</li>
          </ul>
        </article>
      </section>

      {convexConfigured ? (
        <MarketsDashboard />
      ) : (
        <ConvexSetupNotice
          title="Catalog dashboard unavailable until Convex is configured."
          message="The homepage hides all Convex-backed query components when NEXT_PUBLIC_CONVEX_URL is missing or invalid so Vercel can prerender safely."
        />
      )}
    </main>
  );
}
