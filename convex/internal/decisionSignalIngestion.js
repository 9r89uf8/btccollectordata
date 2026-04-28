import { v } from "convex/values";

import { internalMutation } from "../_generated/server";
import {
  decisionSignalDedupeKey,
  normalizeDecisionSignal,
} from "../../packages/shared/src/decisionSignals.js";

export const insertDecisionSignals = internalMutation({
  args: {
    decisionSignals: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const seen = new Set();
    let inserted = 0;
    let skipped = 0;

    for (const input of args.decisionSignals) {
      const signal = normalizeDecisionSignal(input, { nowMs });
      const key = decisionSignalDedupeKey(signal);

      if (seen.has(key)) {
        skipped += 1;
        continue;
      }

      seen.add(key);

      const existing = await ctx.db
        .query("decision_signals")
        .withIndex("by_dedupe_key", (q) =>
          q
            .eq("marketSlug", signal.marketSlug)
            .eq("decisionVersion", signal.decisionVersion)
            .eq("checkpointSecond", signal.checkpointSecond)
            .eq("secondBucket", signal.secondBucket),
        )
        .first();

      if (existing) {
        skipped += 1;
        continue;
      }

      await ctx.db.insert("decision_signals", signal);
      inserted += 1;
    }

    return {
      inserted,
      skipped,
    };
  },
});
