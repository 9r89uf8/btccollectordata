import test from "node:test";
import assert from "node:assert/strict";

import { startRtdsClient } from "./rtds.js";

const BASE_CONFIG = {
  enableBinanceContext: true,
  polymarketRtdsWss: "wss://rtds.example.com",
  rtdsConnectTimeoutMs: 1000,
  rtdsHeartbeatMs: 60000,
};

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static instances = [];

  constructor(url) {
    this.listeners = new Map();
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSING;
    this.emit("close", { code, reason });
  }

  emit(type, event = {}) {
    if (type === "open") {
      this.readyState = FakeWebSocket.OPEN;
    }

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  send(message) {
    this.sent.push(message);
  }
}

async function withFakeWebSocket(fn) {
  const previous = globalThis.WebSocket;
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;

  try {
    await fn();
  } finally {
    globalThis.WebSocket = previous;
  }
}

test("startRtdsClient sends Binance filters as JSON when context is enabled", async () => {
  await withFakeWebSocket(async () => {
    const client = startRtdsClient({
      config: BASE_CONFIG,
      onError: () => {},
      onStateChange: () => {},
      onTick: () => {},
    });
    const socket = FakeWebSocket.instances[0];

    socket.emit("open");

    const message = JSON.parse(socket.sent[0]);

    assert.equal(message.subscriptions.length, 2);
    assert.deepEqual(JSON.parse(message.subscriptions[0].filters), {
      symbol: "btc/usd",
    });
    assert.deepEqual(JSON.parse(message.subscriptions[1].filters), {
      symbol: "btcusdt",
    });

    client.stop();
  });
});

test("startRtdsClient reports RTDS server error messages", async () => {
  await withFakeWebSocket(async () => {
    const errors = [];
    const client = startRtdsClient({
      config: BASE_CONFIG,
      onError: (error) => errors.push(error),
      onStateChange: () => {},
      onTick: () => {},
    });
    const socket = FakeWebSocket.instances[0];

    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        body: { message: "bad subscription" },
        statusCode: 400,
      }),
    });

    assert.equal(errors.length, 1);
    assert.equal(
      errors[0].message,
      "RTDS server error 400: bad subscription",
    );

    client.stop();
  });
});
