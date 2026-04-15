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
  /(Bitcoin Up or Down\s*-\s*)?(?<month>[A-Za-z]+)\s+(?<day>\d{1,2})(?:,\s*(?<year>\d{4}))?,\s*(?<start>\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*-\s*(?<end>\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*ET/i;

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

export function parseBtcFiveMinuteWindowFromSlug(slug) {
  if (typeof slug !== "string") {
    return null;
  }

  const match = slug.match(/^btc-updown-5m-(\d{9,})$/i);

  if (!match) {
    return null;
  }

  const windowStartTs = Number(match[1]) * 1000;

  if (!Number.isFinite(windowStartTs)) {
    return null;
  }

  return {
    windowStartTs,
    windowEndTs: windowStartTs + BTC_FIVE_MINUTE_WINDOW_MS,
    timezone: ET_TIME_ZONE,
    source: "slug",
  };
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
  const fromText = parseBtcFiveMinuteWindow(input?.title ?? input?.question ?? "", {
    referenceTs: input?.referenceTs,
  });
  const fromSlug = parseBtcFiveMinuteWindowFromSlug(input?.slug ?? "");

  if (fromText) {
    return fromText;
  }

  return fromSlug;
}

export function titleLooksLikeBtcUpDown(text) {
  return typeof text === "string" && /bitcoin up or down/i.test(text);
}

export function isChainlinkBtcResolutionSource(source) {
  return (
    typeof source === "string" &&
    /data\.chain\.link\/streams\/btc-usd/i.test(source)
  );
}

export function matchesBtcFiveMinuteFamily({ event, market }) {
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
  const parsedWindow = deriveBtcFiveMinuteWindow({
    slug,
    title,
    referenceTs,
  });

  const slugMatch = /^btc-updown-5m-/i.test(slug);
  const titleMatch = titleLooksLikeBtcUpDown(title) && Boolean(parsedWindow);
  const resolutionMatch =
    isChainlinkBtcResolutionSource(resolutionSource) && Boolean(parsedWindow);

  return {
    matches: Boolean(slugMatch || titleMatch || resolutionMatch),
    parsedWindow,
    matchReason: slugMatch
      ? "slug"
      : titleMatch
        ? "title"
        : resolutionMatch
          ? "resolution_source"
          : null,
  };
}
