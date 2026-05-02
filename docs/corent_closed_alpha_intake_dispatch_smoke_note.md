# Closed-alpha intake dispatch smoke note (Slice A PR 5D)

PR 5D proves that the chat intake **server action path** can
safely dispatch to the Supabase intake writer for an
authenticated, provisioned seller in `CORENT_BACKEND_MODE=supabase`,
without flipping the visible client runtime and without creating
a Supabase-intake / local-listing **split-brain**.

It is the fourth and last server-side prerequisite for the chat
intake dispatch flip. PR 5E or later must externalize listing
draft persistence before the visible client can be flipped.

## What PR 5D adds (and what stays the same)

| Action | mock-mode + any actor | supabase-mode + mock actor | supabase-mode + supabase seller actor (NEW reachable in PR 5C) |
| --- | --- | --- | --- |
| `startIntakeSessionAction` | local writer, `ok: true` | `unauthenticated` | **smoke through Supabase writer**, `ok: true` |
| `appendIntakeSellerMessageAction` | local writer, `ok: true` | `unauthenticated` | **smoke through Supabase writer**, `ok: true` |
| `createIntakeListingDraftAction` | local writer + local listing service, `ok: true` | `unauthenticated` | **fails closed `unsupported`** with message `supabase_listing_draft_not_yet_wired` |

The first column (mock mode) is the visible local browser demo.
PR 5D does **not** change it. `SHARED_SERVER_MODE` in
[`src/lib/client/chatIntakeClient.ts`](../src/lib/client/chatIntakeClient.ts)
remains `false` and is asserted by static-text guard.

## The split-brain that PR 5D forbids

`chatListingIntakeService.createListingDraftFromIntake` reads the
session via the dispatched `IntakeWriter` (Supabase in
supabase-mode + supabase actor) but writes the listing draft
through `getPersistence()` (local-only). If we let that path run
in supabase mode, we get:

- `listing_intake_sessions` row in Supabase ✅
- `listing_intake_messages` rows in Supabase ✅
- `listing_extractions` row in Supabase ✅
- `listing_intake_sessions.listing_intent_id` (Supabase) → points
  at a listing id that exists **only in localStorage** ✗

That hybrid state is observable, hard to roll back, and breaks
the public projection privacy contract because there is now a
session in Supabase whose linked listing cannot be sanitized
through the same code path.

## How the guard works

The guard sits inside
[`createIntakeListingDraftAction`](../src/server/intake/actions.ts),
between the `unauthenticated` check (writer-resolution) and the
service call:

```ts
const writer = getIntakeWriter(actor);
if (!writer) return intakeUnauthenticated();
if (getBackendMode() === "supabase") {
  return intakeListingDraftUnsupportedInSupabase();
}
// only mock-mode + writer reach the chat intake service.
```

Because the guard fires **before** any service call, no intake
read or write touches Supabase. The supabase writer is never
contacted; no partial Supabase state is left behind. The local
persistence is also untouched because the action returns before
the chat intake service runs.

The fail-closed result is typed and non-secret:

```ts
{
  ok: false,
  code: "unsupported",                              // new IntentErrorCode
  message: "supabase_listing_draft_not_yet_wired",  // no table / env / SQL / row data
}
```

A new `IntentErrorCode` `"unsupported"` was added in
[`src/server/intents/intentResult.ts`](../src/server/intents/intentResult.ts)
to give the client a stable code for "request shape is fine,
actor is authorized, but the current configuration cannot serve
this safely yet" — distinct from `internal` (unexpected throw)
and `not_found` (target row missing).

## What PR 5D does NOT do

| Concern | Status |
| --- | --- |
| `SHARED_SERVER_MODE` flip in `chatIntakeClient.ts` | **Not flipped.** Asserted by test. |
| Visible `ChatToListingIntakeCard` switching to server actions | **Not switched.** |
| Default same-browser demo behavior | **Unchanged.** Local writer + local listing service. |
| Listing draft externalization (Supabase listing repo write path through the chat intake service) | **Not done.** PR 5E or later. |
| Public listing publication, rental lifecycle, handoff, claim, trust, notifications, admin actions, payment, deposit, escrow, refund, settlement, checkout | **None.** |
| RLS policy changes | **None.** |
| Schema migrations | **None.** |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** Closed-alpha provisioning stays manual (PR 5B). |
| Remote `corent-dev` apply | **Not run.** |

## What PR 5E (or later) must do before the client adapter flip

1. **Externalize listing draft persistence** through the chat
   intake service. A swappable listing-draft writer (mirroring
   the `IntakeWriter` shape) that can route to either local or
   Supabase based on the same dispatcher decision table. Tests
   must prove there is no remaining `getPersistence()` call on
   the listing-draft path inside `createListingDraftFromIntake`
   when supabase mode is active.
2. **Migrate any required listing fields** (already covered by
   the Phase 2 migration, but validate against the externalized
   path's read/write surface).
3. **Snapshot parity** for the listing draft: the Supabase listing
   repository must satisfy the same snapshot semantics as the
   local persistence path (read returns a snapshot, mutation
   after save cannot corrupt persisted state) — same contract
   as the intake repository.
4. Only after 1–3 land, **flip** `SHARED_SERVER_MODE` (or
   replace it with a runtime probe / per-session opt-in cookie)
   so the visible chat intake UI starts talking to the
   server-backed dispatcher for opted-in sessions.

Until those four steps land, PR 5D's `unsupported` guard is the
correct user-visible behavior for `createIntakeListingDraftAction`
under `CORENT_BACKEND_MODE=supabase`.

## References

- `src/server/intake/actions.ts` (`intakeListingDraftUnsupportedInSupabase`)
- `src/server/intake/actions.backendMode.test.ts` (PR 4
  decision-table tests; PR 5D updates the createDraft +
  supabase-actor expectation)
- `src/server/intake/actions.splitBrainGuard.test.ts` (NEW —
  PR 5D smoke / fail-closed contract)
- `src/server/intake/actions.capability.test.ts` (PR 5A renter
  / forged-payload tests; unchanged)
- `src/server/intents/intentResult.ts` (new `"unsupported"`
  code)
- `src/server/intake/intakeWriterDispatcher.ts` (PR 4 dispatch
  decision)
- `src/server/intake/supabaseIntakeWriter.ts` (PR 4 writer)
- `src/lib/services/chatListingIntakeService.ts`
  (`createListingDraftFromIntake` is the call the guard prevents
  in supabase mode)
- `src/lib/services/publicListingService.test.ts` (independent
  privacy contract — unchanged)
- `docs/corent_closed_alpha_actor_resolver_note.md` (PR 5A)
- `docs/corent_closed_alpha_provisioning_workflow.md` (PR 5B)
- `docs/corent_closed_alpha_user_auth_note.md` (PR 5C)
- `docs/phase2_marketplace_schema_draft.md` §"PR 5
  prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
