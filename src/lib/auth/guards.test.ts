import { describe, expect, it } from "vitest";
import {
  OwnershipError,
  assertListingOwnedBy,
  assertRentalBorrowerIs,
  assertRentalParty,
  assertRentalSellerIs,
} from "./guards";

const listing = { id: "li_1", sellerId: "seller_jisu" } as const;
const rental = {
  id: "ri_1",
  sellerId: "seller_jisu",
  borrowerId: "borrower_minho",
} as const;

describe("assertListingOwnedBy", () => {
  it("passes when sellerId matches", () => {
    expect(() => assertListingOwnedBy(listing, "seller_jisu")).not.toThrow();
  });
  it("throws OwnershipError when sellerId does not match", () => {
    expect(() => assertListingOwnedBy(listing, "seller_other")).toThrow(
      OwnershipError,
    );
    try {
      assertListingOwnedBy(listing, "seller_other");
    } catch (e) {
      expect((e as OwnershipError).code).toBe("listing_owner_mismatch");
    }
  });
  it("throws when sellerId is empty", () => {
    expect(() => assertListingOwnedBy(listing, "")).toThrow(OwnershipError);
  });
});

describe("assertRentalSellerIs", () => {
  it("passes when sellerId matches", () => {
    expect(() => assertRentalSellerIs(rental, "seller_jisu")).not.toThrow();
  });
  it("throws when borrower tries to act as seller", () => {
    expect(() => assertRentalSellerIs(rental, "borrower_minho")).toThrow(
      OwnershipError,
    );
  });
  it("throws when sellerId is empty", () => {
    expect(() => assertRentalSellerIs(rental, "")).toThrow(OwnershipError);
  });
});

describe("assertRentalBorrowerIs", () => {
  it("passes when borrowerId matches", () => {
    expect(() => assertRentalBorrowerIs(rental, "borrower_minho")).not.toThrow();
  });
  it("throws when seller tries to act as borrower", () => {
    expect(() => assertRentalBorrowerIs(rental, "seller_jisu")).toThrow(
      OwnershipError,
    );
  });
  it("throws when borrowerId is empty", () => {
    expect(() => assertRentalBorrowerIs(rental, "")).toThrow(OwnershipError);
  });
});

describe("assertRentalParty", () => {
  it("passes for the seller", () => {
    expect(() => assertRentalParty(rental, "seller_jisu")).not.toThrow();
  });
  it("passes for the borrower", () => {
    expect(() => assertRentalParty(rental, "borrower_minho")).not.toThrow();
  });
  it("throws for an unrelated user", () => {
    expect(() => assertRentalParty(rental, "stranger")).toThrow(OwnershipError);
    try {
      assertRentalParty(rental, "stranger");
    } catch (e) {
      expect((e as OwnershipError).code).toBe("rental_party_mismatch");
    }
  });
  it("throws when userId is empty", () => {
    expect(() => assertRentalParty(rental, "")).toThrow(OwnershipError);
  });
});
