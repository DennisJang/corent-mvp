// Manual seller-editing skeleton (Phase 1.9). The seller-owned write
// boundary for the public profile copy override.
//
// What this service WILL do:
//   - Let a known canonical seller (one that appears in `SELLERS`)
//     edit a narrow set of public copy fields about themselves:
//     `displayName`, `publicNote`. These overlay the static fixture
//     on the public storefront.
//   - Validate bounded text input.
//   - Persist exactly one override per seller via the persistence
//     adapter.
//   - Compose a `StorefrontProfile` view by merging the static
//     fixture base with the persisted override for read paths.
//
// What this service WILL NOT do:
//   - Mutate the static `SELLERS` fixture.
//   - Allow fallback / product-only sellers (those NOT in `SELLERS`)
//     to create a real persisted profile override. They stay marked
//     fallback on the storefront.
//   - Touch any of the following — even if a forged patch supplies
//     them: `trustScore`, `reviewCount`, `joinedAt`, `trustNote`
//     (note: the public note OVERLAYS the static `trustNote` slot
//     on the storefront, but the static value itself never changes),
//     account standing, payment / settlement / payout, admin status,
//     contact / private fields.

import { SELLERS, getSellerById } from "@/data/mockSellers";
import type {
  Seller,
  SellerProfileOverride,
} from "@/domain/sellers";
import { getPersistence } from "@/lib/adapters/persistence";
import { nowIso } from "@/lib/ids";

const DISPLAY_NAME_MAX = 40;
const PUBLIC_NOTE_MAX = 240;

export class SellerProfileInputError extends Error {
  readonly code:
    | "actor_id_required"
    | "actor_unknown_seller"
    | "display_name_invalid"
    | "public_note_invalid"
    | "patch_empty";
  constructor(code: SellerProfileInputError["code"], message: string) {
    super(message);
    this.name = "SellerProfileInputError";
    this.code = code;
  }
}

// Patch shape mirrors the editable fields on `SellerProfileOverride`
// exactly. Any caller-supplied field outside this shape is ignored —
// the destructure below picks only the two known fields. `null` clears
// the override field; `undefined` leaves the previous value.
export type SellerProfilePatch = {
  displayName?: string | null;
  publicNote?: string | null;
};

// A composed read view for storefront / dashboard surfaces. The
// `seller` field is always the static fixture; `override` is the
// persisted local override (or null). `effectiveName` and
// `effectiveIntro` are convenience-resolved values the surface can
// render directly. The visitor never sees raw fixture vs. override —
// just the merged result.
export type StorefrontProfile = {
  seller: Seller;
  override: SellerProfileOverride | null;
  effectiveName: string;
  effectiveIntro: string | null;
};

function validateBoundedString(
  value: unknown,
  max: number,
  code: "display_name_invalid" | "public_note_invalid",
  minLen: number,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new SellerProfileInputError(code, `field must be a string or null`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLen) {
    throw new SellerProfileInputError(
      code,
      `field must be at least ${minLen} char(s)`,
    );
  }
  if (trimmed.length > max) {
    throw new SellerProfileInputError(
      code,
      `field must be <= ${max} chars`,
    );
  }
  return trimmed;
}

// Throws unless `actorSellerId` matches a canonical seller in the
// static `SELLERS` fixture. Fallback / product-only sellers never
// reach this code path; the storefront keeps them marked as fallback.
function assertKnownSeller(actorSellerId: string): Seller {
  if (typeof actorSellerId !== "string" || actorSellerId.length === 0) {
    throw new SellerProfileInputError(
      "actor_id_required",
      "actorSellerId is required",
    );
  }
  const seller = getSellerById(actorSellerId);
  if (!seller) {
    throw new SellerProfileInputError(
      "actor_unknown_seller",
      `seller ${actorSellerId} is not a canonical profile`,
    );
  }
  return seller;
}

// Picks only the two known fields from the caller-supplied patch.
// Any forged extra fields (e.g. `trustScore`, `accountStanding`,
// `sellerId`, `updatedAt`) are silently dropped — they never reach
// persistence.
function projectPatch(patch: SellerProfilePatch): {
  displayName: string | null | undefined;
  publicNote: string | null | undefined;
} {
  return {
    displayName: patch.displayName,
    publicNote: patch.publicNote,
  };
}

export const sellerProfileService = {
  // Seller-owned write. The actor MUST be a canonical seller in the
  // static `SELLERS` list. Loads the existing override (if any),
  // applies the bounded patch, and persists the merged result.
  // Returns the persisted override.
  //
  // Fields that are NOT on `SellerProfilePatch` are silently dropped
  // — the implementation projects only `displayName` and `publicNote`
  // before any validation. A forged patch that tries to set
  // `trustScore`, `accountStanding`, `sellerId`, or `updatedAt`
  // therefore cannot smuggle a value through.
  async updateOwnProfile(
    actorSellerId: string,
    patch: SellerProfilePatch,
  ): Promise<SellerProfileOverride> {
    assertKnownSeller(actorSellerId);

    const projected = projectPatch(patch ?? {});
    if (
      projected.displayName === undefined &&
      projected.publicNote === undefined
    ) {
      throw new SellerProfileInputError(
        "patch_empty",
        "patch must include displayName and/or publicNote",
      );
    }

    const persistence = getPersistence();
    const existing =
      await persistence.getSellerProfileOverride(actorSellerId);

    const nextDisplayName =
      projected.displayName === undefined
        ? existing?.displayName
        : projected.displayName === null
          ? undefined
          : (validateBoundedString(
              projected.displayName,
              DISPLAY_NAME_MAX,
              "display_name_invalid",
              1,
            ) ?? undefined);

    const nextPublicNote =
      projected.publicNote === undefined
        ? existing?.publicNote
        : projected.publicNote === null
          ? undefined
          : (validateBoundedString(
              projected.publicNote,
              PUBLIC_NOTE_MAX,
              "public_note_invalid",
              1,
            ) ?? undefined);

    const next: SellerProfileOverride = {
      sellerId: actorSellerId,
      displayName: nextDisplayName,
      publicNote: nextPublicNote,
      updatedAt: nowIso(),
    };
    await persistence.saveSellerProfileOverride(next);
    return next;
  },

  // Read passthrough. Returns null when no override exists.
  async getOverrideForSeller(
    sellerId: string,
  ): Promise<SellerProfileOverride | null> {
    if (typeof sellerId !== "string" || sellerId.length === 0) return null;
    return getPersistence().getSellerProfileOverride(sellerId);
  },

  // List passthrough — used by the dashboard "전체 비우기" affordance
  // and tests.
  async listOverrides(): Promise<SellerProfileOverride[]> {
    return getPersistence().listSellerProfileOverrides();
  },

  // Composes a `StorefrontProfile` view for canonical sellers. Returns
  // null when the seller id is not in the static `SELLERS` fixture so
  // the storefront can keep its fallback path independent.
  //
  // `effectiveName` falls back to the static fixture name. `effectiveIntro`
  // prefers the override's `publicNote`, then the static `trustNote`,
  // then null (the surface decides whether to render a default intro).
  async getStorefrontProfile(
    sellerId: string,
  ): Promise<StorefrontProfile | null> {
    const seller = getSellerById(sellerId);
    if (!seller) return null;
    const override = await getPersistence().getSellerProfileOverride(sellerId);
    return {
      seller,
      override,
      effectiveName: override?.displayName ?? seller.name,
      effectiveIntro: override?.publicNote ?? seller.trustNote ?? null,
    };
  },

  // Helper exposed for tests + the dashboard so the UI can render the
  // edit affordance only for known canonical sellers. Mirrors
  // `assertKnownSeller` but returns a boolean.
  isKnownSeller(actorSellerId: string): boolean {
    if (typeof actorSellerId !== "string" || actorSellerId.length === 0) {
      return false;
    }
    return SELLERS.some((s) => s.id === actorSellerId);
  },
};
