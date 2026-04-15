import { query } from "./_generated/server";
import { BTC_SOURCES, BTC_SYMBOLS } from "../packages/shared/src/ingest.js";

const ACTIVE_WINDOW_GRACE_MS = 60 * 1000;
const ACTIVE_WINDOW_LOOKAHEAD_MS = 10 * 60 * 1000;

export const getProjectShell = query({
  args: {},
  handler: async (ctx) => {
    const allMarkets = await ctx.db.query("markets").collect();
    const allSummaries = await ctx.db.query("market_summaries").collect();
    const nowTs = Date.now();
    const activeMarketRows = await ctx.db
      .query("markets")
      .withIndex("by_active_windowStartTs", (q) => q.eq("active", true))
      .collect();
    const activeMarkets = activeMarketRows.filter(
      (market) =>
        market.windowEndTs >= nowTs - ACTIVE_WINDOW_GRACE_MS &&
        market.windowStartTs <= nowTs + ACTIVE_WINDOW_LOOKAHEAD_MS,
    );
    const collectorHealthRows = await ctx.db.query("collector_health").collect();
    const latestCollectorHealth =
      collectorHealthRows.length > 0
        ? [...collectorHealthRows].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : null;
    const latestChainlinkBtc = await ctx.db
      .query("btc_ticks")
      .withIndex("by_source_symbol_ts", (q) =>
        q.eq("source", BTC_SOURCES.CHAINLINK).eq("symbol", BTC_SYMBOLS.CHAINLINK_BTC_USD),
      )
      .order("desc")
      .first();
    const pollBackedActiveMarkets = activeMarkets.filter(
      (market) => market.captureMode === "poll",
    ).length;
    const wsBackedActiveMarkets = activeMarkets.filter(
      (market) => market.captureMode === "ws",
    ).length;
    const discoveryComplete = allMarkets.length > 0;
    const collectorLive = Boolean(latestCollectorHealth && latestChainlinkBtc);
    const snapshotsLive = Boolean(latestCollectorHealth?.lastMarketEventAt);
    const wsShadowLive = Boolean(
      latestCollectorHealth?.lastWsEventAt || latestCollectorHealth?.lastWsSnapshotAt,
    );
    const replayLive = snapshotsLive;
    const summariesLive = allSummaries.length > 0;
    const analyticsReady = summariesLive;

    return {
      projectName: "Polymarket BTC Up/Down 5-minute tracker",
      phase: analyticsReady
        ? "analytics"
        : wsShadowLive
          ? "ws-rollout"
        : replayLive
          ? "replay"
        : collectorLive
          ? "ingest"
          : discoveryComplete
            ? "dashboard"
            : "foundation",
      summary:
        analyticsReady
          ? wsShadowLive
            ? "Gamma discovery, RTDS BTC ingest, polling snapshots, replay detail, summary finalization, analytics, and market WebSocket shadow capture are all live. Polling remains the primary snapshot source while parity is measured."
            : "Gamma discovery, RTDS BTC ingest, polling snapshots, replay detail, summary finalization, and the analytics route are all live. The next slice is market WebSocket capture rollout."
        : wsShadowLive
          ? "Gamma discovery, Chainlink BTC RTDS ingest, polling snapshots, replay detail, and market WebSocket shadow capture are live. Polling is still the persisted snapshot source while raw events and parity metrics are evaluated."
        : replayLive
          ? "Gamma discovery, Chainlink BTC RTDS ingest, polling snapshots, and the replay-ready market detail page are all live in Convex and the web app. The next slice is summary finalization."
          : collectorLive
            ? "Gamma-backed catalog discovery is live, the dashboard is up, and Chainlink BTC RTDS ticks are now flowing through the collector into Convex."
          : discoveryComplete
            ? "Gamma-backed BTC 5-minute catalog rows are live in Convex, the dashboard and market route scaffold are in place, and the next slice is BTC RTDS ingest plus the collector write path."
            : "Convex is installed, the App Router shell is wired, and the schema stub is in place. Discovery, RTDS ingest, and polling snapshots are the next implementation slices.",
      services: [
        {
          name: "web",
          state: "ready",
          note: discoveryComplete
            ? analyticsReady
              ? wsShadowLive
                ? "Homepage acts as the live market dashboard, `/markets/[slug]` shows replay, `/analytics` exposes stored-summary research views, and collector health now surfaces WebSocket rollout metrics."
                : "Homepage acts as the live market dashboard, `/markets/[slug]` shows replay, and `/analytics` now exposes threshold, calibration, and crossing-time views."
            : wsShadowLive
              ? "Homepage acts as the live market dashboard, `/markets/[slug]` shows replay, and collector health now exposes WebSocket shadow-capture activity plus parity metrics."
            : replayLive
              ? "Homepage acts as the live market dashboard, and `/markets/[slug]` now shows replay charts, anomaly state, and the second-by-second table."
              : "Homepage now acts as the live market dashboard, and `/markets/[slug]` surfaces latest and recent second-bucket snapshots."
            : "App Router shell is live in plain JavaScript with a narrow Convex client boundary.",
        },
        {
          name: "convex",
          state: "ready",
          note:
            summariesLive
              ? `Deployment is serving ${allMarkets.length} catalog row(s), ${allSummaries.length} summary row(s), and poll-backed snapshots for ${pollBackedActiveMarkets} active market(s).`
            : wsShadowLive
              ? `Deployment is serving ${allMarkets.length} catalog row(s), poll-backed snapshots for ${pollBackedActiveMarkets} active market(s), and market WebSocket raw events through the ingest route.`
            : snapshotsLive
              ? `Deployment is serving ${allMarkets.length} catalog row(s) and poll-backed snapshots for ${pollBackedActiveMarkets} active market(s).`
              : allMarkets.length > 0
                ? `Deployment is configured and serving ${allMarkets.length} catalog row(s).`
              : "Deployment is configured and ready for Gamma discovery writes.",
        },
        {
          name: "collector",
          state: collectorLive ? "ready" : "pending",
          note: latestCollectorHealth
            ? wsShadowLive
              ? `Collector ${latestCollectorHealth.collectorName} is writing BTC ticks, poll snapshots, and market WebSocket raw events with status ${latestCollectorHealth.status}. Capture mode is ${latestCollectorHealth.snapshotCaptureMode ?? "unknown"} and parity mismatches recorded are ${latestCollectorHealth.parityMismatchCount24h ?? 0}.`
            : snapshotsLive
              ? `Collector ${latestCollectorHealth.collectorName} is writing BTC ticks and live market snapshots with status ${latestCollectorHealth.status}.`
              : `Collector ${latestCollectorHealth.collectorName} last heartbeated at ${latestCollectorHealth.lastHeartbeatAt} with status ${latestCollectorHealth.status}.`
            : "Collector scaffold exists, but RTDS and market ingest are not implemented yet.",
        },
      ],
      catalog: {
        totalMarkets: allMarkets.length,
        activeMarkets: activeMarkets.length,
        pollBackedActiveMarkets,
        wsBackedActiveMarkets,
        summaryMarkets: allSummaries.length,
        wsShadowLive,
      },
      checklist: [
        {
          id: "preflight",
          label: "Read local Next.js App Router docs before changing structure",
          done: true,
        },
        {
          id: "install",
          label: "Install Convex and add project scripts",
          done: true,
        },
        {
          id: "schema",
          label: "Commit schema stub for the six planned tables",
          done: true,
        },
        {
          id: "discovery",
          label: "Implement Gamma discovery and market parser",
          done: discoveryComplete,
        },
        {
          id: "dashboard",
          label: "Build the catalog dashboard and market route scaffold",
          done: discoveryComplete,
        },
        {
          id: "btc-ingest",
          label: "Stream Chainlink BTC into Convex and report collector health",
          done: collectorLive,
        },
        {
          id: "polling-snapshots",
          label: "Poll CLOB and write second-by-second market snapshots",
          done: snapshotsLive,
        },
        {
          id: "replay",
          label: "Build replay-ready market detail charts and snapshot table",
          done: replayLive,
        },
        {
          id: "summary-finalizer",
          label: "Finalize closed markets into market_summaries and patch data quality",
          done: summariesLive,
        },
        {
          id: "analytics",
          label: "Build analytics over stored market_summaries",
          done: analyticsReady,
        },
        {
          id: "websocket-rollout",
          label: "Run market WebSocket capture in shadow mode and measure parity",
          done: wsShadowLive,
        },
      ],
    };
  },
});
