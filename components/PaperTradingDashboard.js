"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { api } from "@/convex/_generated/api";

const STRATEGIES = [
  {
    label: "Flat",
    stakeLabel: "$5 fixed",
    title: "Leader distance v0 flat",
    value: "leader_distance_v0",
  },
  {
    label: "Dynamic",
    stakeLabel: "$1/$3/$5",
    title: "Leader distance v0 dynamic",
    value: "leader_distance_v0_dynamic_sizing",
  },
];
const panel =
  "rounded-[1.2rem] border border-black/10 bg-white/88 p-5 shadow-[0_10px_30px_rgba(30,30,30,0.05)]";
const th = "py-2 pr-4 text-xs uppercase tracking-[0.14em] text-stone-500";
const td = "py-2 pr-4 text-sm text-stone-700";

function n(value) {
  return Number.isFinite(value) ? value.toLocaleString() : "n/a";
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "n/a";
}

function bps(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} bps` : "n/a";
}

function usd(value) {
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "n/a";
}

function price(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function signedUsd(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return `${value > 0 ? "+" : ""}${usd(value)}`;
}

function entryDollarDistance(trade) {
  if (!Number.isFinite(trade?.btcAtEntry) || !Number.isFinite(trade?.priceToBeat)) {
    return null;
  }

  return trade.btcAtEntry - trade.priceToBeat;
}

function elapsedClock(seconds) {
  if (!Number.isFinite(seconds)) {
    return "n/a";
  }

  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function dateTime(ts) {
  if (!Number.isFinite(ts)) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ts));
}

function sideClass(side) {
  return side === "up"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-rose-200 bg-rose-50 text-rose-800";
}

function resultClass(value) {
  if (value === true) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (value === false) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-stone-200 bg-stone-100 text-stone-700";
}

function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_value, index) => (
        <div key={index} className={panel}>
          <div className="h-3 w-28 animate-pulse rounded-full bg-stone-200" />
          <div className="mt-4 h-8 animate-pulse rounded bg-stone-100" />
          <div className="mt-3 h-20 animate-pulse rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

function Panel({ children, label, title }) {
  return (
    <section className={panel}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-stone-950">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, subvalue }) {
  return (
    <div className="rounded-[0.85rem] border border-black/10 bg-stone-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
      {subvalue ? (
        <p className="mt-1 text-xs font-medium text-stone-500">{subvalue}</p>
      ) : null}
    </div>
  );
}

function StrategyTabs({ selected, strategies, onSelect }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-[0.85rem] border border-black/10 bg-white/80 p-1">
      {strategies.map((strategy) => {
        const active = strategy.value === selected.value;

        return (
          <button
            key={strategy.value}
            type="button"
            onClick={() => onSelect(strategy)}
            className={`min-h-10 rounded-[0.65rem] px-4 py-2 text-left text-sm font-semibold transition-colors ${
              active
                ? "bg-stone-950 text-white shadow-sm"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
            }`}
          >
            <span className="block">{strategy.label}</span>
            <span
              className={`block text-xs font-medium ${
                active ? "text-stone-300" : "text-stone-500"
              }`}
            >
              {strategy.stakeLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Summary({ stats, strategy }) {
  const overall = stats?.overall ?? {};

  return (
    <Panel label="Paper state" title={strategy.title}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Trades"
          value={n(stats?.counts?.total)}
          subvalue={`${n(stats?.counts?.open)} open / ${n(stats?.counts?.settled)} settled`}
        />
        <MetricCard label="Win rate" value={pct(overall.winRate)} />
        <MetricCard
          label="Avg entry"
          value={bps(overall.avgEntryDistanceBps)}
          subvalue={`price ${price(overall.avgEntryPrice)}`}
        />
        <MetricCard
          label="PnL"
          value={usd(overall.pnlUsd)}
          subvalue={`${usd(overall.stakeTotal)} risked / ROI ${pct(overall.roi)}`}
        />
      </div>
    </Panel>
  );
}

function CohortTable({ rows, title }) {
  return (
    <Panel label="Breakdown" title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left">
          <thead>
            <tr>
              <th className={th}>Cohort</th>
              <th className={`${th} text-right`}>Trades</th>
              <th className={`${th} text-right`}>Win rate</th>
              <th className={`${th} text-right`}>Avg stake</th>
              <th className={`${th} text-right`}>Avg entry</th>
              <th className={`${th} text-right`}>PnL</th>
              <th className={`${th} text-right`}>ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(rows ?? []).map((row) => (
              <tr key={row.key ?? row.label}>
                <td className={`${td} font-medium text-stone-950`}>
                  {row.label}
                </td>
                <td className={`${td} text-right`}>{n(row.total)}</td>
                <td className={`${td} text-right`}>{pct(row.winRate)}</td>
                <td className={`${td} text-right`}>{usd(row.avgStakeUsd)}</td>
                <td className={`${td} text-right`}>
                  {bps(row.avgEntryDistanceBps)}
                </td>
                <td className={`${td} text-right`}>{usd(row.pnlUsd)}</td>
                <td className={`${td} text-right`}>{pct(row.roi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RiskFlags({ flags }) {
  const active = Object.entries(flags ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  if (active.length === 0) {
    return <span className="text-stone-400">none</span>;
  }

  return active.join(", ");
}

function MarketLink({ slug }) {
  return (
    <Link
      href={`/markets/${slug}`}
      className="text-stone-950 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-sky-700 hover:decoration-sky-300"
    >
      {slug}
    </Link>
  );
}

function TradeTable({ rows, settled = false, title }) {
  return (
    <Panel label={settled ? "Settled" : "Open"} title={title}>
      {(rows ?? []).length === 0 ? (
        <div className="rounded-[0.85rem] border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
          No rows.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr>
                <th className={th}>Market</th>
                <th className={th}>Side</th>
                <th className={`${th} text-right`}>Entry</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`}>Stake</th>
                <th className={`${th} text-right`}>Distance</th>
                <th className={`${th} text-right`}>Required</th>
                <th className={`${th} text-right`}>Risk</th>
                <th className={th}>Flags</th>
                {settled ? <th className={th}>Result</th> : null}
                {settled ? <th className={`${th} text-right`}>PnL</th> : null}
                <th className={`${th} text-right`}>UTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((trade) => (
                <tr key={trade._id}>
                  <td className={`${td} font-medium text-stone-950`}>
                    <MarketLink slug={trade.marketSlug} />
                  </td>
                  <td className={td}>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${sideClass(trade.side)}`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    {elapsedClock(trade.entrySecond)}
                  </td>
                  <td className={`${td} text-right`}>
                    {price(trade.entryMarketPrice)}
                  </td>
                  <td className={`${td} text-right`}>{usd(trade.stakeUsd)}</td>
                  <td className={`${td} text-right`}>
                    <span className="block">{bps(trade.absDistanceBps)}</span>
                    <span className="block text-xs text-stone-500">
                      {signedUsd(entryDollarDistance(trade))}
                    </span>
                  </td>
                  <td className={`${td} text-right`}>
                    {bps(trade.requiredDistanceBps)}
                  </td>
                  <td className={`${td} text-right`}>{n(trade.riskCount)}</td>
                  <td className={td}>
                    <RiskFlags flags={trade.riskFlags} />
                  </td>
                  {settled ? (
                    <td className={td}>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${resultClass(trade.correct)}`}
                      >
                        {trade.actualWinner ?? "pending"}
                      </span>
                    </td>
                  ) : null}
                  {settled ? (
                    <td className={`${td} text-right`}>{usd(trade.pnlUsd)}</td>
                  ) : null}
                  <td className={`${td} text-right`}>
                    {dateTime(trade.entryTs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function PaperTradingDashboard() {
  const [selectedStrategy, setSelectedStrategy] = useState(STRATEGIES[1]);
  const stats = useQuery(api.paperTrades.getStats, {
    strategyVersion: selectedStrategy.value,
  });
  const openTrades = useQuery(api.paperTrades.listOpen, {
    limit: 25,
    strategyVersion: selectedStrategy.value,
  });
  const settledTrades = useQuery(api.paperTrades.listSettled, {
    limit: 25,
    strategyVersion: selectedStrategy.value,
  });

  if (!stats || openTrades === undefined || settledTrades === undefined) {
    return <Loading />;
  }

  return (
    <div className="space-y-5">
      <StrategyTabs
        selected={selectedStrategy}
        strategies={STRATEGIES}
        onSelect={setSelectedStrategy}
      />
      <Summary stats={stats} strategy={selectedStrategy} />
      <div className="grid gap-5 xl:grid-cols-2">
        <CohortTable rows={stats.byEntryWindow} title="Entry windows" />
        <CohortTable rows={stats.byRiskCount} title="Risk count" />
      </div>
      <TradeTable rows={openTrades} title="Open paper trades" />
      <TradeTable rows={settledTrades} settled title="Recent settled trades" />
    </div>
  );
}
