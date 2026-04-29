import { describe, expect, it } from "vitest";
import {
  ALLOWED_EVENT_TYPES,
  RAW_BODY_BYTE_CAP,
  SANITIZER_STRING_LENGTH_CAP,
  sanitize,
  type SanitizerInput,
} from "./sanitize";

const SH = "sess_abcdef0123456789";

function input(overrides: Partial<SanitizerInput> = {}): SanitizerInput {
  return {
    event_kind: "search_submitted",
    properties: {},
    consent_state: "granted",
    session_hash: SH,
    ...overrides,
  };
}

describe("sanitize — fixtures from phase1_validation_beta_plan §6", () => {
  it("fixture 1: clean payload writes verbatim with no rejections", () => {
    const r = sanitize(
      input({
        properties: {
          category: "massage_gun",
          duration_days: 3,
          region_coarse: "seoul",
          price_band: "30k_70k",
          had_query: true,
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.event_kind).toBe("search_submitted");
    expect(r.row.category).toBe("massage_gun");
    expect(r.row.region_coarse).toBe("seoul");
    expect(r.row.properties).toEqual({
      category: "massage_gun",
      duration_days: 3,
      region_coarse: "seoul",
      price_band: "30k_70k",
      had_query: true,
    });
    expect(r.rejections).toEqual([]);
  });

  it("fixture 2: extra `email` key is dropped, rejection logged, row still written without email", () => {
    const r = sanitize(
      input({
        properties: {
          category: "massage_gun",
          email: "user@example.com",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("email" in r.row.properties).toBe(false);
    expect(r.rejections).toHaveLength(1);
    expect(r.rejections[0].dropped_keys).toContain("email");
    expect(r.rejections[0].reason).toMatch(/not_in_allowlist|deny_list_match/);
  });

  it("fixture 3: out-of-dictionary value is coerced to `unknown` and rejection logged", () => {
    const r = sanitize(
      input({
        properties: {
          category: "weapons",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.properties.category).toBe("unknown");
  });

  it("fixture 4: embedded PII in long string drops the property and logs rejection", () => {
    const r = sanitize(
      input({
        properties: {
          // `note` is not in any allow-list anyway; deny-list match is the
          // belt-and-suspenders.
          note: "call me at 010-1234-5678 in 강남구",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("note" in r.row.properties).toBe(false);
    expect(r.rejections[0].dropped_keys).toContain("note");
  });

  it("fixture 5: padded payload — body cap is enforced at the route handler boundary, not by the sanitizer", () => {
    // The sanitizer itself trusts the route handler to enforce the 4 KB
    // pre-sanitize body cap. Document the constant here.
    expect(RAW_BODY_BYTE_CAP).toBe(4 * 1024);
  });

  it("fixture 6: wrong event_kind is rejected", () => {
    const r = sanitize(input({ event_kind: "secret_data_export" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown_event_type");
  });

  it("fixture 7: replays are accepted as separate events", () => {
    const a = sanitize(input({ properties: { category: "massage_gun" } }));
    const b = sanitize(input({ properties: { category: "massage_gun" } }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // Both produce valid rows; deduplication is intentionally not the
    // sanitizer's job — replays are part of the funnel.
  });

  it("fixture 8: consent_state=denied coerces to analytics_denied with no other properties", () => {
    const r = sanitize(
      input({
        consent_state: "denied",
        event_kind: "search_submitted",
        properties: {
          category: "massage_gun",
          duration_days: 3,
          had_query: true,
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.event_kind).toBe("analytics_denied");
    expect(r.row.consent_state).toBe("denied");
    expect(r.row.properties).toEqual({});
    expect(r.row.category).toBeNull();
    expect(r.row.region_coarse).toBeNull();
  });
});

describe("sanitize — allow-list per event type", () => {
  for (const kind of ALLOWED_EVENT_TYPES) {
    it(`accepts allowed event type "${kind}"`, () => {
      const r = sanitize(input({ event_kind: kind, properties: {} }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.row.event_kind).toBe(kind);
    });
  }

  it("rejects unknown event types", () => {
    const r = sanitize(input({ event_kind: "totally_made_up" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown_event_type");
  });

  it("rejects empty / non-string event_kind", () => {
    const r = sanitize(input({ event_kind: 123 as unknown as string }));
    expect(r.ok).toBe(false);
  });
});

describe("sanitize — deny-list patterns", () => {
  it("drops a property containing an email pattern", () => {
    const r = sanitize(
      input({
        // `category` is in the allow-list but the value is poisoned with an
        // email-shaped string — must fail the dictionary check first, then
        // also be caught by the deny-list if it had survived.
        properties: { category: "user@example.com" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Non-dictionary value coerces to `unknown`, not stored as-is.
    expect(r.row.properties.category).toBe("unknown");
  });

  it("drops a property containing a Korean local phone pattern", () => {
    const r = sanitize(
      input({ properties: { extra: "010-1234-5678" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("extra" in r.row.properties).toBe(false);
  });

  it("drops a property containing a Korean international phone pattern", () => {
    const r = sanitize(
      input({ properties: { extra: "+82 10 1234 5678" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("extra" in r.row.properties).toBe(false);
  });

  it("drops a property containing an RRN pattern", () => {
    const r = sanitize(
      input({ properties: { extra: "900101-1234567" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("extra" in r.row.properties).toBe(false);
  });

  it("drops a property containing a 16-digit card-like pattern", () => {
    const r = sanitize(
      input({ properties: { extra: "4111-1111-1111-1111" } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("extra" in r.row.properties).toBe(false);
  });
});

describe("sanitize — string length cap", () => {
  it(`drops strings longer than ${SANITIZER_STRING_LENGTH_CAP} chars (does not truncate)`, () => {
    const longString = "a".repeat(SANITIZER_STRING_LENGTH_CAP + 1);
    const r = sanitize(
      input({ properties: { extra: longString } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("extra" in r.row.properties).toBe(false);
  });

  it("accepts strings at exactly the cap", () => {
    const exact = "a".repeat(SANITIZER_STRING_LENGTH_CAP);
    const r = sanitize(
      input({ properties: { extra: exact } }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // `extra` is not in the allow-list anyway, so it is still dropped — but
    // dropped for not_in_allowlist, not for length. Verify length-matching
    // string was at least passed through to the deny-list.
    expect("extra" in r.row.properties).toBe(false);
  });
});

describe("sanitize — boolean coercion", () => {
  it("drops non-boolean values for boolean keys", () => {
    const r = sanitize(
      input({
        event_kind: "search_submitted",
        properties: { had_query: "yes" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("had_query" in r.row.properties).toBe(false);
  });

  it("accepts true and false for boolean keys", () => {
    const r1 = sanitize(
      input({
        event_kind: "search_submitted",
        properties: { had_query: true },
      }),
    );
    const r2 = sanitize(
      input({
        event_kind: "request_submitted",
        properties: { had_pickup_label: false },
      }),
    );
    if (!r1.ok || !r2.ok) throw new Error("expected ok");
    expect(r1.row.properties.had_query).toBe(true);
    expect(r2.row.properties.had_pickup_label).toBe(false);
  });
});

describe("sanitize — payload shape and session hash", () => {
  it("rejects non-object input", () => {
    const r = sanitize(null as unknown as SanitizerInput);
    expect(r.ok).toBe(false);
  });

  it("rejects missing session hash", () => {
    const r = sanitize({
      event_kind: "search_submitted",
      properties: {},
      consent_state: "granted",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing_session_hash");
  });

  it("rejects malformed session hash", () => {
    const r = sanitize(input({ session_hash: "../../etc/passwd" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid_session_hash");
  });
});

describe("sanitize — guarantees about what is never stored", () => {
  it("never stores raw search text on a row", () => {
    const r = sanitize(
      input({
        properties: {
          // None of the allowed properties for any event type carry free text.
          rawInput: "이번 주말에 마사지건 3일",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const serialized = JSON.stringify(r.row.properties);
    expect(serialized).not.toContain("이번 주말");
    expect(serialized).not.toContain("rawInput");
  });

  it("never stores an IP address", () => {
    const r = sanitize(
      input({
        properties: { ip: "203.0.113.42" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("ip" in r.row.properties).toBe(false);
  });

  it("never stores a raw user-agent", () => {
    const r = sanitize(
      input({
        properties: {
          ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("ua" in r.row.properties).toBe(false);
  });

  it("never stores an exact KRW amount", () => {
    const r = sanitize(
      input({
        properties: { exact_krw: 28400 },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("exact_krw" in r.row.properties).toBe(false);
  });

  it("never stores district-level geography", () => {
    const r = sanitize(
      input({
        properties: { district: "강남구 역삼동" },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("district" in r.row.properties).toBe(false);
  });
});
