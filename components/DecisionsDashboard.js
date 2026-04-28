"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

const panel =
  "rounded-[1.2rem] border border-black/10 bg-white/88 p-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]";
const th = "py-2 pr-4 text-xs uppercase tracking-[0.14em] text-stone-500";
const td = "py-2 pr-4 text-sm text-stone-700";
const ENTER_ACTIONS = new Set(["ENTER_UP", "ENTER_DOWN"]);

function n(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function pp(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

function bps(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} bps` : "n/a";
}

function dateTime(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return new Date(value).toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
  });
}

function shortMarketSlug(slug) {
  if (!slug) {
    return "n/a";
  }

  return slug.replace("btc-updown-5m-", "");
}

function actionTone(action, actionPreMute) {
  if (ENTER_ACTIONS.has(action)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (ENTER_ACTIONS.has(actionPreMute)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (action === "WAIT") {
    return "border-stone-200 bg-stone-100 text-stone-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function ActionBadge({ action, actionPreMute }) {
  const muted = ENTER_ACTIONS.has(actionPreMute);

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${actionTone(
        action,
        actionPreMute,
      )}`}
      title={muted ? `Muted from ${actionPreMute}` : action}
    >
      <span className="truncate">{muted ? `${actionPreMute} muted` : action}</span>
    </span>
  );
}

function reasonLabel(code) {
  return String(code ?? "unknown").replaceAll("_", " ");
}

function ReasonChips({ codes }) {
  const visibleCodes = (codes ?? []).slice(0, 3);
  const remaining = Math.max(0, (codes ?? []).length - visibleCodes.length);

  if (visibleCodes.length === 0) {
    return <span className="text-stone-400">n/a</span>;
  }

  return (
    <div className="flex max-w-[28rem] flex-wrap gap-1.5">
      {visibleCodes.map((code) => (
        <span
          key={code}
          className="rounded-full border border-black/10 bg-stone-50 px-2 py-1 text-xs font-medium text-stone-700"
          title={code}
        >
          {reasonLabel(code)}
        </span>
      ))}
      {remaining > 0 ? (
        <span className="rounded-full border border-black/10 bg-white px-2 py-1 text-xs font-medium text-stone-500">
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

function Header({ eyebrow, title, right }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-stone-950">{title}</h2>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function SampleBadge({ sample }) {
  if (!sample) {
    return null;
  }

  const range =
    Number.isFinite(sample.oldestEvaluatedAt) &&
    Number.isFinite(sample.newestEvaluatedAt)
      ? `${dateTime(sample.oldestEvaluatedAt)} - ${dateTime(sample.newestEvaluatedAt)}`
      : "No evaluated rows";

  return (
    <div
      className="rounded-lg border border-black/10 bg-stone-50 px-3 py-2 text-right text-xs text-stone-600"
      title={range}
    >
      <div className="font-semibold uppercase tracking-[0.14em] text-stone-500">
        Sample
      </div>
      <div className="mt-0.5 font-mono text-stone-800">
        {n(sample.rowCount)} / {n(sample.limit)} rows
      </div>
    </div>
  );
}

function LoadingPanel({ title }) {
  return (
    <section className={panel}>
      <Header eyebrow="Loading" title={title} />
      <div className="mt-5 h-28 animate-pulse rounded-lg bg-stone-100" />
    </section>
  );
}

function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td className="py-6 text-sm text-stone-500" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}

function DecisionTable({ rows, compact = false }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="border-b border-black/10">
            <th className={th}>Time</th>
            <th className={th}>Market</th>
            <th className={th}>T+</th>
            <th className={th}>Action</th>
            <th className={th}>Reasons</th>
            <th className={th}>p_est</th>
            <th className={th}>Ask</th>
            <th className={th}>Edge</th>
            {!compact ? <th className={th}>Distance</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {rows.length === 0 ? (
            <EmptyRow colSpan={compact ? 8 : 9}>No rows found.</EmptyRow>
          ) : (
            rows.map((row) => (
              <tr key={row._id ?? `${row.marketSlug}:${row.checkpointSecond}:${row.secondBucket}`}>
                <td className={td}>{dateTime(row.evaluatedAt)}</td>
                <td className={`${td} font-mono text-xs`}>
                  {shortMarketSlug(row.marketSlug)}
                </td>
                <td className={td}>{n(row.checkpointSecond)}s</td>
                <td className={td}>
                  <ActionBadge
                    action={row.action}
                    actionPreMute={row.actionPreMute}
                  />
                </td>
                <td className={td}>
                  <ReasonChips codes={row.reasonCodes} />
                </td>
                <td className={td}>{pct(row.pEst)}</td>
                <td className={td}>{pct(row.leaderAsk)}</td>
                <td className={td}>{pp(row.edge)}</td>
                {!compact ? <td className={td}>{bps(row.absDistanceBps)}</td> : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryStrip({ recent, stats, enters }) {
  const waitCount =
    stats?.actionCounts?.find((entry) => entry.action === "WAIT")?.count ?? 0;
  const emittedEnterCount = stats?.enterCount ?? 0;
  const mutedEnterCount = stats?.mutedEnterCount ?? 0;
  const latest = recent?.[0]?.evaluatedAt;

  const cells = [
    ["Rows", n(stats?.totalRows ?? recent?.length ?? 0)],
    ["WAIT", n(waitCount)],
    ["ENTER", n(emittedEnterCount)],
    ["Muted ENTER", n(mutedEnterCount || enters?.filter((row) => ENTER_ACTIONS.has(row.actionPreMute)).length || 0)],
    ["Latest", dateTime(latest)],
  ];

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cells.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-black/10 bg-stone-50 px-4 py-3"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
            {label}
          </p>
          <p className="mt-1 truncate text-lg font-semibold text-stone-950">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ReasonHistogram({ stats }) {
  const rows = stats?.reasonCounts ?? [];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className={panel}>
      <Header
        eyebrow="Distribution"
        right={<SampleBadge sample={stats?.sample} />}
        title="Reason-code histogram"
      />
      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-stone-500">No reason codes found.</p>
        ) : (
          rows.slice(0, 18).map((row) => (
            <div key={row.code}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-stone-800" title={row.code}>
                  {reasonLabel(row.code)}
                </span>
                <span className="font-mono text-xs text-stone-500">
                  {n(row.count)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-sky-700"
                  style={{ width: `${Math.max(3, (row.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DataQualityBlockers({ stats }) {
  const rows = stats?.dataQualityBlockers ?? [];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <section className={panel}>
      <Header
        eyebrow="Blockers"
        right={<SampleBadge sample={stats?.sample} />}
        title="Data-quality waits"
      />
      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-stone-500">No data-quality blockers found.</p>
        ) : (
          rows.map((row) => (
            <div key={row.code}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium text-stone-800" title={row.code}>
                  {reasonLabel(row.code)}
                </span>
                <span className="font-mono text-xs text-stone-500">
                  {n(row.count)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-amber-600"
                  style={{ width: `${Math.max(3, (row.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ActiveMarketState({ activeMarkets, recent }) {
  const latestByMarketSlug = useMemo(() => {
    const map = new Map();

    for (const row of recent ?? []) {
      if (!map.has(row.marketSlug)) {
        map.set(row.marketSlug, row);
      }
    }

    return map;
  }, [recent]);

  const rows = (activeMarkets ?? []).slice(0, 12).map((market) => ({
    decision: latestByMarketSlug.get(market.slug),
    market,
  }));

  return (
    <section className={panel}>
      <Header eyebrow="Live" title="Active market decision state" />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-black/10">
              <th className={th}>Market</th>
              <th className={th}>Window</th>
              <th className={th}>Latest T+</th>
              <th className={th}>Action</th>
              <th className={th}>Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.length === 0 ? (
              <EmptyRow colSpan={5}>No active BTC 5m markets found.</EmptyRow>
            ) : (
              rows.map(({ market, decision }) => (
                <tr key={market.slug}>
                  <td className={`${td} font-mono text-xs`}>
                    {shortMarketSlug(market.slug)}
                  </td>
                  <td className={td}>
                    {dateTime(market.windowStartTs)} - {dateTime(market.windowEndTs)}
                  </td>
                  <td className={td}>
                    {decision ? `${n(decision.checkpointSecond)}s` : "n/a"}
                  </td>
                  <td className={td}>
                    {decision ? (
                      <ActionBadge
                        action={decision.action}
                        actionPreMute={decision.actionPreMute}
                      />
                    ) : (
                      <span className="text-stone-400">No row</span>
                    )}
                  </td>
                  <td className={td}>
                    <ReasonChips codes={decision?.reasonCodes} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CalibrationPanel({ calibration }) {
  const rows = calibration?.buckets ?? [];

  return (
    <section className={panel}>
      <Header
        eyebrow="Calibration"
        right={<SampleBadge sample={calibration?.sample} />}
        title="p_est buckets"
      />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-black/10">
              <th className={th}>Bucket</th>
              <th className={th}>Candidates</th>
              <th className={th}>Resolved</th>
              <th className={th}>Win rate</th>
              <th className={th}>Avg p_est</th>
              <th className={th}>Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className={td}>{row.label}</td>
                <td className={td}>{n(row.candidates)}</td>
                <td className={td}>{n(row.resolved)}</td>
                <td className={td}>{pct(row.winRate)}</td>
                <td className={td}>{pct(row.avgPEst)}</td>
                <td className={td}>{n(row.pending)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DecisionsDashboard() {
  const recent = useQuery(api.decisionSignals.listRecent, { limit: 150 });
  const enterRows = useQuery(api.decisionSignals.listRecentEnters, { limit: 75 });
  const stats = useQuery(api.decisionSignals.getReasonCodeStats, { limit: 25000 });
  const calibration = useQuery(api.decisionSignals.getEnterCalibration, {
    limit: 25000,
  });
  const activeMarkets = useQuery(api.markets.listActiveBtc5m, {});

  if (
    recent === undefined ||
    enterRows === undefined ||
    stats === undefined ||
    calibration === undefined ||
    activeMarkets === undefined
  ) {
    return <LoadingPanel title="Decision signals" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={panel}>
        <Header eyebrow="Shadow engine" title="Recent decisions" />
        <SummaryStrip recent={recent} stats={stats} enters={enterRows} />
        <DecisionTable rows={recent} />
      </section>

      <section className={panel}>
        <Header eyebrow="Candidates" title="Recent ENTER candidates" />
        <DecisionTable rows={enterRows} compact />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReasonHistogram stats={stats} />
        <DataQualityBlockers stats={stats} />
      </div>

      <ActiveMarketState activeMarkets={activeMarkets} recent={recent} />
      <CalibrationPanel calibration={calibration} />
    </div>
  );
}
