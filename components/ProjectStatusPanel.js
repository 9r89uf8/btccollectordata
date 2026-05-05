"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatEtDateTime } from "@/components/marketFormat";

function Pill({ tone, children }) {
  const classes = {
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    muted: "border-stone-200 bg-stone-100 text-stone-700",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function formatUsd(price) {
  if (!Number.isFinite(price)) {
    return "pending";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(price);
}

function formatAge(ms) {
  if (!Number.isFinite(ms)) {
    return "pending";
  }

  if (ms < 1000) {
    return "just now";
  }

  return `${Math.round(ms / 1000)}s ago`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) {
    return "pending";
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function formatShellCount(value) {
  if (!Number.isFinite(value)) {
    return "available";
  }

  return String(value);
}

export default function ProjectStatusPanel() {
  const shell = useQuery(api.status.getProjectShell);
  const latestBtc = useQuery(api.btc.getLatestChainlinkBtc);
  const latestEth = useQuery(api.btc.getLatestChainlinkEth);
  const collectorHealth = useQuery(api.health.getCollectorHealth, {});

  if (shell === undefined) {
    return (
      <section className="rounded-[1.5rem] border border-black/10 bg-white/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Convex bootstrap query
        </p>
        <div className="mt-4 space-y-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-stone-200" />
          <div className="h-20 animate-pulse rounded-[1.25rem] bg-stone-100" />
          <div className="h-20 animate-pulse rounded-[1.25rem] bg-stone-100" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[1.5rem] border border-black/10 bg-white/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">
          Convex bootstrap query
        </p>
        <Pill tone="good">{shell.phase}</Pill>
      </div>

      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-stone-950">
        {shell.projectName}
      </h2>
      <p className="mt-3 text-sm leading-7 text-stone-700">{shell.summary}</p>

      <div className="mt-6 grid gap-3">
        {shell.services.map((service) => (
          <article
            key={service.name}
            className="rounded-[1.2rem] border border-black/10 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold capitalize text-stone-950">
                {service.name}
              </h3>
              <Pill tone={service.state === "ready" ? "good" : "pending"}>
                {service.state}
              </Pill>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              {service.note}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm text-stone-700">
        <span className="rounded-full border border-black/10 bg-white px-4 py-2">
          Catalog markets: <strong>{formatShellCount(shell.catalog.totalMarkets)}</strong>
        </span>
        <span className="rounded-full border border-black/10 bg-white px-4 py-2">
          Active markets: <strong>{formatShellCount(shell.catalog.activeMarkets)}</strong>
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <article className="rounded-[1.2rem] border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-stone-950">Latest Chainlink BTC</h3>
            <Pill tone={latestBtc?.stale ? "pending" : "good"}>
              {latestBtc ? (latestBtc.stale ? "stale" : "live") : "pending"}
            </Pill>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-stone-950">
            {latestBtc ? formatUsd(latestBtc.price) : "Waiting for RTDS ticks"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {latestBtc
              ? `${latestBtc.symbol} captured ${formatAge(latestBtc.ageMs)} at ${formatEtDateTime(latestBtc.ts)}`
              : "No Chainlink BTC ticks have been written yet."}
          </p>
        </article>

        <article className="rounded-[1.2rem] border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-stone-950">Latest Chainlink ETH</h3>
            <Pill tone={latestEth?.stale ? "pending" : "good"}>
              {latestEth ? (latestEth.stale ? "stale" : "live") : "pending"}
            </Pill>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-stone-950">
            {latestEth ? formatUsd(latestEth.price) : "Waiting for RTDS ticks"}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-700">
            {latestEth
              ? `${latestEth.symbol} captured ${formatAge(latestEth.ageMs)} at ${formatEtDateTime(latestEth.ts)}`
              : "No Chainlink ETH ticks have been written yet."}
          </p>
        </article>

        <article className="rounded-[1.2rem] border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-stone-950">Collector health</h3>
            <Pill
              tone={
                collectorHealth?.status === "ok"
                  ? "good"
                  : collectorHealth?.status === "down"
                    ? "danger"
                    : "pending"
              }
            >
              {collectorHealth?.status ?? "pending"}
            </Pill>
          </div>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            {collectorHealth
              ? `${collectorHealth.collectorName} heartbeated ${formatAge(Date.now() - collectorHealth.lastHeartbeatAt)} and last sent a batch at ${formatEtDateTime(collectorHealth.lastBatchSentAt)}.`
              : "No collector heartbeat has been recorded yet."}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {collectorHealth?.lastError
              ? `Last error: ${collectorHealth.lastError}`
              : collectorHealth
                ? `Last BTC tick: ${collectorHealth.lastBtcTickAt ? formatEtDateTime(collectorHealth.lastBtcTickAt) : "pending"}`
                : "Start the collector to populate health rows."}
          </p>
          {collectorHealth ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">
              <span className="rounded-full border border-black/10 bg-stone-100 px-3 py-1">
                raw events {collectorHealth.rawEventPersistenceEnabled ? "on" : "off"}
              </span>
              <span className="rounded-full border border-black/10 bg-stone-100 px-3 py-1">
                capture {collectorHealth.snapshotCaptureMode ?? "unknown"}
              </span>
              <span className="rounded-full border border-black/10 bg-stone-100 px-3 py-1">
                ws {collectorHealth.lastWsEventAt ? "shadow live" : "pending"}
              </span>
              <span className="rounded-full border border-black/10 bg-stone-100 px-3 py-1">
                ws reconnects {collectorHealth.marketWsReconnectCount24h ?? 0}
              </span>
              <span className="rounded-full border border-black/10 bg-stone-100 px-3 py-1">
                parity mismatches {collectorHealth.parityMismatchCount24h ?? 0}
              </span>
            </div>
          ) : null}
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {collectorHealth
              ? `Last batch wrote ${collectorHealth.lastBatchRawEvents ?? 0} raw events, ${collectorHealth.lastBatchSnapshots ?? 0} snapshots, and ${collectorHealth.lastBatchBtcTicks ?? 0} crypto ticks.`
              : "Batch write counts appear after the collector sends data."}
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {collectorHealth?.lastPollStatus
              ? `Last poll was ${collectorHealth.lastPollStatus} and completed ${collectorHealth.lastPollCompletedAt ? formatAge(Date.now() - collectorHealth.lastPollCompletedAt) : "pending"} in ${formatDuration(collectorHealth.lastPollDurationMs)}.`
              : "Poll diagnostics appear after the collector completes at least one market snapshot poll."}
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {collectorHealth
              ? `Poll overruns ${collectorHealth.pollOverrunCount24h ?? 0}, poll failures ${collectorHealth.pollFailureCount24h ?? 0}, partial polls ${collectorHealth.partialPollCount24h ?? 0}.`
              : "Start the collector to populate poll diagnostics."}
          </p>
          {collectorHealth?.lastPollEndpointErrors?.length ? (
            <div className="mt-3 rounded-[1rem] border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              <p className="font-semibold uppercase tracking-[0.16em]">
                Recent poll errors
              </p>
              <ul className="mt-2 space-y-1">
                {collectorHealth.lastPollEndpointErrors.map((error, index) => (
                  <li key={`${index}-${error}`}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {collectorHealth?.lastWsSnapshotAt
              ? `Last WS shadow snapshot: ${formatEtDateTime(collectorHealth.lastWsSnapshotAt)}`
              : collectorHealth?.lastWsEventAt
                ? `Last WS raw event: ${formatEtDateTime(collectorHealth.lastWsEventAt)}`
                : "WebSocket shadow capture has not reported activity yet."}
          </p>
        </article>
      </div>

      <div className="mt-6 rounded-[1.25rem] bg-stone-950 p-4 text-stone-100">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-300">
          Bootstrap checklist
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {shell.checklist.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span>{item.label}</span>
              <span className="font-semibold text-stone-300">
                {item.done ? "done" : "next"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
