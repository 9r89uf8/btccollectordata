import {
  formatEtTime,
  formatRelativeSecond,
  formatSnapshotQualityLabel,
  getSnapshotQualityTone,
  getToneClasses,
} from "@/components/marketFormat";

const PHASE_COLORS = {
  live: "rgba(14, 165, 233, 0.09)",
  post: "rgba(120, 113, 108, 0.1)",
  pre: "rgba(245, 158, 11, 0.08)",
};

const QUALITY_COLORS = {
  gap: "#f43f5e",
  good: "#10b981",
  missing: "#111827",
  stale_book: "#f59e0b",
  stale_btc: "#fb7185",
};

function buildTickIndices(length) {
  if (length <= 1) {
    return [0];
  }

  const indices = new Set();
  const steps = Math.min(6, length);

  for (let index = 0; index < steps; index += 1) {
    indices.add(Math.round((index * (length - 1)) / Math.max(steps - 1, 1)));
  }

  return [...indices].sort((a, b) => a - b);
}

function normalizeDomain(domain) {
  const [rawMin, rawMax] = domain;

  if (rawMin === rawMax) {
    const padding = rawMin === 0 ? 1 : Math.abs(rawMin) * 0.05;
    return [rawMin - padding, rawMax + padding];
  }

  return domain;
}

function getBucketDomain(timeline, cadenceMs) {
  if (timeline.length === 0) {
    return [0, cadenceMs];
  }

  const firstBucket = timeline[0].secondBucket;
  const lastBucket = timeline[timeline.length - 1].secondBucket;

  if (firstBucket === lastBucket) {
    return [firstBucket, firstBucket + cadenceMs];
  }

  return [firstBucket, lastBucket];
}

function buildPhaseBands(timeline, cadenceMs, getX, plotHeight, top) {
  if (timeline.length === 0) {
    return [];
  }

  const bands = [];
  let startIndex = 0;

  for (let index = 1; index <= timeline.length; index += 1) {
    const currentPhase = timeline[startIndex]?.phase;
    const nextPhase = timeline[index]?.phase;

    if (index < timeline.length && nextPhase === currentPhase) {
      continue;
    }

    const startBucket = timeline[startIndex].secondBucket;
    const endBucket =
      index === timeline.length
        ? timeline[index - 1].secondBucket + cadenceMs
        : timeline[index].secondBucket;
    const x = getX(startBucket);
    const rightEdge = getX(endBucket);

    bands.push({
      key: `${currentPhase}-${startIndex}`,
      phase: currentPhase,
      width: Math.max(rightEdge - x, 2),
      x,
      y: top,
    });
    startIndex = index;
  }

  return bands.map((band) => ({
    ...band,
    color: PHASE_COLORS[band.phase] ?? PHASE_COLORS.post,
    height: plotHeight,
  }));
}

function buildLinePath(timeline, series, getX, getY) {
  let path = "";
  let drawing = false;

  for (let index = 0; index < timeline.length; index += 1) {
    const item = timeline[index];
    const value = item?.[series.key];

    if (value == null) {
      drawing = false;
      continue;
    }

    const command = drawing ? "L" : "M";
    path += `${command} ${getX(item.secondBucket).toFixed(2)} ${getY(value).toFixed(2)} `;
    drawing = true;
  }

  return path.trim();
}

function getSeriesAxis(series, hasSecondaryAxis) {
  return hasSecondaryAxis && series.axis === "secondary" ? "secondary" : "primary";
}

export default function ReplayLineChart({
  description,
  emptyMessage,
  eyebrow,
  formatAxisValue,
  formatSecondaryAxisValue = null,
  sampleCadenceMs = 1000,
  secondaryYDomain = null,
  secondaryYTicks = [],
  series,
  timeline,
  title,
  yDomain,
  yTicks,
}) {
  if (timeline.length === 0) {
    return (
      <article className="rounded-[1.7rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
          {eyebrow}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
          {title}
        </h3>
        <p className="mt-3 text-sm leading-7 text-stone-700">{emptyMessage}</p>
      </article>
    );
  }

  const width = 920;
  const height = 320;
  const left = 58;
  const right = formatSecondaryAxisValue && secondaryYDomain ? 58 : 18;
  const top = 18;
  const bottom = 70;
  const qualityHeight = 14;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom - qualityHeight;
  const [domainMin, domainMax] = normalizeDomain(yDomain);
  const hasSecondaryAxis = Boolean(formatSecondaryAxisValue && secondaryYDomain);
  const [secondaryDomainMin, secondaryDomainMax] = hasSecondaryAxis
    ? normalizeDomain(secondaryYDomain)
    : [0, 1];
  const [bucketMin, bucketMax] = getBucketDomain(timeline, sampleCadenceMs);
  const tickIndices = buildTickIndices(timeline.length);
  const getX = (bucket) =>
    left +
    ((bucket - bucketMin) / Math.max(bucketMax - bucketMin, sampleCadenceMs || 1)) * plotWidth;
  const getY = (value) =>
    top + ((domainMax - value) / Math.max(domainMax - domainMin, 0.000001)) * plotHeight;
  const getSecondaryY = (value) =>
    top +
    ((secondaryDomainMax - value) /
      Math.max(secondaryDomainMax - secondaryDomainMin, 0.000001)) *
      plotHeight;
  const phaseBands = buildPhaseBands(timeline, sampleCadenceMs, getX, plotHeight, top);
  const qualityBarY = top + plotHeight + 14;

  return (
    <article className="rounded-[1.7rem] border border-black/10 bg-white/85 p-6 shadow-[0_14px_40px_rgba(30,30,30,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">
            {eyebrow}
          </p>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
            {title}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {series.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-[1.3rem] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,244,241,0.96))] p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          {phaseBands.map((band) => (
            <rect
              key={band.key}
              x={band.x}
              y={band.y}
              width={band.width}
              height={band.height}
              fill={band.color}
            />
          ))}

          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={getY(tick)}
                y2={getY(tick)}
                stroke="rgba(87, 83, 78, 0.12)"
                strokeDasharray="4 8"
              />
              <text
                x={left - 12}
                y={getY(tick) + 4}
                fill="#57534e"
                fontSize="11"
                textAnchor="end"
              >
                {formatAxisValue(tick)}
              </text>
            </g>
          ))}

          {hasSecondaryAxis
            ? secondaryYTicks.map((tick) => (
                <g key={`secondary-${tick}`}>
                  <text
                    x={width - right + 12}
                    y={getSecondaryY(tick) + 4}
                    fill="#57534e"
                    fontSize="11"
                    textAnchor="start"
                  >
                    {formatSecondaryAxisValue(tick)}
                  </text>
                </g>
              ))
            : null}

          {series.map((item) => {
            const yAccessor =
              getSeriesAxis(item, hasSecondaryAxis) === "secondary" ? getSecondaryY : getY;
            const path = buildLinePath(timeline, item, getX, yAccessor);

            if (!path) {
              return null;
            }

            return (
              <path
                key={item.key}
                d={path}
                fill="none"
                stroke={item.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={item.dashArray ?? undefined}
                strokeWidth="2.75"
              />
            );
          })}

          {series.flatMap((item) =>
            timeline
              .filter((entry) => entry?.[item.key] != null)
              .map((entry) => (
                <circle
                  key={`${item.key}-${entry._id}`}
                  cx={getX(entry.secondBucket)}
                  cy={
                    getSeriesAxis(item, hasSecondaryAxis) === "secondary"
                      ? getSecondaryY(entry[item.key])
                      : getY(entry[item.key])
                  }
                  fill={item.color}
                  r="3.25"
                  stroke="white"
                  strokeWidth="1.5"
                />
              )),
          )}

          {tickIndices.map((index) => (
            <g key={index}>
              <line
                x1={getX(timeline[index]?.secondBucket ?? bucketMin)}
                x2={getX(timeline[index]?.secondBucket ?? bucketMin)}
                y1={qualityBarY + qualityHeight + 2}
                y2={qualityBarY + qualityHeight + 10}
                stroke="rgba(87, 83, 78, 0.35)"
              />
              <text
                x={getX(timeline[index]?.secondBucket ?? bucketMin)}
                y={qualityBarY + qualityHeight + 24}
                fill="#57534e"
                fontSize="11"
                textAnchor="middle"
              >
                <tspan x={getX(timeline[index]?.secondBucket ?? bucketMin)} dy="0">
                  {formatRelativeSecond(timeline[index]?.secondsFromWindowStart)}
                </tspan>
                <tspan
                  x={getX(timeline[index]?.secondBucket ?? bucketMin)}
                  dy="12"
                  fill="#78716c"
                  fontSize="10"
                >
                  {formatEtTime(timeline[index]?.ts)}
                </tspan>
              </text>
            </g>
          ))}

          {timeline.map((item, index) => (
            <rect
              key={item._id}
              x={getX(item.secondBucket)}
              y={qualityBarY}
              width={Math.max(
                getX(
                  timeline[index + 1]?.secondBucket ?? item.secondBucket + sampleCadenceMs,
                ) - getX(item.secondBucket),
                1.25,
              )}
              height={qualityHeight}
              fill={QUALITY_COLORS[item.sourceQuality] ?? QUALITY_COLORS.missing}
            />
          ))}
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["good", "stale_book", "stale_btc", "gap", "missing"].map((quality) => (
          <span
            key={quality}
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getToneClasses(
              getSnapshotQualityTone(quality),
            )}`}
          >
            {formatSnapshotQualityLabel(quality)}
          </span>
        ))}
      </div>
    </article>
  );
}
