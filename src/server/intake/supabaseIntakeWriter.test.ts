// Tests for the supabase IntakeWriter — narrow scope.
//
// We only need to pin down the bug-fix invariant: the supabase
// writer mints uuid-shaped ids so the marketplace repository's
// `validateUuid` does not reject `listing_intake_sessions.id` /
// `listing_intake_messages.id` before any insert.
//
// Behavioral coverage of the read/write methods themselves stays
// in `intakeRepository.test.ts` and `actions.test.ts`; this file
// is the dedicated id-shape regression guard.

import { describe, expect, it } from "vitest";
import { supabaseIntakeWriter } from "./supabaseIntakeWriter";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("supabaseIntakeWriter — id mints", () => {
  it("newSessionId() returns a uuid-shaped string", () => {
    const id = supabaseIntakeWriter.newSessionId();
    expect(id).toMatch(UUID_RE);
  });

  it("newMessageId() returns a uuid-shaped string", () => {
    const id = supabaseIntakeWriter.newMessageId();
    expect(id).toMatch(UUID_RE);
  });

  it("each call returns a fresh id", () => {
    const a = supabaseIntakeWriter.newSessionId();
    const b = supabaseIntakeWriter.newSessionId();
    expect(a).not.toBe(b);
    const c = supabaseIntakeWriter.newMessageId();
    const d = supabaseIntakeWriter.newMessageId();
    expect(c).not.toBe(d);
  });
});
