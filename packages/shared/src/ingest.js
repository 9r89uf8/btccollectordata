export const BTC_SOURCES = {
  CHAINLINK: "chainlink",
  BINANCE: "binance",
};

export const BTC_SYMBOLS = {
  CHAINLINK_BTC_USD: "btc/usd",
  BINANCE_BTC_USDT: "btcusdt",
};

export const COLLECTOR_STATUS = {
  OK: "ok",
  DEGRADED: "degraded",
  DOWN: "down",
};

export const RTDS_TOPICS = {
  CHAINLINK_CRYPTO: "crypto_prices_chainlink",
  BINANCE_CRYPTO: "crypto_prices",
};

export const DEFAULT_COLLECTOR_NAME = "btc-rtds-collector";

export const INGEST_MAX_BYTES = 512 * 1024;
export const INGEST_MAX_BATCH_ITEMS = 500;
