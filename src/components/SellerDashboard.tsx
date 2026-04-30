"use client";

// Functional seller dashboard. Reads RentalIntents + listings from
// persistence (mock fallback when empty), then derives all displayed
// numbers via dashboardService. Includes a "demo: 모의 대여 채우기" button
// that seeds local state with the prepared mock fixtures so the page never
// looks empty during a fresh review.

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SellerDashboardStat } from "@/components/SellerDashboardStat";
import { IntentStatusBadge, statusLabel } from "@/components/intent/IntentStatusBadge";
import type { ListingIntent, RentalIntent } from "@/domain/intents";
import { isFailureStatus } from "@/domain/intents";
import { CURRENT_SELLER } from "@/data/mockSellers";
import { MOCK_RENTAL_INTENTS } from "@/data/mockRentalIntents";
import { LISTED_ITEMS, type ListedItem } from "@/data/dashboard";
import { OwnershipError } from "@/lib/auth/guards";
import { getMockSellerSession } from "@/lib/auth/mockSession";
import { getPersistence } from "@/lib/adapters/persistence";
import { rentalService } from "@/lib/services/rentalService";
import { listingService } from "@/lib/services/listingService";
import { APPROVAL_COPY } from "@/lib/copy/returnTrust";
import {
  activeRentalRows,
  deriveDashboardSummary,
  failureRows,
  pendingRequestRows,
  relativeTime,
} from "@/lib/services/dashboardService";
import { formatKRW } from "@/lib/format";

export function SellerDashboard() {
  const [rentals, setRentals] = useState<RentalIntent[]>([]);
  const [listings, setListings] = useState<ListingIntent[]>([]);
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
  };

  // Read persisted state once on mount. Effect-setState is intentional —
  // localStorage is an external system and Next/React's data-fetch hooks
  // aren't available without a server route here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().finally(() => setLoaded(true));
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
                대여 요청과 반납만 확인하면 돼요. 정산은 반납 확인 후 자동으로
                진행됩니다.
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
              label="이번 달 정산"
              value={formatKRW(summary.monthlyEarnings)}
              hint={`정산 준비 ${formatKRW(summary.pendingSettlement)} 대기 중`}
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
              />
            </div>
          </div>
        </div>
      </section>

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
}: {
  rows: RentalIntent[];
  busyId: string | null;
  onAdvance: (r: RentalIntent) => void;
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
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={`grid grid-cols-[1fr_auto] gap-6 px-6 py-5 items-start ${
                i !== rows.length - 1
                  ? "border-b border-[color:var(--ink-12)]"
                  : ""
              }`}
            >
              <div className="flex flex-col gap-2">
                <span className="text-body font-medium">{r.productName}</span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {r.borrowerName ?? "익명"} · {r.durationDays}일
                </span>
                <button
                  type="button"
                  onClick={() => onAdvance(r)}
                  disabled={busyId === r.id}
                  className="self-start text-caption underline disabled:opacity-40"
                >
                  다음 단계 진행 →
                </button>
              </div>
              <IntentStatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
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
