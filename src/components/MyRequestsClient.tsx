"use client";

// Borrower "my requests" surface (Bundle 3, Slice 2).
//
// Client component that loads the current user's own rental requests
// via the `loadMyRequests` adapter and renders one of:
//
//   - loading caption (initial state)
//   - error caption (server action failed; no silent fallback)
//   - local-mode caption ("이 베타 화면은 서버 모드에서만 사용해요")
//   - empty state with link to /search
//   - read-only list of requests with per-status Korean copy
//
// Hard rules:
//   - Imports the server action ONLY through `@/lib/client/myRequestsClient`
//     (the import-boundary canary forbids `@/server/**` here).
//   - No mutate / cancel buttons in this slice. Rows are read-only.
//   - Copy never implies payment completion, deposit charge, refund,
//     insurance, guarantee, or confirmed rental in this beta window.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import {
  loadMyRequests,
  type MyRentalRequest,
  type MyRequestsLoadResult,
} from "@/lib/client/myRequestsClient";
import { formatKRW } from "@/lib/format";

const STATUS_COPY: Partial<Record<MyRentalRequest["status"], string>> = {
  requested: "셀러 응답을 기다리는 중",
  seller_approved:
    "셀러가 요청을 수락했어요. 아직 결제·픽업·정산은 시작되지 않았어요.",
  seller_cancelled:
    "셀러가 요청을 거절했어요. 이 요청은 더 진행되지 않아요.",
};

function statusCopy(status: MyRentalRequest["status"]): string {
  return STATUS_COPY[status] ?? "상태 업데이트가 곧 표시돼요.";
}

export function MyRequestsClient() {
  const [state, setState] = useState<MyRequestsLoadResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMyRequests().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isLoading = state === null;
  const isError = state?.kind === "error";
  const isLocal = state?.kind === "local";
  const requests: MyRentalRequest[] =
    state?.kind === "server" ? state.requests : [];
  const isEmpty = !isLoading && !isError && !isLocal && requests.length === 0;

  return (
    <div className="container-main py-16">
      <header className="border-b border-black pb-4 mb-12">
        <span className="text-caption">내 요청</span>
      </header>

      <section className="flex flex-col gap-6 max-w-[720px]">
        <h1 className="text-h2">내가 보낸 대여 요청</h1>
        <p
          role="status"
          className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
        >
          베타: 셀러 응답까지만 처리되며, 결제·픽업·반납·정산은 아직 연결되어
          있지 않아요.
        </p>

        <section className="bg-white border border-[color:var(--ink-12)]">
          <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
            <h2 className="text-title">요청 목록</h2>
            <Badge variant="dashed">
              {isError || isLoading || isLocal ? "—" : `${requests.length}건`}
            </Badge>
          </header>

          {isLoading ? (
            <div className="px-6 py-8 text-small text-[color:var(--ink-60)]">
              요청 목록을 불러오는 중이에요.
            </div>
          ) : isError ? (
            <div className="px-6 py-8">
              <p className="text-small border border-dashed border-[color:var(--line-dashed)] px-3 py-2">
                요청 목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.
              </p>
            </div>
          ) : isLocal ? (
            <div className="px-6 py-8 text-small text-[color:var(--ink-60)]">
              이 화면은 서버 모드에서만 동작해요. 닫힌 베타 환경에 로그인한
              뒤 다시 들어와 주세요.
            </div>
          ) : isEmpty ? (
            <div className="px-6 py-8 flex flex-col gap-3">
              <p className="text-small text-[color:var(--ink-60)]">
                아직 보낸 요청이 없어요.
              </p>
              <p className="text-small">
                <Link href="/search" className="underline">
                  /search
                </Link>
                에서 빌릴 수 있는 물건을 둘러볼 수 있어요.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {requests.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex flex-col gap-2 px-6 py-5 ${
                    i !== requests.length - 1
                      ? "border-b border-[color:var(--ink-12)]"
                      : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-body font-medium">
                      {r.productName}
                    </span>
                    <span className="text-caption text-[color:var(--ink-60)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <span className="text-small text-[color:var(--ink-60)]">
                    {r.sellerDisplayName ?? "셀러"} · {r.durationDays}일 ·{" "}
                    {formatKRW(r.borrowerTotal)} (참고용)
                  </span>
                  {r.pickupArea ? (
                    <span className="text-caption text-[color:var(--ink-60)]">
                      수령 권역: {r.pickupArea}
                    </span>
                  ) : null}
                  <p className="text-small border border-dashed border-[color:var(--line-dashed)] px-3 py-2">
                    {statusCopy(r.status)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="text-caption text-[color:var(--ink-60)] px-6 py-4 border-t border-[color:var(--ink-12)]">
            결제·픽업·반납·정산은 아직 연결되어 있지 않아요. 셀러 응답 외 다른
            상태 변화는 준비되면 추가될 예정이에요.
          </p>
        </section>

        <p className="text-small text-[color:var(--ink-60)] pt-8 border-t border-[color:var(--ink-12)]">
          <Link href="/login" className="underline">
            로그인 화면으로 돌아가기
          </Link>
        </p>
      </section>
    </div>
  );
}
