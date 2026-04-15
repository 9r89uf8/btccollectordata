import { internal } from "./_generated/api";
import { cronJobs } from "convex/server";

const crons = cronJobs();

crons.interval(
  "discover active polymarket btc 5m markets",
  { seconds: 15 },
  internal.internal.discovery.syncActiveBtc5mMarkets,
  { limit: 200, maxPages: 10 },
);

crons.interval(
  "reconcile closed polymarket btc 5m markets and finalize summaries",
  { minutes: 1 },
  internal.internal.finalize.reconcileRecentClosedMarkets,
  { closedLimit: 200, finalizeLimit: 25 },
);

crons.interval(
  "repair stale active markets and missing summaries",
  { minutes: 5 },
  internal.internal.repair.reconcileStaleActiveMarketsAndMissingSummaries,
  { missingSummaryLimit: 100, staleLimit: 100 },
);

export default crons;
