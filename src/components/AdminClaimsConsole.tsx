"use client";

// Client island for the admin claim review queue. Lives under
// `/admin/claims` and is mounted only after the server component has
// already passed the founder auth gate.
//
// Reads claim reviews + the rentals they reference straight from
// local persistence. Decisions go through `claimReviewService.recordAdminDecision`
// — which validates, persists, and emits a TrustEvent. Recording a
// decision does NOT trigger any payment, deposit, refund, escrow, or
// external notification; this is a placeholder admin layer.
//
// Phase 1.10 — Admin identity boundary:
//
//   - The component takes NO `adminId` prop. The legitimate
//     `decidedBy` value is fetched from `/api/admin/claims/identity`,
//     which re-validates the founder session server-side. A tampered
//     client cannot smuggle a different identity through the legit
//     UI flow because every decision uses the server-returned email.
//   - If the identity fetch fails (404 / network error), the decision
//     buttons stay disabled and a notice explains the gap. Persistence
//     is still local — see the page-level comment for the local-MVP
//     caveat.

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import type { RentalIntent } from "@/domain/intents";
import type { ClaimReview, ClaimReviewStatus } from "@/domain/trust";
import { getPersistence } from "@/lib/adapters/persistence";
import { CLAIM_REVIEW_COPY } from "@/lib/copy/returnTrust";
import {
  ClaimReviewInputError,
  claimReviewService,
} from "@/lib/services/claimReviewService";

function statusLabel(status: ClaimReviewStatus): string {
  switch (status) {
    case "open":
      return CLAIM_REVIEW_COPY.statusOpen;
    case "approved":
      return CLAIM_REVIEW_COPY.statusApproved;
    case "rejected":
      return CLAIM_REVIEW_COPY.statusRejected;
    case "needs_review":
      return CLAIM_REVIEW_COPY.statusNeedsReview;
  }
}

// Server-validated admin identity. Re-fetched per-decision so a
// session that expires mid-session disables further writes.
async function fetchAdminIdentity(): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/claims/identity", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: unknown };
    return typeof json.email === "string" && json.email.length > 0
      ? json.email
      : null;
  } catch {
    return null;
  }
}

export function AdminClaimsConsole() {
  const [reviews, setReviews] = useState<ClaimReview[]>([]);
  const [rentalsById, setRentalsById] = useState<Map<string, RentalIntent>>(
    () => new Map(),
  );
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  // Server-validated admin email. `null` means the identity hasn't
  // been fetched yet (or the fetch failed); decision buttons stay
  // disabled until we get a verified value.
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  const refresh = async () => {
    const list = await claimReviewService.listClaimReviews();
    const persistence = getPersistence();
    const rentals = await persistence.listRentalIntents();
    const map = new Map<string, RentalIntent>();
    for (const r of rentals) map.set(r.id, r);
    setReviews(list);
    setRentalsById(map);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setLoaded(true));
    fetchAdminIdentity().then((email) => {
      setAdminEmail(email);
    });
  }, []);

  // Open queue first, then everything else, each group sorted by
  // openedAt descending. This keeps unresolved work at the top without
  // hiding decided rows from a quick scan.
  const sorted = useMemo(() => {
    const open = reviews.filter(
      (r) => r.status === "open" || r.status === "needs_review",
    );
    const decided = reviews.filter(
      (r) => r.status === "approved" || r.status === "rejected",
    );
    const byOpenedDesc = (a: ClaimReview, b: ClaimReview) =>
      a.openedAt > b.openedAt ? -1 : a.openedAt < b.openedAt ? 1 : 0;
    open.sort(byOpenedDesc);
    decided.sort(byOpenedDesc);
    return [...open, ...decided];
  }, [reviews]);

  const handleDecide = async (
    review: ClaimReview,
    decision: ClaimReviewStatus,
  ) => {
    setBusyId(review.id);
    setToast(null);
    try {
      // Always re-fetch the admin identity per-decision: the founder
      // session may have rotated since the queue was loaded, and
      // every legitimate decision write must derive `decidedBy` from
      // the server-validated session.
      const verifiedEmail = await fetchAdminIdentity();
      if (!verifiedEmail) {
        setAdminEmail(null);
        setToast(
          "관리자 세션이 확인되지 않아요. 로그인 상태를 다시 확인해주세요.",
        );
        return;
      }
      setAdminEmail(verifiedEmail);
      const notes = notesById[review.id];
      await claimReviewService.recordAdminDecision(
        review.id,
        decision,
        verifiedEmail,
        notes && notes.length > 0 ? notes : undefined,
      );
      await refresh();
      setToast(`${statusLabel(decision)} 기록되었습니다.`);
    } catch (e) {
      setToast(
        e instanceof ClaimReviewInputError
          ? "결정을 저장하지 못했어요."
          : "처리하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loaded && sorted.length === 0) {
    return (
      <section className="border border-dashed border-[color:var(--line-dashed)] p-12">
        <p className="text-body text-[color:var(--ink-60)]">
          {CLAIM_REVIEW_COPY.emptyQueue}
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{CLAIM_REVIEW_COPY.pageTitle}</h3>
        <Badge variant="dashed">{sorted.length}건</Badge>
      </header>
      {loaded && !adminEmail ? (
        <div className="px-6 py-3 border-b border-[color:var(--ink-12)] text-small text-[color:var(--ink-60)]">
          관리자 세션을 확인하지 못했어요. 결정 기록은 일시적으로 비활성화됩니다.
        </div>
      ) : null}
      <ul className="flex flex-col">
        {sorted.map((review) => {
          const rental = rentalsById.get(review.rentalIntentId);
          const isOpen =
            review.status === "open" || review.status === "needs_review";
          const notes = notesById[review.id] ?? "";
          return (
            <li
              key={review.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 px-6 py-5 items-start border-t border-[color:var(--ink-12)]"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-body font-medium">
                    {rental?.productName ?? "(rental missing)"}
                  </span>
                  <Badge
                    variant={
                      review.status === "approved"
                        ? "filled"
                        : review.status === "rejected"
                          ? "selected"
                          : "dashed"
                    }
                  >
                    {statusLabel(review.status)}
                  </Badge>
                </div>
                <span className="text-small text-[color:var(--ink-60)]">
                  rental {review.rentalIntentId}
                </span>
                {review.openedReason ? (
                  <span className="text-small text-[color:var(--ink-80)]">
                    {review.openedReason}
                  </span>
                ) : null}
                {review.decidedBy ? (
                  <span className="text-caption text-[color:var(--ink-60)]">
                    {review.decidedBy} · {review.decidedAt}
                  </span>
                ) : null}
                {review.decisionNotes ? (
                  <span className="text-small text-[color:var(--ink-80)]">
                    {review.decisionNotes}
                  </span>
                ) : null}
                {isOpen ? (
                  <label className="flex flex-col gap-1 mt-2 max-w-[480px]">
                    <span className="text-caption text-[color:var(--ink-60)]">
                      {CLAIM_REVIEW_COPY.decisionNotesLabel}
                    </span>
                    <input
                      type="text"
                      value={notes}
                      maxLength={240}
                      placeholder={CLAIM_REVIEW_COPY.decisionNotesPlaceholder}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [review.id]: e.target.value,
                        }))
                      }
                      className="border border-[color:var(--ink-20)] px-3 py-2 text-body"
                    />
                  </label>
                ) : null}
              </div>
              {isOpen ? (
                <div className="flex flex-col items-stretch md:items-end gap-2">
                  <Button
                    size="md"
                    onClick={() => handleDecide(review, "approved")}
                    disabled={busyId === review.id || !adminEmail}
                    type="button"
                  >
                    {CLAIM_REVIEW_COPY.decisionApproveAction}
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => handleDecide(review, "rejected")}
                    disabled={busyId === review.id || !adminEmail}
                    type="button"
                  >
                    {CLAIM_REVIEW_COPY.decisionRejectAction}
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => handleDecide(review, "needs_review")}
                    disabled={busyId === review.id || !adminEmail}
                    type="button"
                  >
                    {CLAIM_REVIEW_COPY.decisionNeedsReviewAction}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="text-small text-[color:var(--ink-60)] border-t border-[color:var(--ink-12)] px-6 py-3"
        >
          {toast}
        </div>
      ) : null}
    </section>
  );
}
