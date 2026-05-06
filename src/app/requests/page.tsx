// Borrower "my requests" page (Bundle 3, Slice 2).
//
// Shows the current user's own outgoing rental requests. The page is
// a thin server-component wrapper; the data load is owned by the
// `<MyRequestsClient>` component, which calls the server action via
// the `loadMyRequests` client adapter (so the import-boundary check
// is preserved — no `@/server/**` import here or in the component).
//
// Closed-alpha posture:
//   - The list is borrower-scoped server-side. The server action
//     resolves the borrower id from the auth-bound session; a
//     forged client payload cannot widen the scope.
//   - No borrower-cancel action in this slice. Rows are read-only.
//   - The page surfaces the still-deferred lifecycle steps in copy
//     so a tester is never misled into thinking payment / pickup /
//     return / settlement are wired up.

import type { Metadata } from "next";
import { MyRequestsClient } from "@/components/MyRequestsClient";
import { PageShell } from "@/components/PageShell";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 요청 — CoRent",
  robots: { index: false, follow: false },
};

export default function MyRequestsPage() {
  return (
    <PageShell width="main">
      <MyRequestsClient />
    </PageShell>
  );
}
