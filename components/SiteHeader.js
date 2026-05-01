import Link from "next/link";

function NavLink({ href, current, children }) {
  const active = current === href;

  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-stone-950 text-stone-50"
          : "text-stone-700 hover:bg-white/75 hover:text-stone-950"
      }`}
    >
      {children}
    </Link>
  );
}

export default function SiteHeader({ current = "/" }) {
  return (
    <header className="flex flex-col gap-5 rounded-[1.8rem] border border-black/10 bg-white/65 px-6 py-5 shadow-[0_16px_50px_rgba(20,20,20,0.06)] backdrop-blur sm:px-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            BTCGT
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">
            Polymarket BTC Up/Down 5m tracker
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 rounded-full border border-black/10 bg-stone-100/80 p-1">
          <NavLink href="/" current={current}>
            Dashboard
          </NavLink>
          <NavLink href="/markets" current={current}>
            Markets
          </NavLink>
          <NavLink href="/analytics" current={current}>
            Analytics
          </NavLink>
          <NavLink href="/paper" current={current}>
            Paper
          </NavLink>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
        <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
          Gamma discovery live
        </span>
        <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
          Convex catalog
        </span>
        <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
          Step 10 WS rollout
        </span>
        <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
          BTC analytics v1
        </span>
        <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
          Paper v0
        </span>
      </div>
    </header>
  );
}
