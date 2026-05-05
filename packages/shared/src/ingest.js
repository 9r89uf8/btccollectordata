export const CRYPTO_ASSETS = {
  BTC: "btc",
  ETH: "eth",
};

export const DEFAULT_CRYPTO_ASSETS = [
  CRYPTO_ASSETS.BTC,
  CRYPTO_ASSETS.ETH,
];

export const PRICE_SOURCES = {
  CHAINLINK: "chainlink",
  BINANCE: "binance",
};

export const BTC_SOURCES = PRICE_SOURCES;

export const CRYPTO_SYMBOLS_BY_ASSET = {
  [CRYPTO_ASSETS.BTC]: {
    [PRICE_SOURCES.CHAINLINK]: "btc/usd",
    [PRICE_SOURCES.BINANCE]: "btcusdt",
  },
  [CRYPTO_ASSETS.ETH]: {
    [PRICE_SOURCES.CHAINLINK]: "eth/usd",
    [PRICE_SOURCES.BINANCE]: "ethusdt",
  },
};

export const BTC_SYMBOLS = {
  CHAINLINK_BTC_USD:
    CRYPTO_SYMBOLS_BY_ASSET[CRYPTO_ASSETS.BTC][PRICE_SOURCES.CHAINLINK],
  BINANCE_BTC_USDT:
    CRYPTO_SYMBOLS_BY_ASSET[CRYPTO_ASSETS.BTC][PRICE_SOURCES.BINANCE],
};

export const ETH_SYMBOLS = {
  CHAINLINK_ETH_USD:
    CRYPTO_SYMBOLS_BY_ASSET[CRYPTO_ASSETS.ETH][PRICE_SOURCES.CHAINLINK],
  BINANCE_ETH_USDT:
    CRYPTO_SYMBOLS_BY_ASSET[CRYPTO_ASSETS.ETH][PRICE_SOURCES.BINANCE],
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

export function normalizeCryptoAsset(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return Object.values(CRYPTO_ASSETS).includes(normalized)
    ? normalized
    : null;
}

export function normalizeCryptoAssets(values, fallback = DEFAULT_CRYPTO_ASSETS) {
  const rawValues = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  const normalized = [
    ...new Set(rawValues.map(normalizeCryptoAsset).filter(Boolean)),
  ];

  return normalized.length > 0 ? normalized : [...fallback];
}

export function getCryptoSymbolsForAsset(asset) {
  const normalized = normalizeCryptoAsset(asset);

  return normalized ? CRYPTO_SYMBOLS_BY_ASSET[normalized] : null;
}

export function getCryptoAssetForSymbol({ source, symbol }) {
  if (typeof source !== "string" || typeof symbol !== "string") {
    return null;
  }

  const normalizedSource = source.trim().toLowerCase();
  const normalizedSymbol = symbol.trim().toLowerCase();

  for (const asset of Object.values(CRYPTO_ASSETS)) {
    if (CRYPTO_SYMBOLS_BY_ASSET[asset]?.[normalizedSource] === normalizedSymbol) {
      return asset;
    }
  }

  return null;
}
