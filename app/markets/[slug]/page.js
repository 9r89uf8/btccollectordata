import MarketDetailScaffold from "@/components/MarketDetailScaffold";
import SiteHeader from "@/components/SiteHeader";

export default async function MarketPage({ params }) {
  const { slug } = await params;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 sm:px-10 lg:py-14">
      <SiteHeader current="/" />
      <MarketDetailScaffold slug={slug} />
    </main>
  );
}
