// Tests for the closed-alpha profile / capability lookup helper.
//
// The helper is a thin reader on top of the marketplace client. We
// fake the Supabase client surface (`from(table).select(...).eq(...).maybeSingle()`)
// the same way `intakeRepository.test.ts` does — no real DB, no
// `@supabase/supabase-js` import.
//
// Coverage:
//   - missing client (mock backend mode / missing env) → null
//   - non-UUID auth user id rejected at the boundary → null
//   - profile row missing → null (NEVER auto-created)
//   - profile only, no capability rows → has* flags both false
//   - seller capability only
//   - borrower capability only
//   - both capabilities (closed-alpha allows the same profile to
//     own both rows)
//   - capability-row display name precedence over profile display name
//   - capability lookup error treated as "no capability" (fail closed)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetMarketplaceClientForTests,
  getMarketplaceClient,
} from "@/server/persistence/supabase/client";
import { lookupProfileCapabilities } from "./profileLookup";

const PROFILE_UUID = "11111111-2222-4333-8444-555555555555";

vi.mock("@/server/persistence/supabase/client", async () => {
  const mod = await vi.importActual<Record<string, unknown>>(
    "@/server/persistence/supabase/client",
  );
  return {
    ...mod,
    getMarketplaceClient: vi.fn(() => null),
    _resetMarketplaceClientForTests: () => {},
  };
});

type RowResult = { data: unknown; error: unknown };

type RowResponders = {
  profiles?: RowResult;
  seller_profiles?: RowResult;
  borrower_profiles?: RowResult;
};

function makeFakeClient(responders: RowResponders) {
  return {
    from(table: string) {
      const result: RowResult =
        responders[table as keyof RowResponders] ?? {
          data: null,
          error: null,
        };
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve(result);
        },
      };
    },
  };
}

beforeEach(() => {
  _resetMarketplaceClientForTests();
});

afterEach(() => {
  vi.mocked(getMarketplaceClient).mockReturnValue(null);
});

describe("lookupProfileCapabilities — fail-closed boundaries", () => {
  it("returns null when the marketplace client is unavailable", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(null);
    expect(await lookupProfileCapabilities(PROFILE_UUID)).toBeNull();
  });

  it("returns null for a non-uuid auth user id (no DB call attempted)", async () => {
    // Even with a working client, a malformed id must short-circuit
    // before any query runs. Set a fake client that would otherwise
    // return a profile to prove validation comes first.
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: "anything", display_name: "x" },
          error: null,
        },
      }) as never,
    );
    expect(await lookupProfileCapabilities("not-a-uuid")).toBeNull();
    expect(
      await lookupProfileCapabilities("seller_jisu"),
    ).toBeNull();
    expect(await lookupProfileCapabilities("")).toBeNull();
  });

  it("returns null when no profiles row exists for the auth user id", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: { data: null, error: null },
      }) as never,
    );
    expect(await lookupProfileCapabilities(PROFILE_UUID)).toBeNull();
  });

  it("returns null when the profiles query errors (no auto-create on the way back)", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: null,
          error: { message: "transient" },
        },
      }) as never,
    );
    expect(await lookupProfileCapabilities(PROFILE_UUID)).toBeNull();
  });
});

describe("lookupProfileCapabilities — capability presence", () => {
  it("returns has* both false when the profile has no capability rows", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: PROFILE_UUID, display_name: "데니스" },
          error: null,
        },
        seller_profiles: { data: null, error: null },
        borrower_profiles: { data: null, error: null },
      }) as never,
    );
    const r = await lookupProfileCapabilities(PROFILE_UUID);
    expect(r).toEqual({
      profileId: PROFILE_UUID,
      displayName: "데니스",
      hasSeller: false,
      hasBorrower: false,
      sellerDisplayName: null,
      borrowerDisplayName: null,
    });
  });

  it("returns hasSeller=true with display name when seller_profiles row exists", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: PROFILE_UUID, display_name: "데니스" },
          error: null,
        },
        seller_profiles: {
          data: {
            profile_id: PROFILE_UUID,
            display_name: "DEMO 셀러",
          },
          error: null,
        },
        borrower_profiles: { data: null, error: null },
      }) as never,
    );
    const r = await lookupProfileCapabilities(PROFILE_UUID);
    expect(r?.hasSeller).toBe(true);
    expect(r?.hasBorrower).toBe(false);
    expect(r?.sellerDisplayName).toBe("DEMO 셀러");
    expect(r?.borrowerDisplayName).toBeNull();
  });

  it("returns hasBorrower=true with display name when borrower_profiles row exists", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: PROFILE_UUID, display_name: "데니스" },
          error: null,
        },
        seller_profiles: { data: null, error: null },
        borrower_profiles: {
          data: {
            profile_id: PROFILE_UUID,
            display_name: "DEMO 빌리는사람",
          },
          error: null,
        },
      }) as never,
    );
    const r = await lookupProfileCapabilities(PROFILE_UUID);
    expect(r?.hasSeller).toBe(false);
    expect(r?.hasBorrower).toBe(true);
    expect(r?.sellerDisplayName).toBeNull();
    expect(r?.borrowerDisplayName).toBe("DEMO 빌리는사람");
  });

  it("returns both flags true when seller_profiles and borrower_profiles both exist for the same profile", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: PROFILE_UUID, display_name: "데니스" },
          error: null,
        },
        seller_profiles: {
          data: { profile_id: PROFILE_UUID, display_name: "셀러쪽" },
          error: null,
        },
        borrower_profiles: {
          data: { profile_id: PROFILE_UUID, display_name: "빌리는쪽" },
          error: null,
        },
      }) as never,
    );
    const r = await lookupProfileCapabilities(PROFILE_UUID);
    expect(r?.hasSeller).toBe(true);
    expect(r?.hasBorrower).toBe(true);
    expect(r?.sellerDisplayName).toBe("셀러쪽");
    expect(r?.borrowerDisplayName).toBe("빌리는쪽");
  });

  it("treats a capability-query error as 'no capability' (fail closed, never grant)", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: PROFILE_UUID, display_name: null },
          error: null,
        },
        seller_profiles: {
          data: null,
          error: { message: "transient" },
        },
        borrower_profiles: { data: null, error: null },
      }) as never,
    );
    const r = await lookupProfileCapabilities(PROFILE_UUID);
    expect(r?.hasSeller).toBe(false);
    expect(r?.hasBorrower).toBe(false);
  });

  it("preserves a null capability-row display_name as null (resolver falls back, but lookup does not invent)", async () => {
    vi.mocked(getMarketplaceClient).mockReturnValue(
      makeFakeClient({
        profiles: {
          data: { id: PROFILE_UUID, display_name: "프로필" },
          error: null,
        },
        seller_profiles: {
          data: { profile_id: PROFILE_UUID, display_name: null },
          error: null,
        },
        borrower_profiles: { data: null, error: null },
      }) as never,
    );
    const r = await lookupProfileCapabilities(PROFILE_UUID);
    expect(r?.hasSeller).toBe(true);
    expect(r?.sellerDisplayName).toBeNull();
    expect(r?.displayName).toBe("프로필");
  });
});
