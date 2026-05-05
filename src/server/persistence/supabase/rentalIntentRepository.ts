// Phase 2 server-only rental-intent repository. Maps `rental_intents`
// rows to/from `RentalIntent` and appends to `rental_events` on every
// state-changing write.
//
// Hard rules:
//   - Server-only.
//   - Never trusts caller-supplied status, amounts, or borrower/seller IDs.
//   - Append-only events: this module never updates or deletes from
//     `rental_events`.
//   - Phase 2 does NOT execute payment, deposit, or settlement money
//     movement. The columns exist; the values are recorded as the
//     in-memory state machine produced them, and the schema permits
//     the in-state strings.

import type { RentalEvent, RentalIntent } from "@/domain/intents";
import { getMarketplaceClient } from "./client";
import {
  validateBoundedText,
  validateCategory,
  validateDisplayName,
  validateDurationDays,
  validateOptionalUuid,
  validatePrice,
  validateRentalStatus,
  validateRequiredText,
  validateUuid,
} from "./validators";

type RentalIntentRow = {
  id: string;
  listing_id: string;
  seller_id: string;
  borrower_id: string | null;
  borrower_display_name: string | null;
  seller_display_name: string | null;
  product_name: string;
  product_category: string;
  status: RentalIntent["status"];
  duration_days: number;
  rental_fee: number;
  safety_deposit: number;
  platform_fee: number;
  seller_payout: number;
  borrower_total: number;
  payment_provider: string;
  payment_session_id: string | null;
  payment_status: string;
  payment_failure_reason: string | null;
  pickup_method: string;
  pickup_status: string;
  pickup_location_label: string | null;
  return_status: string;
  return_due_at: string | null;
  return_confirmed_at: string | null;
  settlement_status: string;
  settlement_blocked_reason: string | null;
  settlement_settled_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToIntent(r: RentalIntentRow): RentalIntent {
  return {
    id: r.id,
    productId: r.listing_id,
    productName: r.product_name,
    productCategory: r.product_category as RentalIntent["productCategory"],
    sellerId: r.seller_id,
    sellerName: r.seller_display_name ?? "",
    borrowerId: r.borrower_id ?? undefined,
    borrowerName: r.borrower_display_name ?? undefined,
    status: r.status,
    durationDays: r.duration_days as RentalIntent["durationDays"],
    amounts: {
      rentalFee: r.rental_fee,
      safetyDeposit: r.safety_deposit,
      platformFee: r.platform_fee,
      sellerPayout: r.seller_payout,
      borrowerTotal: r.borrower_total,
    },
    payment: {
      provider: r.payment_provider as RentalIntent["payment"]["provider"],
      sessionId: r.payment_session_id ?? undefined,
      status: r.payment_status as RentalIntent["payment"]["status"],
      failureReason: r.payment_failure_reason ?? undefined,
    },
    pickup: {
      method: "direct",
      status: r.pickup_status as RentalIntent["pickup"]["status"],
      locationLabel: r.pickup_location_label ?? undefined,
    },
    return: {
      status: r.return_status as RentalIntent["return"]["status"],
      dueAt: r.return_due_at ?? undefined,
      confirmedAt: r.return_confirmed_at ?? undefined,
    },
    settlement: {
      status: r.settlement_status as RentalIntent["settlement"]["status"],
      sellerPayout: r.seller_payout,
      blockedReason: r.settlement_blocked_reason ?? undefined,
      settledAt: r.settlement_settled_at ?? undefined,
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getRentalIntentById(
  id: string,
): Promise<RentalIntent | null> {
  const idRes = validateUuid(id);
  if (!idRes.ok) return null;
  const client = getMarketplaceClient();
  if (!client) return null;
  const { data, error } = await client
    .from("rental_intents")
    .select("*")
    .eq("id", idRes.value)
    .maybeSingle();
  if (error || !data) return null;
  return rowToIntent(data as unknown as RentalIntentRow);
}

export async function listRentalIntents(limit = 50): Promise<RentalIntent[]> {
  const client = getMarketplaceClient();
  if (!client) return [];
  const safe = Math.max(1, Math.min(200, Math.floor(limit)));
  const { data, error } = await client
    .from("rental_intents")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(safe);
  if (error || !data) return [];
  return data.map((r) => rowToIntent(r as unknown as RentalIntentRow));
}

// Bundle 2, Slice 3 — server-only seller scoping read.
//
// Lists every `rental_intents` row owned by a single seller for the
// seller dashboard's server-mode requests block. The action layer is
// the authorization gate (it filters by `actor.sellerId`, never a
// client-supplied id). This repo function is the persistence-side
// belt:
//
//   - validates the seller id as a uuid; returns `[]` on a malformed
//     value or when the marketplace client is unavailable;
//   - filters by `seller_id` server-side via the Postgres `eq`
//     predicate — a foreign row is impossible even if the action
//     layer is bypassed;
//   - does NOT join `listing_secrets`, payment session ids,
//     settlement timestamps, or any private slot beyond what
//     `rowToIntent` already maps;
//   - bounded by `limit` (clamped to `[1, 200]`) to keep the query
//     cheap and the response time bounded.
//
// The repo does NOT filter by `status`. The seller dashboard surface
// surfaces every state ('requested' today; future slices may add
// 'seller_approved' / 'cancelled' etc.). The action layer chooses
// what to project; this function is the raw read.
export async function listRentalIntentsBySeller(
  sellerId: string,
  limit = 100,
): Promise<RentalIntent[]> {
  const idRes = validateUuid(sellerId);
  if (!idRes.ok) return [];
  const client = getMarketplaceClient();
  if (!client) return [];
  const safe = Math.max(1, Math.min(200, Math.floor(limit)));
  const { data, error } = await client
    .from("rental_intents")
    .select("*")
    .eq("seller_id", idRes.value)
    .order("updated_at", { ascending: false })
    .limit(safe);
  if (error || !data) return [];
  return data.map((r) => rowToIntent(r as unknown as RentalIntentRow));
}

export type SaveRentalResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function saveRentalIntent(
  intent: RentalIntent,
): Promise<SaveRentalResult> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const idRes = validateUuid(intent.id);
  if (!idRes.ok) return { ok: false, error: `id: ${idRes.error}` };
  const listingIdRes = validateUuid(intent.productId);
  if (!listingIdRes.ok) return { ok: false, error: `listing_id: ${listingIdRes.error}` };
  const sellerIdRes = validateUuid(intent.sellerId);
  if (!sellerIdRes.ok) return { ok: false, error: `seller_id: ${sellerIdRes.error}` };
  const borrowerIdRes = validateOptionalUuid(intent.borrowerId ?? null);
  if (!borrowerIdRes.ok) return { ok: false, error: `borrower_id: ${borrowerIdRes.error}` };
  const statusRes = validateRentalStatus(intent.status);
  if (!statusRes.ok) return { ok: false, error: statusRes.error };
  const durRes = validateDurationDays(intent.durationDays);
  if (!durRes.ok) return { ok: false, error: durRes.error };
  const productNameRes = validateRequiredText(intent.productName, "product_name", 80);
  if (!productNameRes.ok) return { ok: false, error: productNameRes.error };
  const productCategoryRes = validateCategory(intent.productCategory);
  if (!productCategoryRes.ok) return { ok: false, error: productCategoryRes.error };

  const fee = validatePrice(intent.amounts.rentalFee, "rental_fee");
  if (!fee.ok) return { ok: false, error: fee.error };
  const dep = validatePrice(intent.amounts.safetyDeposit, "safety_deposit");
  if (!dep.ok) return { ok: false, error: dep.error };
  const plat = validatePrice(intent.amounts.platformFee, "platform_fee");
  if (!plat.ok) return { ok: false, error: plat.error };
  const payout = validatePrice(intent.amounts.sellerPayout, "seller_payout");
  if (!payout.ok) return { ok: false, error: payout.error };
  const total = validatePrice(intent.amounts.borrowerTotal, "borrower_total");
  if (!total.ok) return { ok: false, error: total.error };

  const sellerNameRes = validateDisplayName(intent.sellerName ?? null);
  if (!sellerNameRes.ok) return { ok: false, error: sellerNameRes.error };
  const borrowerNameRes = validateDisplayName(intent.borrowerName ?? null);
  if (!borrowerNameRes.ok) return { ok: false, error: borrowerNameRes.error };
  const pickupLocRes = validateBoundedText(
    intent.pickup.locationLabel ?? null,
    "pickup_location_label",
    60,
    false,
  );
  if (!pickupLocRes.ok) return { ok: false, error: pickupLocRes.error };
  const failReasonRes = validateBoundedText(
    intent.payment.failureReason ?? null,
    "payment_failure_reason",
    240,
    false,
  );
  if (!failReasonRes.ok) return { ok: false, error: failReasonRes.error };
  const sessionIdRes = validateBoundedText(
    intent.payment.sessionId ?? null,
    "payment_session_id",
    80,
    false,
  );
  if (!sessionIdRes.ok) return { ok: false, error: sessionIdRes.error };
  const blockedReasonRes = validateBoundedText(
    intent.settlement.blockedReason ?? null,
    "settlement_blocked_reason",
    240,
    false,
  );
  if (!blockedReasonRes.ok) return { ok: false, error: blockedReasonRes.error };

  const payload = {
    id: idRes.value,
    listing_id: listingIdRes.value,
    seller_id: sellerIdRes.value,
    borrower_id: borrowerIdRes.value,
    borrower_display_name: borrowerNameRes.value,
    seller_display_name: sellerNameRes.value,
    product_name: productNameRes.value,
    product_category: productCategoryRes.value,
    status: statusRes.value,
    duration_days: durRes.value,
    rental_fee: fee.value,
    safety_deposit: dep.value,
    platform_fee: plat.value,
    seller_payout: payout.value,
    borrower_total: total.value,
    payment_provider: intent.payment.provider === "toss" ? "toss" : "mock",
    payment_session_id: sessionIdRes.value,
    payment_status: intent.payment.status,
    payment_failure_reason: failReasonRes.value,
    pickup_method: "direct",
    pickup_status: intent.pickup.status,
    pickup_location_label: pickupLocRes.value,
    return_status: intent.return.status,
    return_due_at: intent.return.dueAt ?? null,
    return_confirmed_at: intent.return.confirmedAt ?? null,
    settlement_status: intent.settlement.status,
    settlement_blocked_reason: blockedReasonRes.value,
    settlement_settled_at: intent.settlement.settledAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const upsert = await client
    .from("rental_intents")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .maybeSingle();
  if (upsert.error || !upsert.data) {
    return { ok: false, error: upsert.error?.message ?? "rental upsert failed" };
  }
  return { ok: true, id: idRes.value };
}

export async function appendRentalEvent(event: RentalEvent): Promise<{ ok: boolean; error?: string }> {
  const client = getMarketplaceClient();
  if (!client) return { ok: false, error: "supabase client unavailable" };

  const idRes = validateUuid(event.id);
  if (!idRes.ok) return { ok: false, error: `id: ${idRes.error}` };
  const intentIdRes = validateUuid(event.rentalIntentId);
  if (!intentIdRes.ok) return { ok: false, error: `rental_intent_id: ${intentIdRes.error}` };
  const toRes = validateRentalStatus(event.toStatus);
  if (!toRes.ok) return { ok: false, error: `to_status: ${toRes.error}` };
  if (event.fromStatus !== null) {
    const fromRes = validateRentalStatus(event.fromStatus);
    if (!fromRes.ok) return { ok: false, error: `from_status: ${fromRes.error}` };
  }
  const reasonRes = validateBoundedText(event.reason ?? null, "reason", 240, false);
  if (!reasonRes.ok) return { ok: false, error: reasonRes.error };

  // metadata: shallow object only; reject anything that is not a plain
  // object. The DB also CHECKs jsonb_typeof = 'object'.
  const metadata: Record<string, string | number | boolean | null> = {};
  if (event.metadata) {
    if (typeof event.metadata !== "object" || Array.isArray(event.metadata)) {
      return { ok: false, error: "metadata must be a plain object" };
    }
    for (const [k, v] of Object.entries(event.metadata)) {
      if (k.length > 60) return { ok: false, error: "metadata key too long" };
      if (
        v !== null &&
        typeof v !== "string" &&
        typeof v !== "number" &&
        typeof v !== "boolean"
      ) {
        return { ok: false, error: "metadata value type not allowed" };
      }
      if (typeof v === "string" && v.length > 240) {
        return { ok: false, error: "metadata string value too long" };
      }
      metadata[k] = v;
    }
  }

  const allowedActor = event.actor ?? null;
  if (
    allowedActor !== null &&
    allowedActor !== "system" &&
    allowedActor !== "seller" &&
    allowedActor !== "borrower" &&
    allowedActor !== "admin"
  ) {
    return { ok: false, error: "actor not allowed" };
  }

  const insert = await client.from("rental_events").insert({
    id: idRes.value,
    rental_intent_id: intentIdRes.value,
    from_status: event.fromStatus,
    to_status: toRes.value,
    at: event.at,
    reason: reasonRes.value,
    actor: allowedActor,
    metadata,
  });
  if (insert.error) {
    return { ok: false, error: insert.error.message ?? "rental event insert failed" };
  }
  return { ok: true };
}

export async function countRentalIntentsByStatus(): Promise<
  Record<string, number>
> {
  const client = getMarketplaceClient();
  if (!client) return {};
  const { data, error } = await client
    .from("rental_intents")
    .select("status")
    .limit(50_000);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const r of data as { status: string }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  return counts;
}

export async function listRentalEvents(rentalIntentId: string): Promise<RentalEvent[]> {
  const idRes = validateUuid(rentalIntentId);
  if (!idRes.ok) return [];
  const client = getMarketplaceClient();
  if (!client) return [];
  const { data, error } = await client
    .from("rental_events")
    .select("*")
    .eq("rental_intent_id", idRes.value)
    .order("at", { ascending: true })
    .limit(1000);
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    rental_intent_id: string;
    from_status: RentalEvent["fromStatus"];
    to_status: RentalEvent["toStatus"];
    at: string;
    reason: string | null;
    actor: RentalEvent["actor"] | null;
    metadata: Record<string, string | number | boolean | null>;
  }>).map((r) => ({
    id: r.id,
    rentalIntentId: r.rental_intent_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    at: r.at,
    reason: r.reason ?? undefined,
    actor: r.actor ?? undefined,
    metadata: r.metadata ?? undefined,
  }));
}
