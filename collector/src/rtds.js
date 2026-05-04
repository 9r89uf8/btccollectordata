import {
  BTC_SOURCES,
  BTC_SYMBOLS,
  RTDS_TOPICS,
} from "../../packages/shared/src/ingest.js";

const MAX_RECONNECT_DELAY_MS = 30000;

function createSubscriptions(enableBinanceContext) {
  const subscriptions = [
    {
      topic: RTDS_TOPICS.CHAINLINK_CRYPTO,
      type: "*",
      filters: JSON.stringify({ symbol: BTC_SYMBOLS.CHAINLINK_BTC_USD }),
    },
  ];

  if (enableBinanceContext) {
    subscriptions.push({
      topic: RTDS_TOPICS.BINANCE_CRYPTO,
      type: "update",
      filters: JSON.stringify({ symbol: BTC_SYMBOLS.BINANCE_BTC_USDT }),
    });
  }

  return subscriptions;
}

function normalizeSingleTick({ payload, source, fallbackTs, isSnapshot }) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const symbol =
    typeof payload.symbol === "string" ? payload.symbol.toLowerCase() : null;
  const ts = Number(payload.timestamp ?? fallbackTs);
  const price = Number(payload.value);
  const receivedAt = Number(payload.received_at ?? Date.now());

  if (!symbol || !Number.isFinite(ts) || !Number.isFinite(price)) {
    return null;
  }

  return {
    source,
    symbol,
    ts,
    price,
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : Date.now(),
    isSnapshot,
  };
}

function extractTicksFromMessage(message) {
  if (!message || typeof message !== "object") {
    return [];
  }

  const { topic, type, payload, timestamp } = message;
  const isSnapshot = type === "subscribe";

  if (topic === RTDS_TOPICS.CHAINLINK_CRYPTO) {
    if (Array.isArray(payload?.data)) {
      return payload.data
        .map((entry) =>
          normalizeSingleTick({
            payload: {
              symbol: payload.symbol ?? BTC_SYMBOLS.CHAINLINK_BTC_USD,
              ...entry,
            },
            source: BTC_SOURCES.CHAINLINK,
            fallbackTs: timestamp,
            isSnapshot,
          }),
        )
        .filter(Boolean);
    }

    const tick = normalizeSingleTick({
      payload,
      source: BTC_SOURCES.CHAINLINK,
      fallbackTs: timestamp,
      isSnapshot,
    });

    return tick ? [tick] : [];
  }

  if (topic === RTDS_TOPICS.BINANCE_CRYPTO) {
    if (Array.isArray(payload?.data)) {
      return payload.data
        .map((entry) =>
          normalizeSingleTick({
            payload: entry,
            source: BTC_SOURCES.BINANCE,
            fallbackTs: timestamp,
            isSnapshot,
          }),
        )
        .filter(Boolean);
    }

    const tick = normalizeSingleTick({
      payload,
      source: BTC_SOURCES.BINANCE,
      fallbackTs: timestamp,
      isSnapshot,
    });

    return tick ? [tick] : [];
  }

  return [];
}

function parseSocketPayload(data) {
  if (typeof data !== "string") {
    return [];
  }

  const trimmed = data.trim();

  if (!trimmed || trimmed === "PONG" || trimmed === "PING") {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function formatServerError(message) {
  const statusCode = Number(message?.statusCode);
  const detail =
    typeof message?.body?.message === "string"
      ? message.body.message
      : typeof message?.message === "string"
        ? message.message
        : "unknown RTDS server error";

  return Number.isFinite(statusCode)
    ? `RTDS server error ${statusCode}: ${detail}`
    : `RTDS server error: ${detail}`;
}

export function startRtdsClient({
  config,
  onTick,
  onError,
  onStateChange,
}) {
  let socket = null;
  let pingInterval = null;
  let connectTimeout = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let stopped = false;

  function clearTimers() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (stopped) {
      return;
    }

    reconnectAttempt += 1;
    const baseDelay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      1000 * 2 ** Math.min(reconnectAttempt - 1, 5),
    );
    const jitterMs = Math.floor(Math.random() * 250);
    const delayMs = baseDelay + jitterMs;

    onStateChange?.({
      type: "reconnecting",
      attempt: reconnectAttempt,
      delayMs,
    });

    reconnectTimer = setTimeout(connect, delayMs);
  }

  function subscribe() {
    const message = {
      action: "subscribe",
      subscriptions: createSubscriptions(config.enableBinanceContext),
    };

    socket.send(JSON.stringify(message));
  }

  function startHeartbeat() {
    pingInterval = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send("PING");
      }
    }, config.rtdsHeartbeatMs);
  }

  function handleMessage(event) {
    let messages = [];

    try {
      messages = parseSocketPayload(String(event.data ?? ""));
    } catch (error) {
      onError?.(new Error(`RTDS message parse failed: ${error.message}`));
      return;
    }

    for (const message of messages) {
      const statusCode = Number(message?.statusCode);

      if (Number.isFinite(statusCode) && statusCode >= 400) {
        onError?.(new Error(formatServerError(message)));
        continue;
      }

      const ticks = extractTicksFromMessage(message);

      for (const tick of ticks) {
        onTick?.(tick);
      }
    }
  }

  function connect() {
    if (stopped) {
      return;
    }

    onStateChange?.({ type: "connecting" });
    socket = new WebSocket(config.polymarketRtdsWss);
    connectTimeout = setTimeout(() => {
      if (socket?.readyState === WebSocket.CONNECTING) {
        onError?.(
          new Error(
            `RTDS connection timed out after ${config.rtdsConnectTimeoutMs}ms`,
          ),
        );
        socket.close();
      }
    }, config.rtdsConnectTimeoutMs);

    socket.addEventListener("open", () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }
      reconnectAttempt = 0;
      onStateChange?.({ type: "open" });
      subscribe();
      startHeartbeat();
    });

    socket.addEventListener("message", handleMessage);

    socket.addEventListener("error", () => {
      onError?.(new Error("RTDS socket error"));
    });

    socket.addEventListener("close", (event) => {
      clearTimers();
      onStateChange?.({
        type: "closed",
        code: event.code,
        reason: event.reason || null,
      });
      scheduleReconnect();
    });
  }

  connect();

  return {
    stop() {
      stopped = true;
      clearTimers();

      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "collector shutdown");
      }
    },
  };
}
