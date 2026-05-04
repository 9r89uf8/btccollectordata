/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as btc from "../btc.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as internal_analyticsRollupRefresh from "../internal/analyticsRollupRefresh.js";
import type * as internal_analyticsRollups from "../internal/analyticsRollups.js";
import type * as internal_btcReferences from "../internal/btcReferences.js";
import type * as internal_discovery from "../internal/discovery.js";
import type * as internal_finalFlipReport from "../internal/finalFlipReport.js";
import type * as internal_finalize from "../internal/finalize.js";
import type * as internal_health from "../internal/health.js";
import type * as internal_ingestion from "../internal/ingestion.js";
import type * as internal_marketAnalytics from "../internal/marketAnalytics.js";
import type * as internal_marketStabilityAnalytics from "../internal/marketStabilityAnalytics.js";
import type * as internal_repair from "../internal/repair.js";
import type * as markets from "../markets.js";
import type * as snapshots from "../snapshots.js";
import type * as status from "../status.js";
import type * as summaries from "../summaries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  btc: typeof btc;
  crons: typeof crons;
  events: typeof events;
  health: typeof health;
  http: typeof http;
  "internal/analyticsRollupRefresh": typeof internal_analyticsRollupRefresh;
  "internal/analyticsRollups": typeof internal_analyticsRollups;
  "internal/btcReferences": typeof internal_btcReferences;
  "internal/discovery": typeof internal_discovery;
  "internal/finalFlipReport": typeof internal_finalFlipReport;
  "internal/finalize": typeof internal_finalize;
  "internal/health": typeof internal_health;
  "internal/ingestion": typeof internal_ingestion;
  "internal/marketAnalytics": typeof internal_marketAnalytics;
  "internal/marketStabilityAnalytics": typeof internal_marketStabilityAnalytics;
  "internal/repair": typeof internal_repair;
  markets: typeof markets;
  snapshots: typeof snapshots;
  status: typeof status;
  summaries: typeof summaries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
