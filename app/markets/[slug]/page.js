import ConvexSetupNotice from "@/components/ConvexSetupNotice";
import MarketDetailScaffold from "@/components/MarketDetailScaffold";
import SiteHeader from "@/components/SiteHeader";
import { getPublicConvexUrl } from "@/lib/convexUrl";

export default async function MarketPage({ params }) {
  const { slug } = await params;
  const convexConfigured = Boolean(getPublicConvexUrl());

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/markets" />
      {convexConfigured ? (
        <MarketDetailScaffold slug={slug} />
      ) : (
        <ConvexSetupNotice
          title="Market detail unavailable until Convex is configured."
          message={`Set NEXT_PUBLIC_CONVEX_URL in Vercel to enable Convex-backed replay data for ${slug}.`}
        />
      )}
    </main>
  );
}
