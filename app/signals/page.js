import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import LiveSignalsDashboard from "@/components/LiveSignalsDashboard";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export const metadata = {
  title: "BTCGT | Signals",
  description:
    "Live BTC-anchor checklist for Polymarket BTC Up/Down 5-minute markets.",
};

export default function SignalsPage() {
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/signals" />

      {convexConfigured ? (
        <LiveSignalsDashboard />
      ) : (
        <ConvexSetupNotice
          title="Signals unavailable until Convex is configured."
          message="Set NEXT_PUBLIC_CONVEX_URL in Vercel to enable Convex-backed live signal queries."
        />
      )}
    </main>
  );
}
