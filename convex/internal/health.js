import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

export const upsertCollectorHealth = internalMutation({
  args: {
    collectorName: v.string(),
    status: v.union(v.literal("ok"), v.literal("degraded"), v.literal("down")),
    lastHeartbeatAt: v.number(),
    lastMarketEventAt: v.union(v.number(), v.null()),
    lastBtcTickAt: v.union(v.number(), v.null()),
    lastBatchSentAt: v.union(v.number(), v.null()),
    reconnectCount24h: v.number(),
    gapCount24h: v.number(),
    lastWsEventAt: v.optional(v.union(v.number(), v.null())),
    lastWsSnapshotAt: v.optional(v.union(v.number(), v.null())),
    marketWsReconnectCount24h: v.optional(v.number()),
    parityMismatchCount24h: v.optional(v.number()),
    lastBatchRawEvents: v.optional(v.union(v.number(), v.null())),
    lastBatchSnapshots: v.optional(v.union(v.number(), v.null())),
    lastBatchBtcTicks: v.optional(v.union(v.number(), v.null())),
    rawEventPersistenceEnabled: v.optional(v.union(v.boolean(), v.null())),
    snapshotCaptureMode: v.optional(
      v.union(
        v.literal("poll"),
        v.literal("ws"),
        v.literal("backfill"),
        v.literal("unknown"),
        v.null(),
      ),
    ),
    lastPollStartedAt: v.optional(v.union(v.number(), v.null())),
    lastPollCompletedAt: v.optional(v.union(v.number(), v.null())),
    lastPollDurationMs: v.optional(v.union(v.number(), v.null())),
    lastPollStatus: v.optional(
      v.union(
        v.literal("ok"),
        v.literal("partial"),
        v.literal("overrun"),
        v.literal("failed"),
        v.null(),
      ),
    ),
    lastPollEndpointErrors: v.optional(v.array(v.string())),
    pollOverrunCount24h: v.optional(v.union(v.number(), v.null())),
    pollFailureCount24h: v.optional(v.union(v.number(), v.null())),
    partialPollCount24h: v.optional(v.union(v.number(), v.null())),
    lastError: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("collector_health")
      .withIndex("by_collectorName", (q) => q.eq("collectorName", args.collectorName))
      .first();
    const payload = {
      ...args,
      updatedAt: Date.now(),
    };

    if (!existing) {
      return {
        collectorHealthId: await ctx.db.insert("collector_health", payload),
        created: true,
      };
    }

    await ctx.db.patch(existing._id, payload);

    return {
      collectorHealthId: existing._id,
      created: false,
    };
  },
});
