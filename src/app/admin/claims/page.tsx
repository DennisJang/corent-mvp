// Founder admin / Claim review queue (skeleton).
//
// Auth boundary: identical to `/admin/dashboard`. The page 404s for
// missing or non-allowlisted sessions; the only authorization signal
// is the server-side allowlist (Supabase user_metadata is ignored).
//
// Data: the queue itself is read from local persistence (localStorage)
// via `AdminClaimsConsole`, the embedded client island. The Phase 1.5
// claim window / claim review skeleton is local-only — there is no
// server DB for it. Decisions stored here do NOT trigger any payment,
// deposit, refund, settlement, or external notification.

import { notFound } from "next/navigation";
import { AdminClaimsConsole } from "@/components/AdminClaimsConsole";
import { CLAIM_REVIEW_COPY } from "@/lib/copy/returnTrust";
import { requireFounderSession } from "@/server/admin/auth";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export default async function FounderAdminClaimsPage() {
  const session = await requireFounderSession();
  if (!session) notFound();

  return (
    <main className="container-main py-16">
      <header className="border-b border-black pb-4 mb-12 flex items-baseline justify-between">
        <span className="text-caption">Admin / Claims</span>
        <span className="text-caption text-[color:var(--ink-60)]">
          {session.email}
        </span>
      </header>

      <section className="flex flex-col gap-4 mb-8">
        <h1 className="text-h2">{CLAIM_REVIEW_COPY.pageTitle}</h1>
        <p className="text-body text-[color:var(--ink-80)] max-w-[640px]">
          {CLAIM_REVIEW_COPY.pageHint}
        </p>
      </section>

      <AdminClaimsConsole adminId={session.email} />
    </main>
  );
}
