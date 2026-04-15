const MAX_RECONNECT_DELAY_MS = 30000;
const SUBSCRIPTION_BATCH_SIZE = 200;

function uniqueAssetIds(assetIds) {
  return [...new Set(
    (Array.isArray(assetIds) ? assetIds : [])
      .filter((assetId) => typeof assetId === "string" && assetId !== ""),
  )];
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function isEmptyObject(value) {
  return value && typeof value === "object" && Object.keys(value).length === 0;
}

export function buildMarketSubscriptionRequest(assetIds) {
  return {
    assets_ids: uniqueAssetIds(assetIds),
    custom_feature_enabled: true,
    type: "market",
  };
}

export function buildMarketSubscriptionUpdate(operation, assetIds) {
  return {
    assets_ids: uniqueAssetIds(assetIds),
    operation,
  };
}

export function parseMarketSocketPayload(data) {
  if (typeof data !== "string") {
    return [];
  }

  const trimmed = data.trim();

  if (!trimmed || trimmed === "PING" || trimmed === "PONG") {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  const messages = Array.isArray(parsed) ? parsed : [parsed];

  return messages.filter((message) => {
    if (isEmptyObject(message)) {
      return false;
    }

    return Boolean(message?.event_type);
  });
}

export function startMarketWsClient({
  config,
  onError,
  onMessage,
  onStateChange,
}) {
  let socket = null;
  let heartbeatInterval = null;
  let connectTimeout = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let stopped = false;
  let desiredAssetIds = [];
  let subscribedAssetIds = new Set();

  function clearTimers() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
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

  function sendJson(payload) {
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }

  function sendSubscriptionRequest(assetIds) {
    for (const batch of chunk(assetIds, SUBSCRIPTION_BATCH_SIZE)) {
      sendJson(buildMarketSubscriptionRequest(batch));
    }
  }

  function sendSubscriptionUpdate(operation, assetIds) {
    for (const batch of chunk(assetIds, SUBSCRIPTION_BATCH_SIZE)) {
      sendJson(buildMarketSubscriptionUpdate(operation, batch));
    }
  }

  function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send("PING");
      }
    }, config.marketHeartbeatMs);
  }

  function scheduleReconnect() {
    if (stopped || desiredAssetIds.length === 0) {
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

  function closeIdleSocket() {
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(1000, "no market assets subscribed");
    }
  }

  function syncSubscriptions() {
    const nextSet = new Set(desiredAssetIds);
    const currentSet = subscribedAssetIds;
    const added = desiredAssetIds.filter((assetId) => !currentSet.has(assetId));
    const removed = [...currentSet].filter((assetId) => !nextSet.has(assetId));

    if (removed.length > 0) {
      sendSubscriptionUpdate("unsubscribe", removed);
    }

    if (added.length > 0) {
      sendSubscriptionUpdate("subscribe", added);
    }

    subscribedAssetIds = nextSet;
  }

  function connect() {
    if (stopped || desiredAssetIds.length === 0) {
      return;
    }

    clearTimers();
    onStateChange?.({ type: "connecting" });
    socket = new WebSocket(config.polymarketMarketWss);
    connectTimeout = setTimeout(() => {
      if (socket?.readyState === WebSocket.CONNECTING) {
        onError?.(
          new Error(
            `Market WS connection timed out after ${config.marketConnectTimeoutMs}ms`,
          ),
        );
        socket.close();
      }
    }, config.marketConnectTimeoutMs);

    socket.addEventListener("open", () => {
      if (connectTimeout) {
        clearTimeout(connectTimeout);
        connectTimeout = null;
      }

      reconnectAttempt = 0;
      subscribedAssetIds = new Set(desiredAssetIds);
      onStateChange?.({
        type: "open",
        assetCount: desiredAssetIds.length,
      });
      sendSubscriptionRequest(desiredAssetIds);
      startHeartbeat();
    });

    socket.addEventListener("message", (event) => {
      let messages = [];

      try {
        messages = parseMarketSocketPayload(String(event.data ?? ""));
      } catch (error) {
        onError?.(new Error(`Market WS message parse failed: ${error.message}`));
        return;
      }

      for (const message of messages) {
        onMessage?.(message);
      }
    });

    socket.addEventListener("error", () => {
      onError?.(new Error("Market WS socket error"));
    });

    socket.addEventListener("close", (event) => {
      clearTimers();
      subscribedAssetIds = new Set();
      onStateChange?.({
        type: "closed",
        code: event.code,
        reason: event.reason || null,
      });
      scheduleReconnect();
    });
  }

  return {
    setAssetIds(assetIds) {
      desiredAssetIds = uniqueAssetIds(assetIds);

      if (desiredAssetIds.length === 0) {
        closeIdleSocket();
        return;
      }

      if (!socket || socket.readyState >= WebSocket.CLOSING) {
        connect();
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        syncSubscriptions();
      }
    },

    stop() {
      stopped = true;
      clearTimers();
      subscribedAssetIds = new Set();

      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close(1000, "collector shutdown");
      }
    },
  };
}
