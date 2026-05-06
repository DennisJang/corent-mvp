// Phase 2 marketplace persistence — server-only. Re-exports the
// repositories and aggregates so call sites import from a single path.
//
// Anything imported from `@/server/persistence/supabase/*` MUST stay
// out of `"use client"` files and `src/components/**`. Enforced by
// import-boundary tests.

export {
  getListingById,
  listApprovedListings,
  listListingsBySeller,
  listRecentListings,
  saveListing,
  setListingStatus,
  countListingsByStatus,
  type SetListingStatusResult,
} from "./listingRepository";

export {
  getRentalIntentById,
  listRentalIntents,
  listRentalIntentsBySeller,
  listRentalIntentsByBorrower,
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
  insertFeedbackSubmission,
  listRecentFeedbackSubmissions,
  type InsertFeedbackInput,
  type InsertFeedbackResult,
  type RecentFeedbackSubmission,
} from "./feedbackRepository";

export {
  readMarketplaceAggregates,
  type MarketplaceAggregates,
  type DbHealth,
} from "./marketplaceAggregates";

export { getMarketplaceClient } from "./client";
