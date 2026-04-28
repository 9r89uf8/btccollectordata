import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import {
  DECISION_RUNTIME_FLAG_DEFAULTS,
  normalizeRuntimeFlagValue,
} from "../../packages/shared/src/decisionSignals.js";

async function upsertFlag(ctx, key, value, nowMs) {
  const existing = await ctx.db
    .query("runtime_flags")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const normalized = normalizeRuntimeFlagValue(key, value);

  if (!existing) {
    await ctx.db.insert("runtime_flags", {
      createdAt: nowMs,
      key,
      updatedAt: nowMs,
      value: normalized,
    });
    return "inserted";
  }

  await ctx.db.patch(existing._id, {
    updatedAt: nowMs,
    value: normalized,
  });
  return "updated";
}

export const ensureDecisionRuntimeFlagDefaults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const results = {};

    for (const [key, value] of Object.entries(DECISION_RUNTIME_FLAG_DEFAULTS)) {
      const existing = await ctx.db
        .query("runtime_flags")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (existing) {
        results[key] = "exists";
        continue;
      }

      await ctx.db.insert("runtime_flags", {
        createdAt: nowMs,
        key,
        updatedAt: nowMs,
        value,
      });
      results[key] = "inserted";
    }

    return results;
  },
});

export const setDecisionRuntimeFlag = internalMutation({
  args: {
    key: v.string(),
    value: v.any(),
  },
  handler: async (ctx, args) => {
    return await upsertFlag(ctx, args.key, args.value, Date.now());
  },
});
