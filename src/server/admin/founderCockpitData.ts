// Bundle 2 Slice 4 — server-only data fetcher for the founder
// validation cockpit at `/admin/cockpit`.
//
// What this module does:
//
//   - Calls `requireFounderSession()` first. If the caller is not
//     a Supabase-authenticated session whose email is in
//     `FOUNDER_ADMIN_EMAIL_ALLOWLIST`, the function returns
//     `{ kind: "forbidden" }` and the page renders 404 (the same
//     fail-closed posture the existing `/admin/dashboard` uses).
//
//   - When the backend mode is not `"supabase"` (mock / default),
//     the function returns `{ kind: "inactive" }`. The cockpit
//     page surfaces a calm "supabase backend is not active in
//     this environment" state. localStorage is NEVER read by the
//     cockpit; the founder's validation signals only have meaning
//     against the real `corent-dev` schema.
//
//   - In supabase mode it reads, in parallel:
//       - `listRecentFeedbackSubmissions(limit)` — recent feedback
//         / wishlist submissions (founder needs `contactEmail` for
//         follow-up; this is the only PII slot intentionally
//         exposed on this surface);
//       - `listRecentListings(limit)` — recent listings across
//         every status (so the founder can triage drafts /
//         human_review_pending / approved / rejected);
//       - `listRentalIntents(limit)` — recent rental requests
//         across every status (today only `requested` exists
//         server-side; future slices may add others);
//       - `readMarketplaceAggregates()` — counts by status for the
//         existing dashboard tiles, reused.
//
//   - Every row goes through a tight DTO projection step before
//     leaving this module. The DTOs do NOT carry:
//       - listing.rawSellerInput, privateSerialNumber, or any
//         verification.* internal (safetyCode, aiNotes,
//         humanReviewNotes);
//       - rental.payment.sessionId, payment.failureReason,
//         settlement.* internals, settlement.blockedReason,
//         settlement.settledAt;
//       - admin/trust/claim slots from any source row.
//     The DTO type itself has no slot for those fields, so a future
//     edit cannot accidentally widen the surface.
//
//   - Repo throws are caught per-source and collapse to an empty
//     array for that source. The cockpit renders a calm degraded
//     state for the affected panel; the rest of the cockpit still
//     loads. SQL / env / table / row payload never leaks through
//     the DTO surface.
//
// Hard rules:
//
//   - This module is server-only. It is never imported from
//     `src/components/**` (the page is a server component under
//     `src/app/admin/cockpit/page.tsx` and is allowed to import
//     this module).
//
//   - No write paths. The only mutating affordance the cockpit
//     surfaces is the existing `publishListingAction`, called
//     through a separate client adapter (`publishListingClient`)
//     bound to a small button component. The button's founder
//     gate is the same `requireFounderSession()` inside the
//     existing publish action — no new authority is added here.
//
// References:
//   - `src/server/admin/auth.ts` (`requireFounderSession`)
//   - `src/server/persistence/supabase/feedbackRepository.ts`
//     (`listRecentFeedbackSubmissions`)
//   - `src/server/persistence/supabase/listingRepository.ts`
//     (`listRecentListings`)
//   - `src/server/persistence/supabase/rentalIntentRepository.ts`
//     (`listRentalIntents`)
//   - `src/server/persistence/supabase/marketplaceAggregates.ts`
//     (`readMarketplaceAggregates` — reused as-is)

import type { CategoryId } from "@/domain/categories";
import type {
  ListingStatus,
  RentalIntentStatus,
} from "@/domain/intents";
import { requireFounderSession } from "@/server/admin/auth";
import { getBackendMode } from "@/server/backend/mode";
import {
  listRecentFeedbackSubmissions,
  type RecentFeedbackSubmission,
} from "@/server/persistence/supabase/feedbackRepository";
import { listRecentListings } from "@/server/persistence/supabase/listingRepository";
import {
  readMarketplaceAggregates,
  type MarketplaceAggregates,
} from "@/server/persistence/supabase/marketplaceAggregates";
import { listRentalIntents } from "@/server/persistence/supabase/rentalIntentRepository";
import type {
  FeedbackKind,
  FeedbackStatus,
} from "@/server/persistence/supabase/validators";

export type CockpitListingRow = {
  id: string;
  status: ListingStatus;
  itemName: string;
  category: CategoryId;
  sellerId: string;
  pickupArea: string | null;
  prices: {
    oneDay: number;
    threeDays: number;
    sevenDays: number;
  };
  estimatedValue: number;
  createdAt: string;
};

export type CockpitRequestRow = {
  id: string;
  listingId: string;
  productName: string;
  productCategory: CategoryId;
  // Both sides' UUIDs are surfaced here (cockpit only) so the
  // founder can correlate with provisioning rows. Borrower id may
  // be null for pre-PR-5C rows; today's server-mode requests
  // always carry it via `actor.borrowerId`.
  sellerId: string;
  borrowerId: string | null;
  borrowerDisplayName: string | null;
  durationDays: 1 | 3 | 7;
  status: RentalIntentStatus;
  rentalFee: number;
  borrowerTotal: number;
  pickupArea: string | null;
  createdAt: string;
};

export type CockpitFeedbackRow = {
  id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  message: string;
  itemName: string | null;
  category: CategoryId | null;
  // The founder needs this for follow-up. The intake form surfaces
  // the field as optional and explicitly labeled.
  contactEmail: string | null;
  profileId: string | null;
  sourcePage: string | null;
  createdAt: string;
};

export type FounderCockpitData = {
  founderEmail: string;
  generatedAt: string;
  listings: CockpitListingRow[];
  requests: CockpitRequestRow[];
  feedback: CockpitFeedbackRow[];
  aggregates: MarketplaceAggregates | null;
};

export type FounderCockpitResult =
  | { kind: "forbidden" }
  | { kind: "inactive"; founderEmail: string }
  | { kind: "ready"; data: FounderCockpitData };

const ALLOWED_DURATIONS: ReadonlySet<number> = new Set([1, 3, 7]);

function projectListing(
  intent: import("@/domain/intents").ListingIntent,
): CockpitListingRow {
  return {
    id: intent.id,
    status: intent.status,
    itemName: intent.item.name,
    category: intent.item.category,
    sellerId: intent.sellerId,
    pickupArea: intent.item.pickupArea ?? null,
    prices: {
      oneDay: intent.pricing.oneDay,
      threeDays: intent.pricing.threeDays,
      sevenDays: intent.pricing.sevenDays,
    },
    estimatedValue: intent.item.estimatedValue,
    createdAt: intent.createdAt,
  };
}

function projectRequest(
  rental: import("@/domain/intents").RentalIntent,
): CockpitRequestRow {
  const durationDays = (
    ALLOWED_DURATIONS.has(rental.durationDays) ? rental.durationDays : 1
  ) as 1 | 3 | 7;
  return {
    id: rental.id,
    listingId: rental.productId,
    productName: rental.productName,
    productCategory: rental.productCategory,
    sellerId: rental.sellerId,
    borrowerId: rental.borrowerId ?? null,
    borrowerDisplayName: rental.borrowerName ?? null,
    durationDays,
    status: rental.status,
    rentalFee: rental.amounts.rentalFee,
    borrowerTotal: rental.amounts.borrowerTotal,
    pickupArea: rental.pickup.locationLabel ?? null,
    createdAt: rental.createdAt,
  };
}

function projectFeedback(
  row: RecentFeedbackSubmission,
): CockpitFeedbackRow {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    message: row.message,
    itemName: row.itemName,
    category: row.category,
    contactEmail: row.contactEmail,
    profileId: row.profileId,
    sourcePage: row.sourcePage,
    createdAt: row.createdAt,
  };
}

export async function readFounderCockpitData(
  limit = 50,
): Promise<FounderCockpitResult> {
  const session = await requireFounderSession();
  if (!session) return { kind: "forbidden" };

  if (getBackendMode() !== "supabase") {
    return { kind: "inactive", founderEmail: session.email };
  }

  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  const [listingsResult, requestsResult, feedbackResult, aggregatesResult] =
    await Promise.all([
      listRecentListings(safeLimit).catch(() => []),
      listRentalIntents(safeLimit).catch(() => []),
      listRecentFeedbackSubmissions(safeLimit).catch(() => []),
      readMarketplaceAggregates().catch(() => null),
    ]);

  return {
    kind: "ready",
    data: {
      founderEmail: session.email,
      generatedAt: new Date().toISOString(),
      listings: listingsResult.map(projectListing),
      requests: requestsResult.map(projectRequest),
      feedback: feedbackResult.map(projectFeedback),
      aggregates: aggregatesResult,
    },
  };
}
