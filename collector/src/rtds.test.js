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

test("startRtdsClient subscribes to BTC and ETH Chainlink and Binance feeds", async () => {
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
    assert.equal(message.subscriptions[0].topic, "crypto_prices_chainlink");
    assert.equal(message.subscriptions[0].type, "*");
    assert.equal(message.subscriptions[0].filters, "");
    assert.equal(message.subscriptions[1].topic, "crypto_prices");
    assert.equal(message.subscriptions[1].type, "update");
    assert.equal(Object.hasOwn(message.subscriptions[1], "filters"), false);

    client.stop();
  });
});

test("startRtdsClient emits ETH ticks from Chainlink and Binance messages", async () => {
  await withFakeWebSocket(async () => {
    const ticks = [];
    const client = startRtdsClient({
      config: BASE_CONFIG,
      onError: () => {},
      onStateChange: () => {},
      onTick: (tick) => ticks.push(tick),
    });
    const socket = FakeWebSocket.instances[0];

    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify([
        {
          topic: "crypto_prices_chainlink",
          type: "update",
          timestamp: 1770000000000,
          payload: {
            symbol: "eth/usd",
            timestamp: 1770000000000,
            value: 3456.78,
          },
        },
        {
          topic: "crypto_prices",
          type: "update",
          timestamp: 1770000001000,
          payload: {
            symbol: "ethusdt",
            timestamp: 1770000001000,
            value: 3457.12,
          },
        },
      ]),
    });

    assert.deepEqual(
      ticks.map((tick) => ({
        price: tick.price,
        source: tick.source,
        symbol: tick.symbol,
      })),
      [
        { price: 3456.78, source: "chainlink", symbol: "eth/usd" },
        { price: 3457.12, source: "binance", symbol: "ethusdt" },
      ],
    );

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
