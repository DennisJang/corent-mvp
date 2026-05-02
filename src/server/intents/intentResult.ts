// Tiny typed result shape used by every server-side intent command
// (chat intake, future listing/rental/claim/admin actions).
//
// Why not throw across the server-action boundary:
//
//   - Next.js serializes the action's return value to the client.
//     A thrown error reaches the client as a generic 500 with a
//     boundary-erasing stack. A typed `IntentResult` lets the
//     client branch on `code` and render Korean copy without
//     depending on `Error.message` strings.
//   - The set of shape-violation codes is small and stable. Adding
//     a new one is a deliberate decision; we prefer the `code` enum
//     to free-form strings.
//
// The shape is intentionally minimal — this is not a Result library.

// Slice A PR 5D added `"unsupported"`. Semantics:
//   - the request is shape-correct AND the actor is authorized,
//   - but the *current configuration* cannot serve it safely
//     (e.g. supabase-mode + supabase actor reaching an action
//     whose downstream persistence has not been externalized yet
//     and would otherwise create a Supabase-intake/local-listing
//     split-brain).
// Distinct from `internal` (unexpected throw) and `not_found`
// (the target row does not exist).
export type IntentErrorCode =
  | "unauthenticated"
  | "ownership"
  | "input"
  | "not_found"
  | "conflict"
  | "unsupported"
  | "internal";

export type IntentResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: IntentErrorCode; message: string };

export function intentOk<T>(value: T): IntentResult<T> {
  return { ok: true, value };
}

export function intentErr<T = never>(
  code: IntentErrorCode,
  message: string,
): IntentResult<T> {
  return { ok: false, code, message };
}
