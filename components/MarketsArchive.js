"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";

import MarketCard from "@/components/MarketCard";
import { api } from "@/convex/_generated/api";

const ARCHIVE_FILTERS = [
  {
    id: "past",
    label: "Past",
    description: "Ended windows that are no longer active in the catalog.",
  },
  {
    id: "resolved",
    label: "Resolved",
    description: "Finalized markets with a winning side recorded.",
  },
  {
    id: "all",
    label: "All saved",
    description: "Everything stored in Convex, including current live windows.",
  },
];

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-stone-950 bg-stone-950 text-stone-50"
          : "border-black/10 bg-white text-stone-700 hover:border-stone-300 hover:text-stone-950"
      }`}
    >
      {children}
    </button>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <article
          key={index}
          className="rounded-[1.35rem] border border-black/10 bg-white p-5 shadow-[0_14px_38px_rgba(30,30,30,0.05)]"
        >
          <div className="h-4 w-32 animate-pulse rounded-full bg-stone-200" />
          <div className="mt-4 h-8 animate-pulse rounded-[0.8rem] bg-stone-100" />
          <div className="mt-5 h-24 animate-pulse rounded-[1rem] bg-stone-100" />
        </article>
      ))}
    </div>
  );
}

export default function MarketsArchive() {
  const [status, setStatus] = useState("past");
  const selectedFilter =
    ARCHIVE_FILTERS.find((option) => option.id === status) ?? ARCHIVE_FILTERS[0];
  const archive = usePaginatedQuery(
    api.markets.listArchiveBtc5m,
    { status },
    { initialNumItems: 24 },
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[1.6rem] border border-black/10 bg-white/85 p-6 shadow-[0_12px_40px_rgba(30,30,30,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
              Archive
            </p>
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-stone-950">
              Browse saved BTC 5-minute markets
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-stone-700">
              {selectedFilter.description}
            </p>
          </div>
          <div className="rounded-full border border-black/10 bg-stone-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700">
            {archive.status === "LoadingFirstPage"
              ? "Loading archive"
              : `${archive.results.length} loaded`}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ARCHIVE_FILTERS.map((option) => (
            <FilterButton
              key={option.id}
              active={option.id === status}
              onClick={() => setStatus(option.id)}
            >
              {option.label}
            </FilterButton>
          ))}
        </div>
      </div>

      {archive.status === "LoadingFirstPage" ? (
        <LoadingGrid />
      ) : archive.results.length === 0 ? (
        <div className="rounded-[1.35rem] border border-dashed border-stone-300 bg-white/70 p-6 text-sm leading-7 text-stone-700">
          No markets match the current archive filter yet.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {archive.results.map((market) => (
            <MarketCard key={market._id} market={market} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-black/10 bg-white/80 p-5 text-sm text-stone-700">
        <p>
          {archive.status === "Exhausted"
            ? "You have reached the end of the saved market archive."
            : "Load more to keep paging through older saved markets."}
        </p>
        <button
          type="button"
          onClick={() => archive.loadMore(24)}
          disabled={archive.status !== "CanLoadMore"}
          className={`rounded-full px-5 py-3 text-sm font-medium transition-colors ${
            archive.status === "CanLoadMore"
              ? "bg-stone-950 text-stone-50 hover:bg-stone-800"
              : "cursor-not-allowed bg-stone-200 text-stone-500"
          }`}
        >
          {archive.status === "LoadingMore"
            ? "Loading more..."
            : archive.status === "Exhausted"
              ? "Archive complete"
              : "Load 24 more"}
        </button>
      </div>
    </section>
  );
}
