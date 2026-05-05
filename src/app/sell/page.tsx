// /sell — closed-alpha seller entrypoint. Renders the chat intake
// card, which probes server backend mode and dispatches to either
// the local persistence path (mock) or the Supabase server actions
// (createIntakeListingDraftAction). The legacy SellerRegistration
// form stays in the codebase but is no longer wired here.

import { ChatToListingIntakeCard } from "@/components/ChatToListingIntakeCard";
import { PageShell } from "@/components/PageShell";

export const dynamic = "force-dynamic";

export default function SellPage() {
  return (
    <PageShell>
      <div className="container-main py-16 md:py-24">
        <ChatToListingIntakeCard />
      </div>
    </PageShell>
  );
}
