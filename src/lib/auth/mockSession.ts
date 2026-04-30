// MOCK session helper. This is the **only** place in the app that should
// resolve a "current user" while CoRent runs without real authentication.
//
// CRITICAL — read before using:
//
//   1. THIS IS NOT REAL AUTH. The identity returned here is hardcoded.
//      Anything that needs to authorize a real user (server-side ownership
//      checks, payment, settlement, admin actions) MUST be replaced before
//      a single real user touches the system.
//
//   2. Never trust this value for authorization. It is fine for the demo
//      UI to read the mock seller's name; it is NOT fine for a write path
//      to use it as the only ownership signal once Phase 2 user auth ships.
//
//   3. Server-side code MUST NOT import this module. The persistence path
//      that talks to Supabase already enforces deny-by-default RLS and
//      will need a real `auth.uid()` from Supabase Auth — not this helper.
//
//   4. When real auth ships, replace `getMockSellerSession()` with a
//      server-resolved session (cookie-bound, signed) and delete the mock
//      branch. Any caller of this helper is a known migration site.
//
// References:
//   - docs/mvp_security_guardrails.md (mock auth boundary)
//   - docs/corent_security_gate_note.md (real auth is gated)
//   - docs/phase2_backend_integration_draft.md (server boundary)

import { CURRENT_SELLER, SELLERS } from "@/data/mockSellers";
import type { Seller } from "@/domain/sellers";

export type MockSellerSession = {
  // The mock seller's stable id. Format: `seller_<slug>`. NOT a UUID; the
  // Phase 2 Supabase adapter intentionally rejects this shape, so it
  // cannot be used as an identity write to the real DB by accident.
  sellerId: string;
  displayName: string;
  // Always `"mock"`. A real session must declare a different source.
  source: "mock";
  seller: Seller;
};

export function getMockSellerSession(): MockSellerSession {
  return {
    sellerId: CURRENT_SELLER.id,
    displayName: CURRENT_SELLER.name,
    source: "mock",
    seller: CURRENT_SELLER,
  };
}

// Test seam — let unit tests pretend a different mock seller is "current"
// without monkey-patching the data fixture file.
export function _findMockSellerForTests(id: string): Seller | undefined {
  return SELLERS.find((s) => s.id === id);
}
