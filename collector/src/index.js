import process from "node:process";

import {
  BTC_SOURCES,
  COLLECTOR_STATUS,
  INGEST_MAX_BATCH_ITEMS,
} from "../../packages/shared/src/ingest.js";
import { CAPTURE_MODES } from "../../packages/shared/src/market.js";
import { fetchClobMarketData } from "./clob.js";
import { loadCollectorConfig } from "./config.js";
import { createIngestClient, createQueryClient } from "./convexClient.js";
import { startMarketWsClient } from "./marketWs.js";
import { startRtdsClient } from "./rtds.js";
import { buildMarketSnapshots, compareSnapshotParity } from "./snapshotter.js";
import {
  buildAssetInfoByTokenId,
  createMarketStateStore,
  extractRawEventsFromMarketMessage,
} from "./state.js";

const MAX_RAW_EVENTS_PER_BATCH = Math.min(INGEST_MAX_BATCH_ITEMS, 100);

if (typeof WebSocket !== "function") {
  throw new Error(
    "Global WebSocket is unavailable in this Node runtime. Use Node 21 or newer.",
  );
}

function dedupeKeyForTick(tick) {
  return `${tick.source}:${tick.symbol}:${tick.ts}`;
}

function dedupeKeyForSnapshot(snapshot) {
  return `${snapshot.marketSlug}:${snapshot.secondBucket}`;
}

function dedupeKeyForRawEvent(event) {
  return [
    event.marketSlug,
    event.assetId,
    event.ts,
    event.eventType,
    event.eventHash ?? "",
  ].join(":");
}

function sortByTimestamp(items, tieBreaker) {
  return [...items].sort((a, b) => {
    if (a.ts !== b.ts) {
      return a.ts - b.ts;
    }

    return tieBreaker(a, b);
  });
}

function formatError(error) {
  if (!error) {
    return "unknown collector error";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }

  return "unknown collector error";
}

function getActiveAssetIds(markets) {
  return [...new Set(
    (Array.isArray(markets) ? markets : []).flatMap((market) => [
      market?.tokenIdsByOutcome?.up,
      market?.tokenIdsByOutcome?.down,
    ]),
  )].filter((assetId) => typeof assetId === "string" && assetId !== "");
}

function hasSnapshotSignal(snapshot) {
  const signalFields = [
    "upBid",
    "upAsk",
    "upMid",
    "upLast",
    "upDisplayed",
    "downBid",
    "downAsk",
    "downMid",
    "downLast",
    "downDisplayed",
  ];

  return signalFields.some((field) => Number.isFinite(snapshot?.[field]));
}

function createEmptyMarketData() {
  return {
    booksByTokenId: new Map(),
    lastTradesByTokenId: new Map(),
    midpointsByTokenId: new Map(),
  };
}

function takeSortedEntries(map, limit, tieBreaker) {
  return sortByTimestamp(map.values(), tieBreaker).slice(0, limit);
}

async function main() {
  const config = loadCollectorConfig();
  const ingestClient = createIngestClient(config);
  const queryClient = createQueryClient(config);
  const marketStateStore = createMarketStateStore();
  const pendingTicks = new Map();
  const pendingSnapshots = new Map();
  const pendingRawEvents = new Map();
  const latestSnapshotsByMarketSlug = new Map();

  const state = {
    activeMarkets: [],
    collectorSeq: 0,
    flushInFlight: false,
    gapCount24h: 0,
    lastBatchSentAt: null,
    lastBtcTickAt: null,
    lastError: null,
    lastHealthSentAt: null,
    lastMarketEventAt: null,
    lastParityLogAt: null,
    lastWsEventAt: null,
    lastWsSnapshotAt: null,
    latestBinanceTick: null,
    latestChainlinkTick: null,
    marketInfoByAssetId: new Map(),
    marketRefreshInFlight: false,
    marketWsConnected: false,
    marketWsReconnectCount24h: 0,
    parityMismatchCount24h: 0,
    partialPollCount24h: 0,
    pollFailureCount24h: 0,
    pollOverrunCount24h: 0,
    reconnectCount24h: 0,
    rtdsConnected: false,
    shuttingDown: false,
    snapshotCaptureMode: CAPTURE_MODES.POLL,
    snapshotPollInFlight: false,
    lastPollCompletedAt: null,
    lastPollDurationMs: null,
    lastPollEndpointErrors: [],
    lastPollStartedAt: null,
    lastPollStatus: null,
  };

  const intervals = [];
  const marketWsClient = config.enableMarketWs
    ? startMarketWsClient({
        config,
        onError: (error) => {
          state.lastError = formatError(error);
          console.error("[collector] market websocket error", {
            error: state.lastError,
          });
        },
        onMessage: (message) => {
          marketStateStore.applyMarketMessage(message);

          const rawEvents = extractRawEventsFromMarketMessage({
            collectorSeqStart: state.collectorSeq,
            ingestedAt: Date.now(),
            marketsByAssetId: state.marketInfoByAssetId,
            message,
          });

          if (rawEvents.length === 0) {
            return;
          }

          state.lastWsEventAt = rawEvents[rawEvents.length - 1].ts;
          state.collectorSeq += rawEvents.length;

          if (!config.persistMarketRawEvents) {
            return;
          }

          for (const rawEvent of rawEvents) {
            pendingRawEvents.set(dedupeKeyForRawEvent(rawEvent), rawEvent);
          }
        },
        onStateChange: (event) => {
          if (event.type === "open") {
            state.marketWsConnected = true;
            console.info("[collector] market websocket connected", {
              assetCount: event.assetCount ?? 0,
            });
            return;
          }

          if (event.type === "reconnecting") {
            state.marketWsConnected = false;
            state.marketWsReconnectCount24h += 1;
            console.warn("[collector] market websocket reconnect scheduled", {
              attempt: event.attempt,
              delayMs: event.delayMs,
            });
            return;
          }

          if (event.type === "connecting") {
            state.marketWsConnected = false;
            return;
          }

          if (event.type === "closed") {
            state.marketWsConnected = false;
            console.warn("[collector] market websocket closed", {
              code: event.code,
              reason: event.reason,
            });
          }
        },
      })
    : null;

  function queueBtcTick(tick) {
    pendingTicks.set(dedupeKeyForTick(tick), tick);

    if (tick.source === BTC_SOURCES.CHAINLINK) {
      state.latestChainlinkTick = tick;
      state.lastBtcTickAt = tick.ts;
      return;
    }

    if (tick.source === BTC_SOURCES.BINANCE) {
      state.latestBinanceTick = tick;
    }
  }

  function queueSnapshots(snapshots, captureMode) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return;
    }

    for (const snapshot of snapshots) {
      pendingSnapshots.set(dedupeKeyForSnapshot(snapshot), snapshot);
      latestSnapshotsByMarketSlug.set(snapshot.marketSlug, snapshot);
    }

    state.snapshotCaptureMode = captureMode;
    state.lastMarketEventAt = snapshots[snapshots.length - 1].ts;
  }

  function queueGapSnapshots(nowTs, reason) {
    const gapSnapshots = buildMarketSnapshots({
      latestBinanceTick: state.latestBinanceTick,
      latestChainlinkTick: state.latestChainlinkTick,
      marketData: createEmptyMarketData(),
      markets: state.activeMarkets,
      nowTs,
    });

    if (gapSnapshots.length === 0) {
      return;
    }

    state.gapCount24h += 1;
    queueSnapshots(gapSnapshots, CAPTURE_MODES.POLL);

    console.warn("[collector] queued fallback gap snapshots", {
      activeMarkets: state.activeMarkets.length,
      reason,
      ts: nowTs,
    });
  }

  function deriveCollectorStatus() {
    if (state.shuttingDown) {
      return COLLECTOR_STATUS.DEGRADED;
    }

    if (!state.rtdsConnected) {
      return state.lastBtcTickAt ? COLLECTOR_STATUS.DEGRADED : COLLECTOR_STATUS.DOWN;
    }

    if (
      config.enableMarketWs &&
      state.activeMarkets.length > 0 &&
      !state.marketWsConnected
    ) {
      return COLLECTOR_STATUS.DEGRADED;
    }

    if (state.lastError) {
      return COLLECTOR_STATUS.DEGRADED;
    }

    return COLLECTOR_STATUS.OK;
  }

  function buildHealth(batchSentAt, batchCounts) {
    const health = {
      gapCount24h: state.gapCount24h,
      lastBatchSentAt: batchSentAt,
      lastBatchBtcTicks: batchCounts.btcTicks,
      lastBatchRawEvents: batchCounts.rawEvents,
      lastBatchSnapshots: batchCounts.snapshots,
      lastBtcTickAt: state.lastBtcTickAt,
      lastError: state.lastError,
      lastHeartbeatAt: Date.now(),
      lastMarketEventAt: state.lastMarketEventAt,
      lastWsEventAt: state.lastWsEventAt,
      lastWsSnapshotAt: state.lastWsSnapshotAt,
      marketWsReconnectCount24h: state.marketWsReconnectCount24h,
      parityMismatchCount24h: state.parityMismatchCount24h,
      partialPollCount24h: state.partialPollCount24h,
      pollFailureCount24h: state.pollFailureCount24h,
      pollOverrunCount24h: state.pollOverrunCount24h,
      rawEventPersistenceEnabled: config.persistMarketRawEvents,
      reconnectCount24h: state.reconnectCount24h,
      snapshotCaptureMode: state.snapshotCaptureMode,
      lastPollCompletedAt: state.lastPollCompletedAt,
      lastPollDurationMs: state.lastPollDurationMs,
      lastPollEndpointErrors: state.lastPollEndpointErrors,
      lastPollStartedAt: state.lastPollStartedAt,
      lastPollStatus: state.lastPollStatus,
      status: deriveCollectorStatus(),
    };

    return health;
  }

  async function flush({ force = false } = {}) {
    if (state.flushInFlight) {
      return;
    }

    const rawEvents = takeSortedEntries(
      pendingRawEvents,
      MAX_RAW_EVENTS_PER_BATCH,
      (a, b) => a.collectorSeq - b.collectorSeq,
    );
    const btcTicks = takeSortedEntries(
      pendingTicks,
      INGEST_MAX_BATCH_ITEMS,
      (a, b) =>
        `${a.source}:${a.symbol}`.localeCompare(`${b.source}:${b.symbol}`),
    );
    const snapshots = takeSortedEntries(
      pendingSnapshots,
      INGEST_MAX_BATCH_ITEMS,
      (a, b) => a.marketSlug.localeCompare(b.marketSlug),
    );

    if (
      !force &&
      rawEvents.length === 0 &&
      btcTicks.length === 0 &&
      snapshots.length === 0
    ) {
      return;
    }

    const sentAt = Date.now();
    const batchCounts = {
      btcTicks: btcTicks.length,
      rawEvents: rawEvents.length,
      snapshots: snapshots.length,
    };
    const shouldSendHealth =
      force ||
      state.lastHealthSentAt === null ||
      sentAt - state.lastHealthSentAt >= config.collectorHeartbeatMs;
    state.flushInFlight = true;

    try {
      const batch = {
        sentAt,
        rawEvents,
        btcTicks,
        snapshots,
        snapshotCaptureMode: state.snapshotCaptureMode,
      };

      if (shouldSendHealth) {
        batch.health = buildHealth(sentAt, batchCounts);
      }

      await ingestClient.sendBatch(batch);

      for (const rawEvent of rawEvents) {
        pendingRawEvents.delete(dedupeKeyForRawEvent(rawEvent));
      }

      for (const tick of btcTicks) {
        pendingTicks.delete(dedupeKeyForTick(tick));
      }

      for (const snapshot of snapshots) {
        pendingSnapshots.delete(dedupeKeyForSnapshot(snapshot));
      }

      state.lastBatchSentAt = sentAt;
      if (shouldSendHealth) {
        state.lastHealthSentAt = sentAt;
      }
      state.lastError = null;
    } catch (error) {
      state.lastError = formatError(error);
      console.error("[collector] ingest flush failed", {
        error: state.lastError,
        rawEvents: rawEvents.length,
        btcTicks: btcTicks.length,
        snapshots: snapshots.length,
      });
    } finally {
      state.flushInFlight = false;
    }
  }

  async function refreshActiveMarkets() {
    if (state.marketRefreshInFlight || state.shuttingDown) {
      return;
    }

    state.marketRefreshInFlight = true;

    try {
      const nextMarkets = await queryClient.listActiveMarkets();
      const previousAssetIds = new Set(getActiveAssetIds(state.activeMarkets));
      const nextAssetIds = getActiveAssetIds(nextMarkets);
      const nextAssetIdSet = new Set(nextAssetIds);
      const removedAssetIds = [...previousAssetIds].filter(
        (assetId) => !nextAssetIdSet.has(assetId),
      );
      const nextMarketSlugs = new Set(
        nextMarkets
          .map((market) => market?.slug)
          .filter((slug) => typeof slug === "string" && slug !== ""),
      );
      const countsChanged =
        state.activeMarkets.length !== nextMarkets.length ||
        previousAssetIds.size !== nextAssetIds.length;

      state.activeMarkets = nextMarkets;
      state.marketInfoByAssetId = buildAssetInfoByTokenId(nextMarkets);

      if (removedAssetIds.length > 0) {
        marketStateStore.removeAssetIds(removedAssetIds);
      }

      for (const marketSlug of latestSnapshotsByMarketSlug.keys()) {
        if (!nextMarketSlugs.has(marketSlug)) {
          latestSnapshotsByMarketSlug.delete(marketSlug);
        }
      }

      marketWsClient?.setAssetIds(nextAssetIds);

      if (countsChanged) {
        console.info("[collector] active market set refreshed", {
          activeMarkets: nextMarkets.length,
          activeAssets: nextAssetIds.length,
        });
      }
    } catch (error) {
      state.lastError = formatError(error);
      console.error("[collector] active market refresh failed", {
        error: state.lastError,
      });
    } finally {
      state.marketRefreshInFlight = false;
    }
  }

  async function captureSnapshots() {
    if (state.shuttingDown || state.activeMarkets.length === 0) {
      return;
    }

    if (state.snapshotPollInFlight) {
      const nowTs = Date.now();
      state.pollOverrunCount24h += 1;
      state.lastPollStartedAt = nowTs;
      state.lastPollCompletedAt = nowTs;
      state.lastPollDurationMs = 0;
      state.lastPollStatus = "overrun";
      state.lastPollEndpointErrors = ["previous poll was still in flight"];
      queueGapSnapshots(nowTs, "poll_overrun");
      return;
    }

    state.snapshotPollInFlight = true;
    const pollStartedAt = Date.now();
    state.lastPollStartedAt = pollStartedAt;
    state.lastPollEndpointErrors = [];

    try {
      const activeAssetIds = getActiveAssetIds(state.activeMarkets);
      const nowTs = Date.now();
      let pollSnapshots = [];
      let pollError = null;

      try {
        const pollMarketData = await fetchClobMarketData(config, activeAssetIds);
        state.lastPollEndpointErrors = pollMarketData.endpointErrors.slice(0, 5);

        if (pollMarketData.endpointErrors.length > 0) {
          state.partialPollCount24h += 1;
          state.lastPollStatus = "partial";
          console.warn("[collector] partial CLOB poll failure", {
            errors: pollMarketData.endpointErrors,
          });
        } else {
          state.lastPollStatus = "ok";
        }

        pollSnapshots = buildMarketSnapshots({
          latestBinanceTick: state.latestBinanceTick,
          latestChainlinkTick: state.latestChainlinkTick,
          marketData: pollMarketData,
          markets: state.activeMarkets,
          nowTs,
        });
      } catch (error) {
        pollError = error;
        state.pollFailureCount24h += 1;
        state.lastPollStatus = "failed";
        state.lastPollEndpointErrors = [formatError(error)];
        console.error("[collector] polling snapshot capture failed", {
          error: formatError(error),
        });
        queueGapSnapshots(nowTs, "poll_failure");
      }

      const wsSnapshots = config.enableMarketWs
        ? buildMarketSnapshots({
            latestBinanceTick: state.latestBinanceTick,
            latestChainlinkTick: state.latestChainlinkTick,
            marketData: marketStateStore.buildMarketData(),
            markets: state.activeMarkets,
            nowTs,
          }).filter(hasSnapshotSignal)
        : [];

      if (wsSnapshots.length > 0) {
        state.lastWsSnapshotAt = nowTs;
      }

      if (pollSnapshots.length > 0 && wsSnapshots.length > 0) {
        const parity = compareSnapshotParity(
          pollSnapshots,
          wsSnapshots,
          config.marketWsParityTolerance,
        );

        if (parity.mismatchCount > 0) {
          state.parityMismatchCount24h += parity.mismatchCount;

          if (
            state.lastParityLogAt === null ||
            nowTs - state.lastParityLogAt >= 15000
          ) {
            state.lastParityLogAt = nowTs;
            console.warn("[collector] websocket parity mismatch", {
              matchedCount: parity.matchedCount,
              missingCount: parity.missingCount,
              mismatchCount: parity.mismatchCount,
              samples: parity.mismatches.slice(0, 5),
            });
          }
        }
      }

      const canUseWsAsPrimary =
        config.enableMarketWs &&
        config.marketWsPrimary &&
        wsSnapshots.length === state.activeMarkets.length;

      if (canUseWsAsPrimary) {
        queueSnapshots(wsSnapshots, CAPTURE_MODES.WS);
      } else if (pollSnapshots.length > 0) {
        queueSnapshots(pollSnapshots, CAPTURE_MODES.POLL);
      } else if (config.enableMarketWs && config.marketWsPrimary && wsSnapshots.length > 0) {
        queueSnapshots(wsSnapshots, CAPTURE_MODES.WS);
      } else if (pollError) {
        state.lastError = formatError(pollError);
      }
      state.lastPollCompletedAt = Date.now();
      state.lastPollDurationMs = state.lastPollCompletedAt - pollStartedAt;
    } finally {
      state.snapshotPollInFlight = false;
    }
  }

  const rtdsClient = startRtdsClient({
    config,
    onTick: (tick) => {
      queueBtcTick(tick);
    },
    onError: (error) => {
      state.lastError = formatError(error);
      console.error("[collector] RTDS error", {
        error: state.lastError,
      });
    },
    onStateChange: (event) => {
      if (event.type === "open") {
        state.rtdsConnected = true;
        console.info("[collector] RTDS connected");
        return;
      }

      if (event.type === "reconnecting") {
        state.rtdsConnected = false;
        state.reconnectCount24h += 1;
        console.warn("[collector] RTDS reconnect scheduled", {
          attempt: event.attempt,
          delayMs: event.delayMs,
        });
        return;
      }

      if (event.type === "connecting") {
        state.rtdsConnected = false;
        return;
      }

      if (event.type === "closed") {
        state.rtdsConnected = false;
        console.warn("[collector] RTDS closed", {
          code: event.code,
          reason: event.reason,
        });
      }
    },
  });

  async function shutdown(reason, exitCode = 0) {
    if (state.shuttingDown) {
      return;
    }

    state.shuttingDown = true;
    state.lastError = `collector shutdown: ${reason}`;

    for (const interval of intervals) {
      clearInterval(interval);
    }

    rtdsClient.stop();
    marketWsClient?.stop();

    try {
      await flush({ force: true });
    } catch (error) {
      console.error("[collector] shutdown flush failed", {
        error: formatError(error),
      });
    }

    process.exit(exitCode);
  }

  console.info("[collector] starting", {
    activeMarketsRefreshMs: config.activeMarketsRefreshMs,
    batchMs: config.collectorBatchMs,
    clobBase: config.polymarketClobBase,
    collectorName: config.collectorName,
    enableMarketWs: config.enableMarketWs,
    persistMarketRawEvents: config.persistMarketRawEvents,
    marketConnectTimeoutMs: config.marketConnectTimeoutMs,
    marketHeartbeatMs: config.marketHeartbeatMs,
    marketWsParityTolerance: config.marketWsParityTolerance,
    marketWsPrimary: config.marketWsPrimary,
    marketWsUrl: config.polymarketMarketWss,
    rtdsUrl: config.polymarketRtdsWss,
    snapshotPollMs: config.snapshotPollMs,
  });

  await refreshActiveMarkets();
  await captureSnapshots();
  await flush({ force: true });

  intervals.push(
    setInterval(() => {
      void flush();
    }, config.collectorBatchMs),
  );
  intervals.push(
    setInterval(() => {
      void flush({ force: true });
    }, config.collectorHeartbeatMs),
  );
  intervals.push(
    setInterval(() => {
      void refreshActiveMarkets();
    }, config.activeMarketsRefreshMs),
  );
  intervals.push(
    setInterval(() => {
      void captureSnapshots();
    }, config.snapshotPollMs),
  );

  if (Number.isFinite(config.exitAfterMs) && config.exitAfterMs > 0) {
    setTimeout(() => {
      void shutdown(`scheduled exit after ${config.exitAfterMs}ms`);
    }, config.exitAfterMs);
  }

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error("[collector] fatal startup error", {
    error: formatError(error),
  });
  process.exit(1);
});
