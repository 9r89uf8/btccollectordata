const ET_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});
const ET_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});
const ET_TIME_WITH_SECONDS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/New_York",
});
const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatEtDateTime(ts) {
  if (ts == null) {
    return "pending";
  }

  return `${ET_DATE_TIME_FORMATTER.format(new Date(ts))} ET`;
}

export function formatEtRange(startTs, endTs) {
  if (startTs == null || endTs == null) {
    return "window pending";
  }

  return `${formatEtDateTime(startTs)} to ${formatEtDateTime(endTs)}`;
}

export function formatEtTime(ts) {
  if (ts == null) {
    return "pending";
  }

  return `${ET_TIME_FORMATTER.format(new Date(ts))} ET`;
}

export function formatEtTimeWithSeconds(ts) {
  if (ts == null) {
    return "pending";
  }

  return `${ET_TIME_WITH_SECONDS_FORMATTER.format(new Date(ts))} ET`;
}

export function formatProbability(value) {
  if (value == null) {
    return "pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatBtcUsd(value) {
  if (value == null) {
    return "pending";
  }

  return USD_FORMATTER.format(value);
}

export function formatBtcReferenceValue(value, fallbackLabel = "pending") {
  if (value == null) {
    return fallbackLabel;
  }

  return formatBtcUsd(value);
}

export function formatRelativeSecond(value) {
  if (value == null) {
    return "pending";
  }

  if (value === 0) {
    return "T+0s";
  }

  return `T${value > 0 ? "+" : ""}${value}s`;
}

export function formatSnapshotQualityLabel(quality) {
  if (quality == null) {
    return "pending";
  }

  return String(quality).replace(/_/g, " ");
}

export function getMarketState(market) {
  const nowTs = Date.now();

  if (market.resolved) {
    return {
      label: "resolved",
      tone: "emerald",
    };
  }

  if (market.active) {
    if (
      Number.isFinite(market.windowStartTs) &&
      Number.isFinite(market.windowEndTs)
    ) {
      if (nowTs < market.windowStartTs) {
        return {
          label: "upcoming",
          tone: "amber",
        };
      }

      if (nowTs < market.windowEndTs) {
        return {
          label: "live",
          tone: "sky",
        };
      }
    }

    return {
      label: "active",
      tone: "sky",
    };
  }

  if (market.closed) {
    return {
      label: "closed",
      tone: "stone",
    };
  }

  return {
    label: "cataloged",
    tone: "amber",
  };
}

export function getToneClasses(tone) {
  const classes = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    stone: "border-stone-200 bg-stone-100 text-stone-700",
  };

  return classes[tone] ?? classes.stone;
}

export function getSnapshotQualityTone(quality) {
  if (quality === "good") {
    return "emerald";
  }

  if (quality === "gap" || quality === "missing") {
    return "rose";
  }

  if (quality === "stale_book" || quality === "stale_btc") {
    return "amber";
  }

  return "stone";
}

export function truncateTokenId(tokenId) {
  if (typeof tokenId !== "string" || tokenId.length < 14) {
    return tokenId ?? "pending";
  }

  return `${tokenId.slice(0, 6)}...${tokenId.slice(-6)}`;
}
