import { query } from "./_generated/server";

const ACTIVE_WINDOW_GRACE_MS = 60 * 1000;
const ACTIVE_WINDOW_LOOKAHEAD_MS = 10 * 60 * 1000;

export const getProjectShell = query({
  args: {},
  handler: async (ctx) => {
    const nowTs = Date.now();
    const latestMarket = await ctx.db
      .query("markets")
      .withIndex("by_windowStartTs")
      .order("desc")
      .first();
    const latestSummary = await ctx.db
      .query("market_summaries")
      .withIndex("by_windowStartTs")
      .order("desc")
      .first();
    const activeMarketRows = await ctx.db
      .query("markets")
      .withIndex("by_active_windowStartTs", (q) => q.eq("active", true))
      .collect();
    const activeMarkets = activeMarketRows.filter(
      (market) =>
        market.windowEndTs >= nowTs - ACTIVE_WINDOW_GRACE_MS &&
        market.windowStartTs <= nowTs + ACTIVE_WINDOW_LOOKAHEAD_MS,
    );
    const pollBackedActiveMarkets = activeMarkets.filter(
      (market) => market.captureMode === "poll",
    ).length;
    const wsBackedActiveMarkets = activeMarkets.filter(
      (market) => market.captureMode === "ws",
    ).length;
    const discoveryComplete = Boolean(latestMarket);
    const summariesLive = Boolean(latestSummary);
    const shadowReady = wsBackedActiveMarkets > 0;

    return {
      projectName: "Polymarket BTC Up/Down 5-minute tracker",
      phase: summariesLive
        ? "summaries"
        : shadowReady
          ? "ws-rollout"
          : discoveryComplete
            ? "dashboard"
            : "foundation",
      summary: summariesLive
        ? "Gamma discovery, polling snapshots, and stored summaries are live. Fast-moving collector health and latest BTC now load through their own narrow queries instead of the broad project shell."
        : shadowReady
          ? "Gamma discovery is live, active market capture includes WebSocket-backed rows, and the dashboard is ready while summary coverage catches up."
          : discoveryComplete
            ? "Gamma-backed BTC 5-minute catalog rows are live in Convex, the dashboard is up, and live collector details now load through narrow health queries."
            : "Convex is installed, the App Router shell is wired, and the schema stub is in place. Discovery, ingest, and polling snapshots are the next implementation slices.",
      services: [
        {
          name: "web",
          state: "ready",
          note: summariesLive
            ? "Homepage acts as the live market dashboard, and `/markets/[slug]` shows replay plus stored market summaries."
            : discoveryComplete
              ? "Homepage acts as the live market dashboard, and `/markets/[slug]` surfaces latest and recent market state."
              : "App Router shell is live in plain JavaScript with a narrow Convex client boundary.",
        },
        {
          name: "convex",
          state: "ready",
          note: summariesLive
            ? `Deployment is serving stored summaries plus ${pollBackedActiveMarkets} poll-backed active market(s) and ${wsBackedActiveMarkets} WS-backed active market(s).`
            : discoveryComplete
              ? `Deployment is serving catalog rows and ${activeMarkets.length} active market(s).`
              : "Deployment is configured and ready for discovery writes.",
        },
        {
          name: "collector",
          state: discoveryComplete ? "ready" : "pending",
          note: "Collector health, latest BTC, and batch diagnostics are loaded separately below so the shell query no longer rereads broad tables on every heartbeat.",
        },
      ],
      catalog: {
        totalMarkets: null,
        activeMarkets: activeMarkets.length,
        pollBackedActiveMarkets,
        wsBackedActiveMarkets,
        summaryMarkets: null,
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
          done: discoveryComplete,
        },
        {
          id: "polling-snapshots",
          label: "Poll CLOB and write second-by-second market snapshots",
          done: discoveryComplete,
        },
        {
          id: "replay",
          label: "Build replay-ready market detail charts and snapshot table",
          done: discoveryComplete,
        },
        {
          id: "summary-finalizer",
          label: "Finalize closed markets into market_summaries and patch data quality",
          done: summariesLive,
        },
        {
          id: "websocket-rollout",
          label: "Run market WebSocket capture in shadow mode and measure parity",
          done: shadowReady,
        },
      ],
    };
  },
});
