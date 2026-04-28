import { query } from "./_generated/server";
import {
  DECISION_RUNTIME_FLAG_DEFAULTS,
  DECISION_RUNTIME_FLAG_KEYS,
  normalizeRuntimeFlagValue,
} from "../packages/shared/src/decisionSignals.js";

function safeRuntimeFlagValue(key, value) {
  try {
    return normalizeRuntimeFlagValue(key, value);
  } catch {
    return DECISION_RUNTIME_FLAG_DEFAULTS[key];
  }
}

export const getDecisionRuntimeFlags = query({
  args: {},
  handler: async (ctx) => {
    const flags = { ...DECISION_RUNTIME_FLAG_DEFAULTS };

    for (const key of Object.values(DECISION_RUNTIME_FLAG_KEYS)) {
      const row = await ctx.db
        .query("runtime_flags")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();

      if (row) {
        flags[key] = safeRuntimeFlagValue(key, row.value);
      }
    }

    return flags;
  },
});
