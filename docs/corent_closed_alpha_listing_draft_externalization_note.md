# Closed-alpha listing draft externalization note (Slice A PR 5E)

PR 5E externalizes the **listing-draft side** of chat-to-listing
intake so `createIntakeListingDraftAction` can complete safely
in `CORENT_BACKEND_MODE=supabase` without producing a
Supabase-intake / local-listing split-brain.

It removes the temporary `unsupported` guard PR 5D placed on
`createIntakeListingDraftAction` and replaces it with a fully
server-backed listing-draft persistence path. Both sides of the
chat-to-listing transaction now route through writers selected by
the same dispatcher decision (`(getBackendMode(), actor.source)`).

## Shape of the change

PR 5E mirrors PR 4's `IntakeWriter` seam. There are now two
swappable writers powering the chat intake service:

| Concern | Writer | Local impl | Supabase impl |
| --- | --- | --- | --- |
| chat sessions / messages / extractions (PR 4) | [`IntakeWriter`](../src/lib/intake/intakeWriter.ts) | `localIntakeWriter` → `getPersistence()` | [`supabaseIntakeWriter`](../src/server/intake/supabaseIntakeWriter.ts) → intake repo |
| listing draft id allocation, save, read (PR 5E) | [`ListingDraftWriter`](../src/lib/intake/listingDraftWriter.ts) | `localListingDraftWriter` → `listingService.saveDraft` + `getPersistence()` | [`supabaseListingDraftWriter`](../src/server/intake/supabaseListingDraftWriter.ts) → `saveListing` + `getListingById` |

Both are dispatched server-side by symmetric pure functions:

| `getBackendMode()` | `actor.source` | `getIntakeWriter` | `getListingDraftWriter` |
| --- | --- | --- | --- |
| `mock` (or anything other than `supabase`) | any | `localIntakeWriter` | `localListingDraftWriter` |
| `supabase` | `mock` | `null` | `null` |
| `supabase` | `supabase` | `supabaseIntakeWriter` | `supabaseListingDraftWriter` |

A static-text guard
([`src/server/admin/import-boundary.test.ts`](../src/server/admin/import-boundary.test.ts))
asserts both dispatcher files share the same gate (`getBackendMode() !== "supabase"`,
`actor.source !== "supabase"`, `return null`). The
[dispatcher unit test](../src/server/intake/listingDraftWriterDispatcher.test.ts)
includes a "joint table" block that asserts the two
dispatchers coincide on every row of the matrix above. Drift
between the two would re-introduce a split-brain possibility.

## Listing id strategy

- **Local mode**: `localListingDraftWriter.newDraftId()` returns
  `li_<16hex>` (the existing domain format from
  `generateId("li")`). Local snapshots, tests, and the
  same-browser demo continue to see the same id shape they always
  did.
- **Supabase mode**: `supabaseListingDraftWriter.newDraftId()`
  returns a uuid via `crypto.randomUUID()`. This is required by
  the Phase 2 schema (`listings.id uuid PK`) and the marketplace
  validators (`validateUuid` rejects everything else).

The chat intake service calls `listingDraftWriter.newDraftId()`
at the top of `createListingDraftFromIntake` and threads the id
through `listingService.draftFromInput({ id })`. The new
optional `id?: string` parameter on `draftFromInput` is
overrideable by the writer; existing callers (the seller
registration page, every test that does not supply `id`) keep the
old `idSeed`/random behavior.

The verification id stays on the in-memory `vi_<…>` shape because
the Phase 2 `listing_verifications.id` column has its own
`gen_random_uuid()` default and the read-back returns the
canonical uuid; the in-memory `vi_…` is local metadata only.

## Status transition: ai_extracted → draft

`listingService.saveDraft` (the local path) transitions an
`ai_extracted` listing to `draft` before persisting. PR 5E
preserves this in both writers:

- the local writer delegates to `listingService.saveDraft`, which
  does the transition;
- the supabase writer mirrors the same transition explicitly:

  ```ts
  const next = intent.status === "ai_extracted"
    ? { ...intent, status: "draft" }
    : intent;
  ```

  before calling `saveListing({ intent: next })`. Without this,
  a chat-intake-created Supabase row would land at
  `'ai_extracted'` (allowed by the enum but mismatched against
  the local user-visible behavior). Tests assert the persisted
  Supabase row's status is `'draft'`, never `'ai_extracted'`,
  and never `'approved'`.

## How split-brain persistence is prevented

Three layers, listed inside-out:

1. **Schema parity.** The Phase 2 `listings` + `listing_verifications`
   schema already accepts everything `ListingIntent` produces
   (after the uuid id allocation above). No migration is needed.
2. **Dispatcher symmetry.** `getIntakeWriter` and
   `getListingDraftWriter` share the same decision table; tests
   assert they coincide on every cell. A null on one side
   coincides with a null on the other, so the action's
   `unauthenticated` short-circuit (which fires when either
   writer is null) cannot land a single-sided dispatch.
3. **Service routing.** `createListingDraftFromIntake` no longer
   calls `getPersistence()` directly. A static-text guard scans
   the file and asserts there are no live `getPersistence()`
   calls (only comment-only references). All listing-side reads
   and writes go through `listingDraftWriter`.

The action layer (`createIntakeListingDraftAction`) resolves
both writers explicitly and fails closed `unauthenticated` if
either is null, defending against a future asymmetry between
the dispatchers.

## What PR 5E does NOT do

| Concern | Status |
| --- | --- |
| Visible chat intake client adapter mode | **Not flipped in PR 5E.** The controlled visible bridge landed in PR 5F (probe-driven, default-local, no silent fallback). |
| Visible `ChatToListingIntakeCard` switching to server actions | **Not switched.** |
| Public listing publication | **Not added.** Persisted Supabase listings stay at `status='draft'`; `publicListingService` continues to require `'approved'`. |
| RLS policy changes | **None.** Deny-by-default RLS stays. |
| Schema migrations | **None.** |
| Profile / `seller_profiles` / `borrower_profiles` auto-create | **None.** Manual provisioning per PR 5B. |
| Remote `corent-dev` apply | **Not run.** |
| Region extraction (`region_coarse`) | **Not added.** Chat-intake-created listings stay on the schema's `'unknown'` default. |
| Rental lifecycle, handoff, claim, trust, notifications, admin actions, payment, deposit, escrow, refund, settlement, checkout | **None.** |
| `listing_secrets` / `private_serial_number` writes via chat intake | **None.** That table stays admin-only. |

## What lands next

PR 5F **landed**: the controlled visible client bridge.
[`src/lib/client/chatIntakeClient.ts`](../src/lib/client/chatIntakeClient.ts)
calls a server-side probe at mount and routes to either the
local same-browser demo or the server-backed actions based on
the probe result. Local demo behavior is the default; no silent
local fallback after server mode is selected. See
[`docs/corent_closed_alpha_chat_intake_client_mode_note.md`](corent_closed_alpha_chat_intake_client_mode_note.md).

The next slice (PR 5G or later) externalizes the seller
dashboard listings table read path so a server-backed draft
becomes visible in the seller's own surface.

## References

- `src/lib/intake/listingDraftWriter.ts` (interface + local writer)
- `src/lib/intake/listingDraftWriter.test.ts`
- `src/server/intake/supabaseListingDraftWriter.ts` (server-only)
- `src/server/intake/supabaseListingDraftWriter.test.ts`
- `src/server/intake/listingDraftWriterDispatcher.ts`
- `src/server/intake/listingDraftWriterDispatcher.test.ts`
- `src/server/intake/actions.ts` (resolves both writers; PR 5D
  guard removed)
- `src/server/intake/actions.backendMode.test.ts` (createDraft
  flipped from `unsupported` → success)
- `src/server/intake/actions.splitBrainGuard.test.ts` (rewritten
  for PR 5E full-dispatch contract)
- `src/server/intake/actions.capability.test.ts` (PR 5A renter
  / forged-payload tests; unchanged)
- `src/server/admin/import-boundary.test.ts` (PR 5E boundary
  additions)
- `src/lib/services/chatListingIntakeService.ts`
  (`createListingDraftFromIntake` now routes via
  `listingDraftWriter`)
- `src/lib/services/listingService.ts`
  (`draftFromInput` accepts optional `id`)
- `src/server/persistence/supabase/listingRepository.ts`
  (`saveListing` / `getListingById` — unchanged, reused)
- `src/lib/services/publicListingService.ts` (privacy contract;
  unchanged — drafts continue to be filtered out)
- `docs/corent_closed_alpha_actor_resolver_note.md` (PR 5A)
- `docs/corent_closed_alpha_provisioning_workflow.md` (PR 5B)
- `docs/corent_closed_alpha_user_auth_note.md` (PR 5C)
- `docs/corent_closed_alpha_intake_dispatch_smoke_note.md` (PR 5D)
- `docs/phase2_marketplace_schema_draft.md` §"PR 5
  prerequisites"
- `docs/corent_security_gate_note.md`
- `docs/corent_pre_revenue_beta_plan.md`
