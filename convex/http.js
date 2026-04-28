import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  DEFAULT_COLLECTOR_NAME,
  INGEST_MAX_BATCH_ITEMS,
  INGEST_MAX_BYTES,
} from "../packages/shared/src/ingest.js";
import { DECISION_ACTION_VALUES } from "../packages/shared/src/decisionConfig.js";

const http = httpRouter();

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function badRequest(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

function assertMonotonic(items, getTs, label) {
  let previousTs = null;

  for (const item of items) {
    const ts = getTs(item);

    if (!Number.isFinite(ts)) {
      throw new Error(`${label} includes an invalid timestamp`);
    }

    if (previousTs !== null && ts < previousTs) {
      throw new Error(`${label} must be sorted in non-decreasing timestamp order`);
    }

    previousTs = ts;
  }
}

http.route({
  path: "/ingest/polymarket",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configuredSecret = process.env.INGEST_SHARED_SECRET;

    if (!configuredSecret) {
      return badRequest("INGEST_SHARED_SECRET is not configured in Convex", 500);
    }

    const rawBody = await request.text();

    if (!rawBody) {
      return badRequest("Request body is required");
    }

    if (rawBody.length > INGEST_MAX_BYTES) {
      return badRequest("Request body exceeds ingest size limit", 413);
    }

    let payload;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return badRequest("Request body must be valid JSON");
    }

    if (payload.secret !== configuredSecret) {
      return badRequest("Invalid ingest secret", 401);
    }

    if (!Number.isFinite(payload.sentAt)) {
      return badRequest("sentAt must be a number");
    }

    const collectorName =
      typeof payload.collectorName === "string" && payload.collectorName.trim() !== ""
        ? payload.collectorName.trim()
        : DEFAULT_COLLECTOR_NAME;
    const rawEvents = Array.isArray(payload.rawEvents) ? payload.rawEvents : [];
    const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
    const btcTicks = Array.isArray(payload.btcTicks) ? payload.btcTicks : [];
    const decisionSignals = Array.isArray(payload.decisionSignals)
      ? payload.decisionSignals
      : [];
    const snapshotCaptureMode =
      typeof payload.snapshotCaptureMode === "string" &&
      ["poll", "ws", "backfill", "unknown"].includes(payload.snapshotCaptureMode)
        ? payload.snapshotCaptureMode
        : undefined;
    const health = payload.health && typeof payload.health === "object" ? payload.health : null;

    const batchSizes = [
      rawEvents.length,
      snapshots.length,
      btcTicks.length,
      decisionSignals.length,
    ];

    if (batchSizes.some((size) => size > INGEST_MAX_BATCH_ITEMS)) {
      return badRequest("One or more ingest arrays exceed the batch item limit", 413);
    }

    try {
      assertMonotonic(rawEvents, (event) => event.ts, "rawEvents");
      assertMonotonic(snapshots, (snapshot) => snapshot.ts, "snapshots");
      assertMonotonic(btcTicks, (tick) => tick.ts, "btcTicks");
      assertMonotonic(
        decisionSignals,
        (signal) => signal.evaluatedAt,
        "decisionSignals",
      );
    } catch (error) {
      return badRequest(error.message);
    }

    const results = {};

    if (rawEvents.length > 0) {
      results.rawEvents = await ctx.runMutation(
        internal["internal/ingestion"].insertRawEvents,
        { rawEvents },
      );
    }

    if (snapshots.length > 0) {
      results.snapshots = await ctx.runMutation(
        internal["internal/ingestion"].upsertSnapshots,
        {
          captureMode: snapshotCaptureMode,
          snapshots,
        },
      );
    }

    if (btcTicks.length > 0) {
      results.btcTicks = await ctx.runMutation(
        internal["internal/ingestion"].insertBtcTicks,
        { btcTicks },
      );
    }

    if (decisionSignals.length > 0) {
      results.decisionSignals = await ctx.runMutation(
        internal["internal/decisionSignalIngestion"].insertDecisionSignals,
        { decisionSignals },
      );
    }

    if (health) {
      results.health = await ctx.runMutation(
        internal["internal/health"].upsertCollectorHealth,
        {
          collectorName,
          status: health.status,
          lastHeartbeatAt: health.lastHeartbeatAt,
          lastMarketEventAt: health.lastMarketEventAt ?? null,
          lastBtcTickAt: health.lastBtcTickAt ?? null,
          lastBatchSentAt: health.lastBatchSentAt ?? payload.sentAt,
          reconnectCount24h: Number(health.reconnectCount24h ?? 0),
          gapCount24h: Number(health.gapCount24h ?? 0),
          lastWsEventAt:
            Number.isFinite(health.lastWsEventAt) ? Number(health.lastWsEventAt) : null,
          lastWsSnapshotAt:
            Number.isFinite(health.lastWsSnapshotAt)
              ? Number(health.lastWsSnapshotAt)
              : null,
          marketWsReconnectCount24h: Number(
            health.marketWsReconnectCount24h ?? 0,
          ),
          parityMismatchCount24h: Number(health.parityMismatchCount24h ?? 0),
          lastBatchRawEvents:
            Number.isFinite(health.lastBatchRawEvents)
              ? Number(health.lastBatchRawEvents)
              : null,
          lastBatchSnapshots:
            Number.isFinite(health.lastBatchSnapshots)
              ? Number(health.lastBatchSnapshots)
              : null,
          lastBatchBtcTicks:
            Number.isFinite(health.lastBatchBtcTicks)
              ? Number(health.lastBatchBtcTicks)
              : null,
          rawEventPersistenceEnabled:
            typeof health.rawEventPersistenceEnabled === "boolean"
              ? health.rawEventPersistenceEnabled
              : null,
          snapshotCaptureMode:
            typeof health.snapshotCaptureMode === "string" &&
            ["poll", "ws", "backfill", "unknown"].includes(
              health.snapshotCaptureMode,
            )
              ? health.snapshotCaptureMode
              : null,
          lastPollStartedAt:
            Number.isFinite(health.lastPollStartedAt)
              ? Number(health.lastPollStartedAt)
              : null,
          lastPollCompletedAt:
            Number.isFinite(health.lastPollCompletedAt)
              ? Number(health.lastPollCompletedAt)
              : null,
          lastPollDurationMs:
            Number.isFinite(health.lastPollDurationMs)
              ? Number(health.lastPollDurationMs)
              : null,
          lastPollStatus:
            typeof health.lastPollStatus === "string" &&
            ["ok", "partial", "overrun", "failed"].includes(
              health.lastPollStatus,
            )
              ? health.lastPollStatus
              : null,
          lastPollEndpointErrors: Array.isArray(health.lastPollEndpointErrors)
            ? health.lastPollEndpointErrors
                .filter((value) => typeof value === "string" && value.trim() !== "")
                .slice(0, 5)
            : [],
          pollOverrunCount24h:
            Number.isFinite(health.pollOverrunCount24h)
              ? Number(health.pollOverrunCount24h)
              : null,
          pollFailureCount24h:
            Number.isFinite(health.pollFailureCount24h)
              ? Number(health.pollFailureCount24h)
              : null,
          partialPollCount24h:
            Number.isFinite(health.partialPollCount24h)
              ? Number(health.partialPollCount24h)
              : null,
          lastDecisionAt:
            Number.isFinite(health.lastDecisionAt)
              ? Number(health.lastDecisionAt)
              : null,
          lastDecisionAction:
            DECISION_ACTION_VALUES.includes(health.lastDecisionAction)
              ? health.lastDecisionAction
              : null,
          decisionsEmittedLastBatch:
            Number.isFinite(health.decisionsEmittedLastBatch)
              ? Number(health.decisionsEmittedLastBatch)
              : null,
          lastError:
            typeof health.lastError === "string" && health.lastError.trim() !== ""
              ? health.lastError.trim().slice(0, 1000)
              : null,
        },
      );
    }

    return jsonResponse({
      ok: true,
      collectorName,
      sentAt: payload.sentAt,
      results,
    });
  }),
});

export default http;
