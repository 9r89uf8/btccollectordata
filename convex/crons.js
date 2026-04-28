import { internal } from "./_generated/api";
import { cronJobs } from "convex/server";

const crons = cronJobs();
const ANALYTICS_MATERIALIZER_LOOKBACK_MS = 2 * 60 * 60 * 1000;

crons.interval(
  "discover active polymarket btc 5m markets",
  { seconds: 60 },
  internal.internal.discovery.syncActiveBtc5mMarkets,
  { limit: 50, maxPages: 2 },
);

crons.interval(
  "reconcile closed polymarket btc 5m markets and finalize summaries",
  { minutes: 15 },
  internal.internal.finalize.reconcileRecentClosedMarkets,
  { closedLimit: 200, finalizeLimit: 25 },
);

crons.interval(
  "materialize btc 5m analytics",
  { minutes: 10 },
  internal.internal.marketAnalytics.materializeMissingOrStale,
  { limit: 50, lookbackMs: ANALYTICS_MATERIALIZER_LOOKBACK_MS },
);

crons.interval(
  "materialize btc 5m stability analytics",
  { minutes: 10 },
  internal.internal.marketStabilityAnalytics.materializeMissingOrStale,
  { limit: 50, lookbackMs: ANALYTICS_MATERIALIZER_LOOKBACK_MS },
);

crons.interval(
  "refresh btc 5m analytics dashboard rollup",
  { minutes: 60 },
  internal.internal.analyticsRollups.refreshNow,
  {},
);

crons.interval(
  "repair stale active markets and missing summaries",
  { minutes: 60 },
  internal.internal.repair.reconcileStaleActiveMarketsAndMissingSummaries,
  { missingSummaryLimit: 100, staleLimit: 100 },
);

export default crons;
