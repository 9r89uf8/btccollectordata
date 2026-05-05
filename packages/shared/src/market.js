import { CRYPTO_ASSETS, normalizeCryptoAsset } from "./ingest.js";

export const MARKET_OUTCOMES = {
  UP: "up",
  DOWN: "down",
};

export const BTC_FIVE_MINUTE_WINDOW_MS = 5 * 60 * 1000;
export const ET_TIME_ZONE = "America/New_York";

export const CAPTURE_MODES = {
  POLL: "poll",
  WS: "ws",
  BACKFILL: "backfill",
  UNKNOWN: "unknown",
};

export const DATA_QUALITY = {
  GOOD: "good",
  PARTIAL: "partial",
  GAP: "gap",
  UNKNOWN: "unknown",
};

export const CRYPTO_FIVE_MINUTE_MARKET_FAMILIES = {
  [CRYPTO_ASSETS.BTC]: {
    asset: CRYPTO_ASSETS.BTC,
    gammaTagSlug: "bitcoin",
    resolutionSourcePattern: /data\.chain\.link\/streams\/btc-usd/i,
    slugPrefix: "btc-updown-5m-",
    titlePattern: /bitcoin up or down/i,
    titleSearch: "Bitcoin Up or Down",
  },
  [CRYPTO_ASSETS.ETH]: {
    asset: CRYPTO_ASSETS.ETH,
    gammaTagSlug: "ethereum",
    resolutionSourcePattern: /data\.chain\.link\/streams\/eth-usd/i,
    slugPrefix: "eth-updown-5m-",
    titlePattern: /ethereum up or down/i,
    titleSearch: "Ethereum Up or Down",
  },
};

const MONTH_LOOKUP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WINDOW_PATTERN =
  /((?:Bitcoin|Ethereum) Up or Down\s*-\s*)?(?<month>[A-Za-z]+)\s+(?<day>\d{1,2})(?:,\s*(?<year>\d{4}))?,\s*(?<start>\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*-\s*(?<end>\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*ET/i;

export function parseGammaJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeOutcomeLabel(label) {
  if (typeof label !== "string") {
    return null;
  }

  const normalized = label.trim().toLowerCase();

  if (normalized === "up") {
    return MARKET_OUTCOMES.UP;
  }

  if (normalized === "down") {
    return MARKET_OUTCOMES.DOWN;
  }

  return null;
}

export function extractOutcomeTokenMap(market) {
  const outcomes = parseGammaJsonArray(market?.outcomes);
  const tokenIds = parseGammaJsonArray(market?.clobTokenIds);

  if (!outcomes || !tokenIds || outcomes.length !== tokenIds.length) {
    return null;
  }

  const labelsByOutcome = {};
  const tokenIdsByOutcome = {};

  outcomes.forEach((label, index) => {
    const outcome = normalizeOutcomeLabel(label);
    const tokenId = tokenIds[index];

    if (!outcome || typeof tokenId !== "string" || tokenId.trim() === "") {
      return;
    }

    labelsByOutcome[outcome] = label;
    tokenIdsByOutcome[outcome] = tokenId;
  });

  if (!labelsByOutcome.up || !labelsByOutcome.down) {
    return null;
  }

  return {
    outcomeLabels: {
      upLabel: labelsByOutcome.up,
      downLabel: labelsByOutcome.down,
    },
    tokenIdsByOutcome: {
      up: tokenIdsByOutcome.up,
      down: tokenIdsByOutcome.down,
    },
  };
}

export function getCryptoFiveMinuteMarketFamily(asset) {
  const normalized = normalizeCryptoAsset(asset);

  return normalized
    ? CRYPTO_FIVE_MINUTE_MARKET_FAMILIES[normalized] ?? null
    : null;
}

export function parseCryptoFiveMinuteWindowFromSlug(slug, asset = null) {
  if (typeof slug !== "string") {
    return null;
  }

  const families = asset
    ? [getCryptoFiveMinuteMarketFamily(asset)].filter(Boolean)
    : Object.values(CRYPTO_FIVE_MINUTE_MARKET_FAMILIES);

  for (const family of families) {
    const escapedPrefix = family.slugPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = slug.match(new RegExp(`^${escapedPrefix}(\\d{9,})$`, "i"));

    if (!match) {
      continue;
    }

    const windowStartTs = Number(match[1]) * 1000;

    if (!Number.isFinite(windowStartTs)) {
      return null;
    }

    return {
      asset: family.asset,
      windowStartTs,
      windowEndTs: windowStartTs + BTC_FIVE_MINUTE_WINDOW_MS,
      timezone: ET_TIME_ZONE,
      source: "slug",
    };
  }

  return null;
}

export function parseBtcFiveMinuteWindowFromSlug(slug) {
  const parsed = parseCryptoFiveMinuteWindowFromSlug(slug, CRYPTO_ASSETS.BTC);

  if (!parsed) {
    return null;
  }

  const { asset: _asset, ...window } = parsed;
  return window;
}

function parseTimeToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const match = token.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
    return null;
  }

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }

  return {
    hour,
    minute,
    meridiem: match[3]?.toUpperCase() ?? null,
  };
}

function to24Hour(hour, meridiem) {
  if (meridiem === "AM") {
    return hour === 12 ? 0 : hour;
  }

  if (meridiem === "PM") {
    return hour === 12 ? 12 : hour + 12;
  }

  return null;
}

function getTimeZoneParts(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function getTimeZoneOffsetMs(timestamp, timeZone) {
  const parts = getTimeZoneParts(timestamp, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - timestamp;
}

function zonedDateTimeToUtc(parts, timeZone) {
  const approx = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
    0,
  );

  const offset = getTimeZoneOffsetMs(approx, timeZone);
  const candidate = approx - offset;
  const correctedOffset = getTimeZoneOffsetMs(candidate, timeZone);

  if (correctedOffset !== offset) {
    return approx - correctedOffset;
  }

  return candidate;
}

function addOneDay(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + 1);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getCandidateYears(explicitYear, referenceTs) {
  if (explicitYear) {
    return [explicitYear];
  }

  if (!Number.isFinite(referenceTs)) {
    return [];
  }

  const refYear = getTimeZoneParts(referenceTs, ET_TIME_ZONE).year;
  return [refYear - 1, refYear, refYear + 1];
}

function chooseBestWindow(candidates, referenceTs) {
  if (candidates.length === 0) {
    return null;
  }

  if (!Number.isFinite(referenceTs)) {
    return candidates.length === 1 ? candidates[0] : null;
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      distance: Math.min(
        Math.abs(candidate.windowStartTs - referenceTs),
        Math.abs(candidate.windowEndTs - referenceTs),
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  const best = ranked[0];
  const second = ranked[1];

  if (!best || best.distance > 36 * 60 * 60 * 1000) {
    return null;
  }

  if (second && second.distance === best.distance) {
    return null;
  }

  return best.candidate;
}

export function parseBtcFiveMinuteWindow(text, options = {}) {
  if (typeof text !== "string") {
    return null;
  }

  const match = text.match(WINDOW_PATTERN);

  if (!match?.groups) {
    return null;
  }

  const month = MONTH_LOOKUP[match.groups.month.trim().toLowerCase()];
  const day = Number(match.groups.day);
  const explicitYear = match.groups.year ? Number(match.groups.year) : null;
  const startToken = parseTimeToken(match.groups.start);
  const endToken = parseTimeToken(match.groups.end);

  if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  if (!startToken || !endToken) {
    return null;
  }

  const candidateYears = getCandidateYears(explicitYear, options.referenceTs);

  if (candidateYears.length === 0) {
    return null;
  }

  const startMeridiems = startToken.meridiem
    ? [startToken.meridiem]
    : ["AM", "PM"];
  const endMeridiems = endToken.meridiem ? [endToken.meridiem] : ["AM", "PM"];

  const candidates = [];

  for (const year of candidateYears) {
    for (const startMeridiem of startMeridiems) {
      for (const endMeridiem of endMeridiems) {
        const startHour = to24Hour(startToken.hour, startMeridiem);
        const endHour = to24Hour(endToken.hour, endMeridiem);

        if (startHour === null || endHour === null) {
          continue;
        }

        const startParts = {
          year,
          month,
          day,
          hour: startHour,
          minute: startToken.minute,
        };
        const endParts = {
          year,
          month,
          day,
          hour: endHour,
          minute: endToken.minute,
        };

        const windowStartTs = zonedDateTimeToUtc(startParts, ET_TIME_ZONE);
        let windowEndTs = zonedDateTimeToUtc(endParts, ET_TIME_ZONE);

        if (windowEndTs <= windowStartTs) {
          const nextDay = addOneDay({ year, month, day });
          windowEndTs = zonedDateTimeToUtc(
            {
              ...nextDay,
              hour: endHour,
              minute: endToken.minute,
            },
            ET_TIME_ZONE,
          );
        }

        if (windowEndTs - windowStartTs !== BTC_FIVE_MINUTE_WINDOW_MS) {
          continue;
        }

        candidates.push({
          windowStartTs,
          windowEndTs,
          timezone: ET_TIME_ZONE,
          source: "text",
        });
      }
    }
  }

  const uniqueCandidates = candidates.filter(
    (candidate, index, allCandidates) =>
      allCandidates.findIndex(
        (otherCandidate) =>
          otherCandidate.windowStartTs === candidate.windowStartTs &&
          otherCandidate.windowEndTs === candidate.windowEndTs,
      ) === index,
  );

  return chooseBestWindow(uniqueCandidates, options.referenceTs);
}

export function deriveBtcFiveMinuteWindow(input) {
  const parsed = deriveCryptoFiveMinuteWindow({
    ...input,
    asset: CRYPTO_ASSETS.BTC,
  });

  if (!parsed) {
    return null;
  }

  const { asset: _asset, ...window } = parsed;
  return window;
}

export function deriveCryptoFiveMinuteWindow(input) {
  const asset = normalizeCryptoAsset(input?.asset ?? null);
  const fromText = parseBtcFiveMinuteWindow(input?.title ?? input?.question ?? "", {
    referenceTs: input?.referenceTs,
  });
  const fromSlug = parseCryptoFiveMinuteWindowFromSlug(input?.slug ?? "", asset);

  if (fromText) {
    return {
      ...fromText,
      asset: asset ?? fromSlug?.asset ?? null,
    };
  }

  return fromSlug;
}

export function titleLooksLikeCryptoUpDown(text, asset) {
  const family = getCryptoFiveMinuteMarketFamily(asset);

  return typeof text === "string" && Boolean(family?.titlePattern.test(text));
}

export function titleLooksLikeBtcUpDown(text) {
  return titleLooksLikeCryptoUpDown(text, CRYPTO_ASSETS.BTC);
}

export function isChainlinkCryptoResolutionSource(source, asset) {
  const family = getCryptoFiveMinuteMarketFamily(asset);

  return (
    typeof source === "string" &&
    Boolean(family?.resolutionSourcePattern.test(source))
  );
}

export function isChainlinkBtcResolutionSource(source) {
  return isChainlinkCryptoResolutionSource(source, CRYPTO_ASSETS.BTC);
}

export function matchesCryptoFiveMinuteFamily({ asset = null, event, market }) {
  const slug = market?.slug ?? event?.slug ?? "";
  const title = market?.question ?? event?.title ?? "";
  const resolutionSource =
    market?.resolutionSource ?? event?.resolutionSource ?? "";
  const referenceTs = Date.parse(
    market?.eventStartTime ??
      event?.startTime ??
      market?.endDate ??
      event?.endDate ??
      "",
  );
  const familyCandidates = asset
    ? [getCryptoFiveMinuteMarketFamily(asset)].filter(Boolean)
    : Object.values(CRYPTO_FIVE_MINUTE_MARKET_FAMILIES);

  for (const family of familyCandidates) {
    const parsedWindow = deriveCryptoFiveMinuteWindow({
      asset: family.asset,
      slug,
      title,
      referenceTs,
    });
    const escapedPrefix = family.slugPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const slugMatch = new RegExp(`^${escapedPrefix}`, "i").test(slug);
    const titleMatch =
      titleLooksLikeCryptoUpDown(title, family.asset) && Boolean(parsedWindow);
    const resolutionMatch =
      isChainlinkCryptoResolutionSource(resolutionSource, family.asset) &&
      Boolean(parsedWindow);

    if (!slugMatch && !titleMatch && !resolutionMatch) {
      continue;
    }

    return {
      asset: family.asset,
      matches: true,
      parsedWindow,
      matchReason: slugMatch
        ? "slug"
        : titleMatch
          ? "title"
          : "resolution_source",
    };
  }

  return {
    asset: null,
    matches: false,
    parsedWindow: null,
    matchReason: null,
  };
}

export function matchesBtcFiveMinuteFamily({ event, market }) {
  return matchesCryptoFiveMinuteFamily({
    asset: CRYPTO_ASSETS.BTC,
    event,
    market,
  });
}
