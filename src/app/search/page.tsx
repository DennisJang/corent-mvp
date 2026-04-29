import { Suspense } from "react";
import { PageShell } from "@/components/PageShell";
import { SearchResults } from "@/components/SearchResults";

// Pages that read URL search params must opt into client-side hydration of
// those params via Suspense — see Next.js dynamic-rendering docs.
export default function SearchPage() {
  return (
    <PageShell>
      <Suspense fallback={<SearchSkeleton />}>
        <SearchResults />
      </Suspense>
    </PageShell>
  );
}

function SearchSkeleton() {
  return (
    <section className="border-b border-black">
      <div className="container-main py-16 md:py-24">
        <span className="text-caption text-[color:var(--ink-60)]">Loading…</span>
      </div>
    </section>
  );
}
