import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action, internalAction, internalMutation } from "../_generated/server";
import {
  CAPTURE_MODES,
  DATA_QUALITY,
  MARKET_OUTCOMES,
  extractOutcomeTokenMap,
  matchesBtcFiveMinuteFamily,
  parseGammaJsonArray,
  normalizeOutcomeLabel,
} from "../../packages/shared/src/market.js";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const GAMMA_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const GAMMA_MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toTimestamp(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function deriveWinningOutcome(event, market) {
  const priceToBeat = toNumber(event?.eventMetadata?.priceToBeat);
  const finalPrice = toNumber(event?.eventMetadata?.finalPrice);

  if (priceToBeat === null || finalPrice === null) {
    return deriveWinningOutcomeFromMarket(market);
  }

  return finalPrice >= priceToBeat
    ? MARKET_OUTCOMES.UP
    : MARKET_OUTCOMES.DOWN;
}

function deriveWinningOutcomeFromMarket(market) {
  const outcomes = parseGammaJsonArray(market?.outcomes);
  const outcomePrices = parseGammaJsonArray(market?.outcomePrices);
  const resolved =
    market?.umaResolutionStatus === "resolved" || Boolean(market?.closed);

  if (!resolved || !outcomes || !outcomePrices || outcomes.length !== outcomePrices.length) {
    return null;
  }

  const pricesByOutcome = {};

  for (let index = 0; index < outcomes.length; index += 1) {
    const outcome = normalizeOutcomeLabel(outcomes[index]);
    const price = toNumber(outcomePrices[index]);

    if (!outcome || price === null) {
      continue;
    }

    pricesByOutcome[outcome] = price;
  }

  if (
    pricesByOutcome[MARKET_OUTCOMES.UP] == null ||
    pricesByOutcome[MARKET_OUTCOMES.DOWN] == null
  ) {
    return null;
  }

  return pricesByOutcome[MARKET_OUTCOMES.UP] >= pricesByOutcome[MARKET_OUTCOMES.DOWN]
    ? MARKET_OUTCOMES.UP
    : MARKET_OUTCOMES.DOWN;
}

function normalizeGammaMarket({ event, market }) {
  const familyMatch = matchesBtcFiveMinuteFamily({ event, market });

  if (!familyMatch.matches || !familyMatch.parsedWindow) {
    return {
      market: null,
      skipReason: "not_btc_5m_family",
    };
  }

  const outcomeMapping = extractOutcomeTokenMap(market);

  if (!outcomeMapping) {
    return {
      market: null,
      skipReason: "missing_outcome_token_mapping",
    };
  }

  const question = cleanString(market.question) ?? cleanString(event.title);
  const slug = cleanString(market.slug) ?? cleanString(event.slug);

  if (!question || !slug) {
    return {
      market: null,
      skipReason: "missing_slug_or_question",
    };
  }

  const resolutionSource =
    cleanString(market.resolutionSource) ?? cleanString(event.resolutionSource);
  const createdAt =
    toTimestamp(market.createdAt) ??
    toTimestamp(market.startDate) ??
    toTimestamp(event.creationDate) ??
    toTimestamp(event.createdAt);
  const now = Date.now();
  const closedAt =
    toTimestamp(market.closedTime) ??
    toTimestamp(event.closedTime) ??
    toTimestamp(market.endDate) ??
    toTimestamp(event.endDate);
  const resolvedAt =
    toTimestamp(market.umaEndDate) ??
    toTimestamp(market.closedTime) ??
    toTimestamp(event.closedTime);
  const resolved =
    market.umaResolutionStatus === "resolved" ||
    deriveWinningOutcome(event, market) !== null ||
    false;
  const closed = Boolean(market.closed || event.closed || resolved);
  const active = Boolean(market.active && !closed);

  return {
    market: {
      slug,
      marketId: String(market.id),
      conditionId: cleanString(market.conditionId),
      eventId: cleanString(String(event.id)),
      question,
      title: cleanString(event.title) ?? question,
      outcomeLabels: outcomeMapping.outcomeLabels,
      tokenIdsByOutcome: outcomeMapping.tokenIdsByOutcome,
      createdAt,
      acceptingOrdersAt: toTimestamp(market.acceptingOrdersTimestamp),
      windowStartTs: familyMatch.parsedWindow.windowStartTs,
      windowEndTs: familyMatch.parsedWindow.windowEndTs,
      closedAt,
      resolvedAt,
      active,
      closed,
      resolved,
      winningOutcome: deriveWinningOutcome(event, market),
      resolutionSourceUrl: resolutionSource,
      priceToBeatOfficial: toNumber(event?.eventMetadata?.priceToBeat),
      priceToBeatDerived: null,
      closeReferencePriceOfficial: toNumber(event?.eventMetadata?.finalPrice),
      closeReferencePriceDerived: null,
      captureMode: CAPTURE_MODES.UNKNOWN,
      dataQuality: DATA_QUALITY.UNKNOWN,
      notes: `discovered_via_${familyMatch.matchReason}`,
      createdAtDb: now,
      updatedAtDb: now,
    },
    skipReason: null,
  };
}

async function fetchGammaEventsPage({
  cursor,
  limit,
  slug,
  statusFilter = "all",
}) {
  const url = new URL("/events/keyset", GAMMA_BASE);
  url.searchParams.set("limit", String(limit));

  if (slug) {
    url.searchParams.set("slug", slug);
  } else {
    url.searchParams.set("tag_slug", "bitcoin");
    url.searchParams.set("title_search", "Bitcoin Up or Down");
  }

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  if (statusFilter === "active") {
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
  } else if (statusFilter === "closed") {
    url.searchParams.set("closed", "true");
  }

  let lastError = null;

  for (let attempt = 0; attempt < GAMMA_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const retryable = GAMMA_RETRYABLE_STATUS_CODES.has(response.status);

        if (!retryable) {
          throw new Error(`Gamma discovery request failed: ${response.status}`);
        }

        lastError = new Error(
          `Gamma discovery request failed with retryable status ${response.status}`,
        );
      } else {
        const payload = await response.json();

        return {
          events: Array.isArray(payload.events) ? payload.events : [],
          nextCursor:
            typeof payload.next_cursor === "string" && payload.next_cursor !== ""
              ? payload.next_cursor
              : null,
          retriesUsed: attempt,
        };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < GAMMA_MAX_RETRIES - 1) {
      await sleep(250 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error("Gamma discovery request failed");
}

function incrementReason(map, reason) {
  map[reason] = (map[reason] ?? 0) + 1;
}

function createSkipSummary() {
  return {
    not_btc_5m_family: 0,
    missing_outcome_token_mapping: 0,
    missing_slug_or_question: 0,
  };
}

async function findExistingMarket(ctx, market) {
  const bySlug = await ctx.db
    .query("markets")
    .withIndex("by_slug", (q) => q.eq("slug", market.slug))
    .first();

  if (bySlug) {
    return bySlug;
  }

  const byMarketId = await ctx.db
    .query("markets")
    .withIndex("by_marketId", (q) => q.eq("marketId", market.marketId))
    .first();

  if (byMarketId) {
    return byMarketId;
  }

  if (market.conditionId) {
    const byConditionId = await ctx.db
      .query("markets")
      .withIndex("by_conditionId", (q) => q.eq("conditionId", market.conditionId))
      .first();

    if (byConditionId) {
      return byConditionId;
    }
  }

  return null;
}

export const syncActiveBtc5mMarkets = internalAction({
  args: {
    limit: v.optional(v.number()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 200, 500));
    const maxPages = Math.max(1, Math.min(args.maxPages ?? 10, 25));
    let cursor = null;
    let pageCount = 0;
    let fetchedEvents = 0;
    let retriesUsed = 0;
    const discoveredMarkets = [];
    const seenSlugs = new Set();
    const skipSummary = createSkipSummary();

    while (pageCount < maxPages) {
      const page = await fetchGammaEventsPage({
        cursor,
        limit,
        statusFilter: "active",
      });

      pageCount += 1;
      fetchedEvents += page.events.length;
      retriesUsed += page.retriesUsed;

      for (const event of page.events) {
        for (const market of Array.isArray(event.markets) ? event.markets : []) {
          const normalized = normalizeGammaMarket({ event, market });

          if (!normalized.market) {
            incrementReason(skipSummary, normalized.skipReason ?? "not_btc_5m_family");
            continue;
          }

          discoveredMarkets.push(normalized.market);
          seenSlugs.add(normalized.market.slug);
        }
      }

      if (!page.nextCursor || page.events.length === 0) {
        cursor = page.nextCursor;
        break;
      }

      cursor = page.nextCursor;
    }

    const upsertResult = await ctx.runMutation(
      internal.internal.discovery.upsertDiscoveredMarkets,
      { markets: discoveredMarkets },
    );
    const staleResult = await ctx.runMutation(
      internal.internal.discovery.markEndedMarketsInactive,
      { seenSlugs: [...seenSlugs], nowTs: Date.now() },
    );

    if (discoveredMarkets.length === 0 || skipSummary.missing_outcome_token_mapping > 0) {
      console.warn("[discovery] sync summary", {
        discoveredCount: discoveredMarkets.length,
        fetchedEvents,
        pageCount,
        retriesUsed,
        skipSummary,
      });
    } else {
      console.log("[discovery] sync summary", {
        discoveredCount: discoveredMarkets.length,
        fetchedEvents,
        pageCount,
        retriesUsed,
        skipSummary,
      });
    }

    return {
      fetchedEvents,
      discoveredCount: discoveredMarkets.length,
      pagesProcessed: pageCount,
      nextCursor: cursor,
      retriesUsed,
      skipSummary,
      ...upsertResult,
      ...staleResult,
    };
  },
});

export const backfillBtcFiveMinuteMarkets = internalAction({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    pages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const pages = Math.max(1, Math.min(args.pages ?? 1, 25));
    let cursor = args.cursor ?? null;
    let pageCount = 0;
    let fetchedEvents = 0;
    let retriesUsed = 0;
    const discoveredMarkets = [];
    const skipSummary = createSkipSummary();

    while (pageCount < pages) {
      const page = await fetchGammaEventsPage({
        cursor,
        limit,
        statusFilter: "all",
      });

      pageCount += 1;
      fetchedEvents += page.events.length;
      retriesUsed += page.retriesUsed;

      for (const event of page.events) {
        for (const market of Array.isArray(event.markets) ? event.markets : []) {
          const normalized = normalizeGammaMarket({ event, market });

          if (normalized.market) {
            discoveredMarkets.push(normalized.market);
          } else {
            incrementReason(skipSummary, normalized.skipReason ?? "not_btc_5m_family");
          }
        }
      }

      if (!page.nextCursor || page.events.length === 0) {
        cursor = page.nextCursor;
        break;
      }

      cursor = page.nextCursor;
    }

    const upsertResult = await ctx.runMutation(
      internal.internal.discovery.upsertDiscoveredMarkets,
      { markets: discoveredMarkets },
    );

    console.log("[discovery] backfill summary", {
      discoveredCount: discoveredMarkets.length,
      fetchedEvents,
      pageCount,
      retriesUsed,
      skipSummary,
    });

    return {
      nextCursor: cursor,
      pagesProcessed: pageCount,
      discoveredCount: discoveredMarkets.length,
      fetchedEvents,
      retriesUsed,
      skipSummary,
      ...upsertResult,
    };
  },
});

export const syncClosedBtc5mMarketsBySlug = internalAction({
  args: {
    slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const slugs = [...new Set(args.slugs.filter((slug) => slug && slug.trim() !== ""))].slice(
      0,
      100,
    );
    let fetchedEvents = 0;
    let missingSlugs = 0;
    let retriesUsed = 0;
    const discoveredMarkets = [];
    const skipSummary = createSkipSummary();

    for (const slug of slugs) {
      const page = await fetchGammaEventsPage({
        limit: 5,
        slug,
        statusFilter: "all",
      });
      fetchedEvents += page.events.length;
      retriesUsed += page.retriesUsed;

      if (page.events.length === 0) {
        missingSlugs += 1;
        continue;
      }

      for (const event of page.events) {
        for (const market of Array.isArray(event.markets) ? event.markets : []) {
          const normalized = normalizeGammaMarket({ event, market });

          if (!normalized.market) {
            incrementReason(skipSummary, normalized.skipReason ?? "not_btc_5m_family");
            continue;
          }

          discoveredMarkets.push(normalized.market);
        }
      }
    }

    const upsertResult = await ctx.runMutation(
      internal.internal.discovery.upsertDiscoveredMarkets,
      { markets: discoveredMarkets },
    );

    console.log("[discovery] closed sync summary", {
      discoveredCount: discoveredMarkets.length,
      fetchedEvents,
      missingSlugs,
      retriesUsed,
      slugCount: slugs.length,
      skipSummary,
    });

    return {
      fetchedEvents,
      discoveredCount: discoveredMarkets.length,
      missingSlugs,
      retriesUsed,
      skipSummary,
      slugCount: slugs.length,
      ...upsertResult,
    };
  },
});

export const upsertDiscoveredMarkets = internalMutation({
  args: {
    markets: v.array(
      v.object({
        slug: v.string(),
        marketId: v.string(),
        conditionId: v.union(v.string(), v.null()),
        eventId: v.union(v.string(), v.null()),
        question: v.string(),
        title: v.union(v.string(), v.null()),
        outcomeLabels: v.object({
          upLabel: v.string(),
          downLabel: v.string(),
        }),
        tokenIdsByOutcome: v.object({
          up: v.string(),
          down: v.string(),
        }),
        createdAt: v.union(v.number(), v.null()),
        acceptingOrdersAt: v.union(v.number(), v.null()),
        windowStartTs: v.number(),
        windowEndTs: v.number(),
        closedAt: v.union(v.number(), v.null()),
        resolvedAt: v.union(v.number(), v.null()),
        active: v.boolean(),
        closed: v.boolean(),
        resolved: v.boolean(),
        winningOutcome: v.union(
          v.literal("up"),
          v.literal("down"),
          v.null(),
        ),
        resolutionSourceUrl: v.union(v.string(), v.null()),
        priceToBeatOfficial: v.union(v.number(), v.null()),
        priceToBeatDerived: v.union(v.number(), v.null()),
        closeReferencePriceOfficial: v.union(v.number(), v.null()),
        closeReferencePriceDerived: v.union(v.number(), v.null()),
        captureMode: v.union(
          v.literal("poll"),
          v.literal("ws"),
          v.literal("backfill"),
          v.literal("unknown"),
        ),
        dataQuality: v.union(
          v.literal("good"),
          v.literal("partial"),
          v.literal("gap"),
          v.literal("unknown"),
        ),
        notes: v.union(v.string(), v.null()),
        createdAtDb: v.number(),
        updatedAtDb: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const market of args.markets) {
      const existing = await findExistingMarket(ctx, market);

      if (!existing) {
        await ctx.db.insert("markets", market);
        inserted += 1;
        continue;
      }

      await ctx.db.patch(existing._id, {
        ...market,
        captureMode:
          existing.captureMode !== CAPTURE_MODES.UNKNOWN
            ? existing.captureMode
            : market.captureMode,
        dataQuality:
          existing.dataQuality !== DATA_QUALITY.UNKNOWN
            ? existing.dataQuality
            : market.dataQuality,
        createdAtDb: existing.createdAtDb ?? market.createdAtDb,
        updatedAtDb: Date.now(),
      });
      updated += 1;
    }

    return {
      inserted,
      updated,
    };
  },
});

export const markEndedMarketsInactive = internalMutation({
  args: {
    seenSlugs: v.array(v.string()),
    nowTs: v.number(),
  },
  handler: async (ctx, args) => {
    const seenSlugs = new Set(args.seenSlugs);
    const activeMarkets = await ctx.db
      .query("markets")
      .withIndex("by_active_windowStartTs", (q) => q.eq("active", true))
      .collect();
    let deactivated = 0;

    for (const market of activeMarkets) {
      const clearlyEnded = market.windowEndTs <= args.nowTs - 60_000;

      if (seenSlugs.has(market.slug) || !clearlyEnded) {
        continue;
      }

      await ctx.db.patch(market._id, {
        active: false,
        closed: true,
        updatedAtDb: args.nowTs,
        notes: "discovery_marked_inactive_after_window_end",
      });
      deactivated += 1;
    }

    return {
      deactivated,
    };
  },
});
