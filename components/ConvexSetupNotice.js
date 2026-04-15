export default function ConvexSetupNotice({
  title = "Convex setup needed",
  message = "Set NEXT_PUBLIC_CONVEX_URL to a valid https://...convex.cloud URL for this deployment.",
}) {
  return (
    <section className="rounded-[1.5rem] border border-amber-300/70 bg-amber-50/90 p-6 text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">
        Convex setup needed
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
        {title}
      </h2>
      <p className="mt-4 text-sm leading-7 text-stone-700">{message}</p>
      <div className="mt-6 space-y-2 rounded-[1.25rem] bg-white/80 p-4 text-sm text-stone-700">
        <p className="font-semibold text-stone-900">Expected Vercel env</p>
        <p>`NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud`</p>
      </div>
    </section>
  );
}
