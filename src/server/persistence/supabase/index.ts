// Phase 2 marketplace persistence — server-only. Re-exports the
// repositories and aggregates so call sites import from a single path.
//
// Anything imported from `@/server/persistence/supabase/*` MUST stay
// out of `"use client"` files and `src/components/**`. Enforced by
// import-boundary tests.

export {
  getListingById,
  listApprovedListings,
  saveListing,
  countListingsByStatus,
} from "./listingRepository";

export {
  getRentalIntentById,
  listRentalIntents,
  saveRentalIntent,
  appendRentalEvent,
  listRentalEvents,
  countRentalIntentsByStatus,
} from "./rentalIntentRepository";

export {
  listAdminReviews,
  enqueueAdminReview,
  recordAdminAction,
  countAdminReviewsByStatus,
} from "./adminReviewRepository";

export {
  saveIntakeSession,
  getIntakeSession,
  listIntakeSessions,
  appendIntakeMessage,
  listIntakeMessagesForSession,
  saveIntakeExtraction,
  getIntakeExtractionForSession,
  type RepoResult as IntakeRepoResult,
} from "./intakeRepository";

export {
  readMarketplaceAggregates,
  type MarketplaceAggregates,
  type DbHealth,
} from "./marketplaceAggregates";

export { getMarketplaceClient } from "./client";
