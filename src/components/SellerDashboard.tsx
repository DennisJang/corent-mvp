"use client";

// Functional seller dashboard. Reads RentalIntents + listings from
// persistence (mock fallback when empty), then derives all displayed
// numbers via dashboardService. Includes a "demo: 모의 대여 채우기" button
// that seeds local state with the prepared mock fixtures so the page never
// looks empty during a fresh review.

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ChatToListingIntakeCard } from "@/components/ChatToListingIntakeCard";
import { SellerDashboardStat } from "@/components/SellerDashboardStat";
import { SellerProfileEditCard } from "@/components/SellerProfileEditCard";
import { IntentStatusBadge, statusLabel } from "@/components/intent/IntentStatusBadge";
import type { ListingIntent, RentalIntent } from "@/domain/intents";
import { isFailureStatus } from "@/domain/intents";
import {
  EMPTY_USER_TRUST_SUMMARY,
  hasVisibleTrustHistory,
  type ClaimWindow,
  type HandoffPhase,
  type HandoffRecord,
  type UserTrustSummary,
} from "@/domain/trust";
import { CURRENT_SELLER } from "@/data/mockSellers";
import { MOCK_RENTAL_INTENTS } from "@/data/mockRentalIntents";
import { LISTED_ITEMS, type ListedItem } from "@/data/dashboard";
import { OwnershipError } from "@/lib/auth/guards";
import { getMockSellerSession } from "@/lib/auth/mockSession";
import { getPersistence } from "@/lib/adapters/persistence";
import { handoffService } from "@/lib/services/handoffService";
import { rentalService } from "@/lib/services/rentalService";
import { listingService } from "@/lib/services/listingService";
import { trustEventService } from "@/lib/services/trustEvents";
import {
  ClaimReviewInputError,
  claimReviewService,
} from "@/lib/services/claimReviewService";
import {
  APPROVAL_COPY,
  CLAIM_WINDOW_COPY,
  HANDOFF_RITUAL_COPY,
  TRUST_SUMMARY_COPY,
  formatHandoffProgress,
} from "@/lib/copy/returnTrust";
import {
  activeRentalRows,
  deriveDashboardSummary,
  failureRows,
  pendingRequestRows,
  relativeTime,
} from "@/lib/services/dashboardService";
import { formatKRW } from "@/lib/format";

// Maps a rental status to the natural handoff phase. Returns `null`
// for statuses outside the handoff window. Phase 1.3 surfaces show
// pickup checks while a paid rental hasn't been picked up, and return
// checks while a return is pending.
function handoffPhaseForStatus(
  status: RentalIntent["status"],
): HandoffPhase | null {
  if (status === "paid" || status === "pickup_confirmed") return "pickup";
  if (status === "return_pending" || status === "return_confirmed")
    return "return";
  return null;
}

function handoffMapKey(rentalIntentId: string, phase: HandoffPhase): string {
  return `${rentalIntentId}:${phase}`;
}

export function SellerDashboard() {
  const [rentals, setRentals] = useState<RentalIntent[]>([]);
  const [listings, setListings] = useState<ListingIntent[]>([]);
  const [handoffByKey, setHandoffByKey] = useState<Map<string, HandoffRecord>>(
    () => new Map(),
  );
  const [trustSummary, setTrustSummary] = useState<UserTrustSummary>(() => ({
    userId: CURRENT_SELLER.id,
    ...EMPTY_USER_TRUST_SUMMARY,
  }));
  const [claimWindowByRental, setClaimWindowByRental] = useState<
    Map<string, ClaimWindow>
  >(() => new Map());
  // Settlement-block reasons keyed by rental id. Populated alongside
  // the claim windows on every refresh so the active block can hide
  // the "다음 단계 진행 →" affordance when the gate would reject the
  // call. Absent entry = no block.
  const [settlementBlockByRental, setSettlementBlockByRental] = useState<
    Map<string, "claim_window_open" | "claim_review_missing" | "claim_review_unresolved">
  >(() => new Map());
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Mock-only session. Real per-user authentication is documented in
  // docs/mvp_security_guardrails.md §1; this constant is the migration
  // site that becomes a server-resolved session id.
  const session = getMockSellerSession();

  const refresh = async () => {
    const r = await rentalService.list();
    const l = await listingService.list();
    setRentals(r);
    setListings(l);
    // Load handoff records for every handoff-eligible rental owned by
    // this seller. The Map is keyed by `${rentalIntentId}:${phase}` so
    // surface code can look up O(1) per row.
    const next = new Map<string, HandoffRecord>();
    for (const rental of r) {
      if (rental.sellerId !== CURRENT_SELLER.id) continue;
      const phase = handoffPhaseForStatus(rental.status);
      if (!phase) continue;
      const rec = await rentalService.getHandoffRecord(rental.id, phase);
      if (rec) next.set(handoffMapKey(rental.id, phase), rec);
    }
    setHandoffByKey(next);
    // Phase 1.4: count-only trust history. The summarizer never
    // changes accountStanding automatically — that is admin-driven
    // in a future PR.
    setTrustSummary(
      await trustEventService.summarizeUserTrust(session.sellerId),
    );
    // Phase 1.5: claim windows for the seller's post-return rentals.
    // The window is opened automatically by `confirmReturn`; the
    // dashboard reads it back so the seller can decide between
    // "정상 반납으로 마무리" and "상태 문제 보고".
    const claimByRental = new Map<string, ClaimWindow>();
    const blockByRental = new Map<
      string,
      "claim_window_open" | "claim_review_missing" | "claim_review_unresolved"
    >();
    for (const rental of r) {
      if (rental.sellerId !== CURRENT_SELLER.id) continue;
      const cw = await claimReviewService.getClaimWindowForRental(rental.id);
      if (cw) claimByRental.set(rental.id, cw);
      const reason = await rentalService.settlementBlockReason(rental.id);
      if (reason) blockByRental.set(rental.id, reason);
    }
    setClaimWindowByRental(claimByRental);
    setSettlementBlockByRental(blockByRental);
  };

  // Read persisted state once on mount. Effect-setState is intentional —
  // localStorage is an external system and Next/React's data-fetch hooks
  // aren't available without a server route here. The empty deps array
  // is intentional too: `refresh` closes over only the mock session
  // (which is stable per-render in MVP) and per-call persistence reads.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter to the current seller's rentals only. Without this, a borrower
  // who created a request for another seller's product would show up on
  // this dashboard. The mock fixtures all belong to CURRENT_SELLER, so the
  // filter is a no-op for them.
  const myRentals = useMemo(
    () => rentals.filter((r) => r.sellerId === CURRENT_SELLER.id),
    [rentals],
  );
  const myListings = useMemo(
    () => listings.filter((l) => l.sellerId === CURRENT_SELLER.id),
    [listings],
  );

  // If localStorage has nothing for this seller, fall back to mock fixtures
  // so the dashboard always has something to render.
  const effectiveRentals = useMemo(
    () => (myRentals.length === 0 ? MOCK_RENTAL_INTENTS : myRentals),
    [myRentals],
  );

  const summary = useMemo(
    () => deriveDashboardSummary(effectiveRentals, myListings),
    [effectiveRentals, myListings],
  );

  const pending = useMemo(
    () => pendingRequestRows(effectiveRentals),
    [effectiveRentals],
  );
  const active = useMemo(
    () => activeRentalRows(effectiveRentals),
    [effectiveRentals],
  );
  const failures = useMemo(
    () => failureRows(effectiveRentals),
    [effectiveRentals],
  );

  // Visibility logic uses `hasVisibleTrustHistory` from
  // `@/domain/trust` so the dashboard and the public storefront cannot
  // drift on what counts as "trust history exists". Hidden metrics
  // (`disputesOpened`, `damageReportsAgainst`) are excluded so the
  // section never appears with all-zero visible tiles just because of
  // a hidden count.
  const trustSummaryHasContent = useMemo(
    () => hasVisibleTrustHistory(trustSummary),
    [trustSummary],
  );

  // Claim rows: REAL persisted rentals only with an opened claim
  // window. Like the handoff block, this never renders against the
  // mock-fallback fixtures, since the orchestrator would reject
  // closing a window that isn't persisted.
  const claimRows = useMemo(() => {
    const rows: Array<{ intent: RentalIntent; window: ClaimWindow }> = [];
    for (const rental of myRentals) {
      const w = claimWindowByRental.get(rental.id);
      if (w) rows.push({ intent: rental, window: w });
    }
    return rows;
  }, [myRentals, claimWindowByRental]);

  // Handoff rows derive from the seller's REAL rentals only — the
  // mock fallback set is not persisted, so rendering an interactive
  // "판매자 확인" button against it would 404 inside
  // `recordSellerHandoff` (the rental id wouldn't be in storage).
  const handoffRows = useMemo(() => {
    const rows: Array<{
      intent: RentalIntent;
      phase: HandoffPhase;
      record: HandoffRecord | null;
    }> = [];
    for (const rental of myRentals) {
      const phase = handoffPhaseForStatus(rental.status);
      if (!phase) continue;
      rows.push({
        intent: rental,
        phase,
        record: handoffByKey.get(handoffMapKey(rental.id, phase)) ?? null,
      });
    }
    return rows;
  }, [myRentals, handoffByKey]);

  const seedMockData = async () => {
    const store = getPersistence();
    // Mock IDs are stable, so re-seeding overwrites instead of duplicating.
    for (const r of MOCK_RENTAL_INTENTS) await store.saveRentalIntent(r);
    await refresh();
  };

  const clearLocal = async () => {
    // Single call wipes every CoRent MVP key — rentals, listings, search
    // intents, and the lifecycle event log.
    await getPersistence().clearAll();
    await refresh();
  };

  const handleApprove = async (intent: RentalIntent) => {
    setBusyId(intent.id);
    setToast(null);
    try {
      await rentalService.approveRequest(intent, session.sellerId);
      await refresh();
      setToast(APPROVAL_COPY.approveSuccess);
    } catch (e) {
      // OwnershipError = the actor is not the rental's seller. Don't
      // leak the rental id to the user; the developer message is
      // sufficient for the dashboard's failure surface.
      setToast(
        e instanceof OwnershipError
          ? "이 요청에 대한 권한이 없어요."
          : "요청을 처리하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeclineSeller = async (intent: RentalIntent) => {
    setBusyId(intent.id);
    setToast(null);
    try {
      await rentalService.declineRequest(intent, session.sellerId);
      await refresh();
      setToast(APPROVAL_COPY.declineSuccess);
    } catch (e) {
      setToast(
        e instanceof OwnershipError
          ? "이 요청에 대한 권한이 없어요."
          : "요청을 처리하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  };

  // Compact "one button confirms all five" pickup/return action. The
  // patch sets every checklist item to true and the orchestrator
  // flips `confirmedBySeller`. A future PR can replace this with a
  // per-item editor; the data shape already supports both.
  const handleSellerHandoff = async (
    intent: RentalIntent,
    phase: HandoffPhase,
  ) => {
    setBusyId(intent.id);
    setToast(null);
    try {
      const next = await rentalService.recordSellerHandoff(
        intent.id,
        phase,
        session.sellerId,
        {
          checks: {
            mainUnit: true,
            components: true,
            working: true,
            appearance: true,
            preexisting: true,
          },
        },
      );
      setHandoffByKey((prev) => {
        const m = new Map(prev);
        m.set(handoffMapKey(intent.id, phase), next);
        return m;
      });
      setToast(
        phase === "pickup"
          ? "픽업 체크를 기록했어요."
          : "반납 체크를 기록했어요.",
      );
    } catch (e) {
      setToast(
        e instanceof OwnershipError
          ? "이 요청에 대한 권한이 없어요."
          : "체크 기록을 저장하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCloseNoClaim = async (intent: RentalIntent) => {
    setBusyId(intent.id);
    setToast(null);
    try {
      const next = await claimReviewService.closeClaimWindowAsNoClaim(
        intent.id,
        session.sellerId,
      );
      setClaimWindowByRental((prev) => {
        const m = new Map(prev);
        m.set(intent.id, next);
        return m;
      });
      setToast(CLAIM_WINDOW_COPY.closedNoClaim);
    } catch (e) {
      setToast(
        e instanceof OwnershipError
          ? "이 요청에 대한 권한이 없어요."
          : e instanceof ClaimReviewInputError
            ? "상태를 변경할 수 없어요."
            : "처리하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenClaim = async (intent: RentalIntent, reason?: string) => {
    setBusyId(intent.id);
    setToast(null);
    try {
      const { window: next } = await claimReviewService.openClaim(
        intent.id,
        session.sellerId,
        reason,
      );
      setClaimWindowByRental((prev) => {
        const m = new Map(prev);
        m.set(intent.id, next);
        return m;
      });
      setToast(CLAIM_WINDOW_COPY.closedWithClaim);
    } catch (e) {
      setToast(
        e instanceof OwnershipError
          ? "이 요청에 대한 권한이 없어요."
          : e instanceof ClaimReviewInputError
            ? "상태를 변경할 수 없어요."
            : "처리하지 못했어요.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvance = async (intent: RentalIntent) => {
    setBusyId(intent.id);
    try {
      switch (intent.status) {
        case "seller_approved":
          await rentalService.startPayment(intent);
          break;
        case "payment_pending":
          await rentalService.confirmPayment(intent);
          break;
        case "paid":
          await rentalService.confirmPickup(intent);
          break;
        case "pickup_confirmed":
          await rentalService.startReturn(intent);
          break;
        case "return_pending":
          await rentalService.confirmReturn(intent);
          break;
        case "return_confirmed":
          await rentalService.readySettlement(intent);
          break;
        case "settlement_ready":
          await rentalService.settle(intent);
          break;
      }
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const isUsingMockFallback = myRentals.length === 0 && loaded;

  return (
    <>
      <section className="border-b border-black">
        <div className="container-dashboard py-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <div className="flex flex-col gap-6 max-w-[640px]">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Seller Ledger</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  {CURRENT_SELLER.name} / Seoul
                </span>
              </div>
              <h1 className="text-h1">
                안녕하세요, {CURRENT_SELLER.name} 님.
                <br />
                이번 달도 차분하게.
              </h1>
              <p className="text-body text-[color:var(--ink-60)] max-w-[480px]">
                대여 요청, 인계, 반납, 클레임 검토 흐름만 확인하면 돼요.
                베타에서는 실제 결제·정산·환불이 진행되지 않아요.
              </p>
              {isUsingMockFallback ? (
                <div className="border border-dashed border-[color:var(--line-dashed)] px-4 py-3 text-small flex items-center justify-between gap-4">
                  <span className="text-[color:var(--ink-60)]">
                    로컬 데이터가 비어 있어 모의 데이터를 보여주고 있어요.
                  </span>
                  <button
                    type="button"
                    onClick={seedMockData}
                    className="text-caption underline"
                  >
                    모의 대여 채우기
                  </button>
                </div>
              ) : (
                <div className="flex gap-3 text-caption">
                  <button
                    type="button"
                    onClick={clearLocal}
                    className="text-[color:var(--ink-60)] underline"
                  >
                    로컬 데이터 비우기
                  </button>
                  <button
                    type="button"
                    onClick={seedMockData}
                    className="text-[color:var(--ink-60)] underline"
                  >
                    모의 대여 추가
                  </button>
                </div>
              )}
            </div>
            <Button href="/sell">새 물건 등록하기</Button>
          </div>
        </div>
      </section>

      <section className="border-b border-black">
        <div className="container-dashboard">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-l border-[color:var(--ink-12)]">
            <SellerDashboardStat
              index={0}
              label="이번 달 누적 (참고용)"
              value={formatKRW(summary.monthlyEarnings)}
              hint={`참고용 합계 ${formatKRW(summary.pendingSettlement)} · 베타: 실지급 없음`}
            />
            <SellerDashboardStat
              index={1}
              label="활성 대여"
              value={`${summary.activeRentals}`}
              hint={`${summary.returnsDueSoon}건 곧 반납`}
            />
            <SellerDashboardStat
              index={2}
              label="대기 중인 요청"
              value={`${summary.pendingRequests}`}
              hint="응답이 빠를수록 매칭이 잘 돼요"
            />
            <SellerDashboardStat
              index={3}
              label="신뢰도"
              value={`${CURRENT_SELLER.trustScore.toFixed(1)}`}
              hint={`5.0 만점 · 리뷰 ${CURRENT_SELLER.reviewCount}건`}
            />
          </div>
        </div>
      </section>

      <section className="border-b border-black">
        <div className="container-dashboard py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-7 flex flex-col gap-3">
              <PendingBlock
                rows={pending}
                busyId={busyId}
                onApprove={handleApprove}
                onDecline={handleDeclineSeller}
                showRelativeTime={loaded}
              />
              {toast ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
                >
                  {toast}
                </span>
              ) : null}
            </div>
            <div className="col-span-12 md:col-span-5">
              <ActiveBlock
                rows={active}
                busyId={busyId}
                onAdvance={handleAdvance}
                settlementBlockByRental={settlementBlockByRental}
              />
            </div>
          </div>
        </div>
      </section>

      {trustSummaryHasContent ? (
        <section className="border-b border-black">
          <div className="container-dashboard py-12">
            <TrustSummaryBlock summary={trustSummary} />
          </div>
        </section>
      ) : null}

      <section className="border-b border-black">
        <div className="container-dashboard py-12">
          <SellerProfileEditCard
            sellerId={session.sellerId}
            fallbackName={CURRENT_SELLER.name}
            fallbackIntro={CURRENT_SELLER.trustNote}
          />
        </div>
      </section>

      <section className="border-b border-black">
        <div className="container-dashboard py-12">
          <ChatToListingIntakeCard
            sellerId={session.sellerId}
            onDraftCreated={() => {
              void refresh();
            }}
          />
        </div>
      </section>

      {handoffRows.length > 0 ? (
        <section className="border-b border-black">
          <div className="container-dashboard py-16">
            <HandoffBlock
              rows={handoffRows}
              busyId={busyId}
              onConfirm={handleSellerHandoff}
            />
          </div>
        </section>
      ) : null}

      {claimRows.length > 0 ? (
        <section className="border-b border-black">
          <div className="container-dashboard py-16">
            <ClaimWindowBlock
              rows={claimRows}
              busyId={busyId}
              onCloseNoClaim={handleCloseNoClaim}
              onOpenClaim={handleOpenClaim}
            />
          </div>
        </section>
      ) : null}

      {failures.length > 0 ? (
        <section className="border-b border-black">
          <div className="container-dashboard py-16">
            <FailureBlock rows={failures} />
          </div>
        </section>
      ) : null}

      <section>
        <div className="container-dashboard py-16">
          <div className="flex items-baseline justify-between border-b border-black pb-4 mb-6">
            <h3 className="text-title">등록된 물건</h3>
            <span className="text-caption text-[color:var(--ink-60)]">
              {LISTED_ITEMS.length + listings.length} items
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-caption text-[color:var(--ink-60)]">
                  <th className="py-3 pr-6 font-medium">물건</th>
                  <th className="py-3 pr-6 font-medium">상태</th>
                  <th className="py-3 pr-6 font-medium text-right">조회</th>
                  <th className="py-3 pl-6 font-medium text-right">
                    이번 달 대여
                  </th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-[color:var(--ink-12)]"
                  >
                    <td className="py-5 pr-6 text-body">{l.item.name}</td>
                    <td className="py-5 pr-6">
                      <ListingStatusBadge status={l.status} />
                    </td>
                    <td className="py-5 pr-6 text-body text-right tabular-nums">
                      —
                    </td>
                    <td className="py-5 pl-6 text-body text-right tabular-nums">
                      —
                    </td>
                  </tr>
                ))}
                {LISTED_ITEMS.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[color:var(--ink-12)]"
                  >
                    <td className="py-5 pr-6 text-body">{item.productName}</td>
                    <td className="py-5 pr-6">
                      <ListedStatusBadge status={item.status} />
                    </td>
                    <td className="py-5 pr-6 text-body text-right tabular-nums">
                      {item.views}
                    </td>
                    <td className="py-5 pl-6 text-body text-right tabular-nums">
                      {item.rentalsThisMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-black pt-6 mt-6 flex justify-end">
            <Button href="/sell" variant="secondary" size="md">
              새 물건 등록
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function PendingBlock({
  rows,
  busyId,
  onApprove,
  onDecline,
  showRelativeTime,
}: {
  rows: RentalIntent[];
  busyId: string | null;
  onApprove: (r: RentalIntent) => void;
  onDecline: (r: RentalIntent) => void;
  showRelativeTime: boolean;
}) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">대기 중인 대여 요청</h3>
        <Badge variant="dashed">{rows.length}건</Badge>
      </header>
      {rows.length === 0 ? (
        <div className="px-6 py-8 text-small text-[color:var(--ink-60)]">
          대기 중인 요청이 없어요.
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={`grid grid-cols-[60px_1fr_auto] gap-6 px-6 py-5 items-center ${
                i !== rows.length - 1
                  ? "border-b border-[color:var(--ink-12)]"
                  : ""
              }`}
            >
              <span className="text-caption text-[color:var(--ink-60)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium">{r.productName}</span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {r.borrowerName ?? "익명"} · {r.durationDays}일 ·{" "}
                  {formatKRW(r.amounts.borrowerTotal)}
                  {showRelativeTime ? ` · ${relativeTime(r.createdAt)}` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => onDecline(r)}
                  disabled={busyId === r.id}
                  type="button"
                >
                  거절
                </Button>
                <Button
                  size="md"
                  onClick={() => onApprove(r)}
                  disabled={busyId === r.id}
                  type="button"
                >
                  승인
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActiveBlock({
  rows,
  busyId,
  onAdvance,
  settlementBlockByRental,
}: {
  rows: RentalIntent[];
  busyId: string | null;
  onAdvance: (r: RentalIntent) => void;
  settlementBlockByRental: Map<
    string,
    "claim_window_open" | "claim_review_missing" | "claim_review_unresolved"
  >;
}) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">활성 대여</h3>
        <span className="text-caption text-[color:var(--ink-60)]">실시간</span>
      </header>
      {rows.length === 0 ? (
        <div className="px-6 py-8 text-small text-[color:var(--ink-60)]">
          진행 중인 대여가 없어요.
        </div>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, i) => {
            // The settlement gate blocks the advance from
            // `return_confirmed → settlement_ready` and from
            // `settlement_ready → settled` while a claim window is
            // still open or a claim review is unresolved. The button
            // hides instead of failing the click silently — the
            // ClaimWindowBlock above already exposes the seller's
            // close/open-claim affordance, so removing the duplicate
            // path keeps the dashboard honest.
            const settlementBlocked =
              (r.status === "return_confirmed" ||
                r.status === "settlement_ready") &&
              settlementBlockByRental.has(r.id);
            return (
              <li
                key={r.id}
                className={`grid grid-cols-[1fr_auto] gap-6 px-6 py-5 items-start ${
                  i !== rows.length - 1
                    ? "border-b border-[color:var(--ink-12)]"
                    : ""
                }`}
              >
                <div className="flex flex-col gap-2">
                  <span className="text-body font-medium">
                    {r.productName}
                  </span>
                  <span className="text-small text-[color:var(--ink-60)]">
                    {r.borrowerName ?? "익명"} · {r.durationDays}일
                  </span>
                  {settlementBlocked ? (
                    <span className="text-caption text-[color:var(--ink-60)]">
                      반납 후 상태 확인 단계가 끝나야 정산을 진행할 수 있어요.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdvance(r)}
                      disabled={busyId === r.id}
                      className="self-start text-caption underline disabled:opacity-40"
                    >
                      다음 단계 진행 →
                    </button>
                  )}
                </div>
                <IntentStatusBadge status={r.status} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TrustSummaryBlock({ summary }: { summary: UserTrustSummary }) {
  const standingLabel =
    summary.accountStanding === "limited"
      ? TRUST_SUMMARY_COPY.accountStandingLimited
      : summary.accountStanding === "blocked"
        ? TRUST_SUMMARY_COPY.accountStandingBlocked
        : TRUST_SUMMARY_COPY.accountStandingNormal;
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{TRUST_SUMMARY_COPY.sectionTitle}</h3>
        <span className="text-caption text-[color:var(--ink-60)]">
          {TRUST_SUMMARY_COPY.accountStandingLabel}: {standingLabel}
        </span>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 border-l border-[color:var(--ink-12)]">
        <TrustStat
          label={TRUST_SUMMARY_COPY.successfulReturns}
          value={summary.successfulReturns}
        />
        <TrustStat
          label={TRUST_SUMMARY_COPY.pickupConfirmedCount}
          value={summary.pickupConfirmedCount}
        />
        <TrustStat
          label={TRUST_SUMMARY_COPY.returnConfirmedCount}
          value={summary.returnConfirmedCount}
        />
        <TrustStat
          label={TRUST_SUMMARY_COPY.conditionCheckCompletedCount}
          value={summary.conditionCheckCompletedCount}
        />
      </div>
    </section>
  );
}

function TrustStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px px-6 py-6 flex flex-col gap-2">
      <span className="text-caption text-[color:var(--ink-60)]">{label}</span>
      <span className="text-h3 tabular-nums">
        {value.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}

function HandoffBlock({
  rows,
  busyId,
  onConfirm,
}: {
  rows: Array<{
    intent: RentalIntent;
    phase: HandoffPhase;
    record: HandoffRecord | null;
  }>;
  busyId: string | null;
  onConfirm: (intent: RentalIntent, phase: HandoffPhase) => void;
}) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{HANDOFF_RITUAL_COPY.dashboardSectionTitle}</h3>
        <Badge variant="dashed">{rows.length}건</Badge>
      </header>
      <div className="px-6 pt-4 pb-2 flex flex-col gap-1">
        <span className="text-small text-[color:var(--ink-60)]">
          {HANDOFF_RITUAL_COPY.noUploadYet}
        </span>
        <span className="text-small text-[color:var(--ink-60)]">
          {HANDOFF_RITUAL_COPY.manualNoteHint}
        </span>
        <span className="text-small text-[color:var(--ink-60)]">
          {HANDOFF_RITUAL_COPY.borrowerLater}
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((row, i) => {
          const done = row.record
            ? handoffService.completedCount(row.record)
            : 0;
          const sellerDone = row.record?.confirmedBySeller === true;
          const intro =
            row.phase === "pickup"
              ? HANDOFF_RITUAL_COPY.pickup.intro
              : HANDOFF_RITUAL_COPY.return.intro;
          return (
            <li
              key={`${row.intent.id}:${row.phase}`}
              className={`grid grid-cols-[1fr_auto] gap-6 px-6 py-5 items-start ${
                i !== rows.length - 1
                  ? "border-t border-[color:var(--ink-12)]"
                  : "border-t border-[color:var(--ink-12)]"
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium">
                  {row.intent.productName}
                </span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {row.intent.borrowerName ?? "익명"} · {row.intent.durationDays}일
                </span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {intro}
                </span>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-[color:var(--ink-60)] mt-1">
                  <li>{HANDOFF_RITUAL_COPY.checklist.mainUnit}</li>
                  <li>{HANDOFF_RITUAL_COPY.checklist.components}</li>
                  <li>{HANDOFF_RITUAL_COPY.checklist.working}</li>
                  <li>{HANDOFF_RITUAL_COPY.checklist.appearance}</li>
                  <li>{HANDOFF_RITUAL_COPY.checklist.preexisting}</li>
                </ul>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-caption text-[color:var(--ink-60)] tabular-nums">
                  {formatHandoffProgress(row.phase, done)}
                </span>
                <Button
                  size="md"
                  variant={sellerDone ? "secondary" : undefined}
                  onClick={() => onConfirm(row.intent, row.phase)}
                  disabled={sellerDone || busyId === row.intent.id}
                  type="button"
                >
                  {sellerDone
                    ? HANDOFF_RITUAL_COPY.sellerConfirmDone
                    : HANDOFF_RITUAL_COPY.sellerConfirmAction}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ClaimWindowBlock({
  rows,
  busyId,
  onCloseNoClaim,
  onOpenClaim,
}: {
  rows: Array<{ intent: RentalIntent; window: ClaimWindow }>;
  busyId: string | null;
  onCloseNoClaim: (intent: RentalIntent) => void;
  onOpenClaim: (intent: RentalIntent, reason?: string) => void;
}) {
  const [reasonByRental, setReasonByRental] = useState<Record<string, string>>(
    {},
  );
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">{CLAIM_WINDOW_COPY.sectionTitle}</h3>
        <Badge variant="dashed">{rows.length}건</Badge>
      </header>
      <div className="px-6 pt-4 pb-2 flex flex-col gap-1">
        <span className="text-small text-[color:var(--ink-60)]">
          {CLAIM_WINDOW_COPY.intro}
        </span>
        <span className="text-small text-[color:var(--ink-60)]">
          {CLAIM_WINDOW_COPY.noPayoutNote}
        </span>
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const isOpen = row.window.status === "open";
          const isClosedWithClaim =
            row.window.status === "closed_with_claim";
          const isClosedNoClaim = row.window.status === "closed_no_claim";
          const reason = reasonByRental[row.intent.id] ?? "";
          return (
            <li
              key={row.window.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 px-6 py-5 items-start border-t border-[color:var(--ink-12)]"
            >
              <div className="flex flex-col gap-2">
                <span className="text-body font-medium">
                  {row.intent.productName}
                </span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {row.intent.borrowerName ?? "익명"} ·{" "}
                  {row.intent.durationDays}일
                </span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  {isOpen
                    ? CLAIM_WINDOW_COPY.open
                    : isClosedNoClaim
                      ? CLAIM_WINDOW_COPY.closedNoClaim
                      : CLAIM_WINDOW_COPY.closedWithClaim}
                </span>
                {isOpen ? (
                  <label className="flex flex-col gap-1 mt-2">
                    <span className="text-caption text-[color:var(--ink-60)]">
                      {CLAIM_WINDOW_COPY.reasonLabel}
                    </span>
                    <input
                      type="text"
                      value={reason}
                      maxLength={240}
                      placeholder={CLAIM_WINDOW_COPY.reasonPlaceholder}
                      onChange={(e) =>
                        setReasonByRental((prev) => ({
                          ...prev,
                          [row.intent.id]: e.target.value,
                        }))
                      }
                      className="border border-[color:var(--ink-20)] px-3 py-2 text-body"
                    />
                  </label>
                ) : null}
              </div>
              <div className="flex flex-col items-stretch md:items-end gap-2">
                {isOpen ? (
                  <>
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => onCloseNoClaim(row.intent)}
                      disabled={busyId === row.intent.id}
                      type="button"
                    >
                      {CLAIM_WINDOW_COPY.closeNoClaimAction}
                    </Button>
                    <Button
                      size="md"
                      onClick={() =>
                        onOpenClaim(
                          row.intent,
                          reason.length > 0 ? reason : undefined,
                        )
                      }
                      disabled={busyId === row.intent.id}
                      type="button"
                    >
                      {CLAIM_WINDOW_COPY.openClaimAction}
                    </Button>
                  </>
                ) : (
                  <Badge
                    variant={isClosedWithClaim ? "selected" : "outline"}
                  >
                    {isClosedWithClaim
                      ? CLAIM_WINDOW_COPY.closedWithClaim
                      : CLAIM_WINDOW_COPY.closedNoClaim}
                  </Badge>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FailureBlock({ rows }: { rows: RentalIntent[] }) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">실패 / 보류 상태</h3>
        <Badge variant="selected">{rows.length}건</Badge>
      </header>
      <ul className="flex flex-col">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`grid grid-cols-[60px_1fr_auto] gap-6 px-6 py-5 items-center ${
              i !== rows.length - 1
                ? "border-b border-dashed border-[color:var(--line-dashed)]"
                : ""
            }`}
          >
            <span className="text-caption text-[color:var(--ink-60)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-body font-medium">{r.productName}</span>
              <span className="text-small text-[color:var(--ink-60)]">
                {statusLabel(r.status)} · {r.durationDays}일 ·{" "}
                {formatKRW(r.amounts.borrowerTotal)}
              </span>
            </div>
            <IntentStatusBadge status={r.status} />
          </li>
        ))}
      </ul>
      {rows.some((r) => isFailureStatus(r.status)) ? (
        <div className="px-6 py-4 border-t border-[color:var(--ink-12)] text-small text-[color:var(--ink-60)]">
          실패/보류 상태도 일관된 색 없이 텍스트와 강한 외곽선으로 표시됩니다.
        </div>
      ) : null}
    </section>
  );
}

function ListingStatusBadge({ status }: { status: ListingIntent["status"] }) {
  if (status === "approved") return <Badge variant="filled">게시됨</Badge>;
  if (status === "human_review_pending")
    return <Badge variant="dashed">사람 검수 대기</Badge>;
  if (status === "verification_incomplete")
    return <Badge variant="dashed">검증 미완료</Badge>;
  if (status === "rejected") return <Badge variant="selected">반려</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function ListedStatusBadge({ status }: { status: ListedItem["status"] }) {
  if (status === "게시됨") return <Badge variant="filled">{status}</Badge>;
  if (status === "심사 중") return <Badge variant="dashed">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
