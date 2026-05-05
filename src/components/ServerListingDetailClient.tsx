"use client";

// Bundle 2, Slice 2 — renter-facing detail surface for an
// approved server-backed listing. Renders a sanitized
// `PublicListing` DTO (the route component projects from
// `ListingIntent` server-side; this component never sees a raw
// `ListingIntent`) and exposes a request button bound to
// `submitRentalRequest`.
//
// Hard rules:
//
//   - The component never imports from `@/server/**`. The boundary
//     test in `src/server/admin/import-boundary.test.ts` enforces
//     this for every file under `src/components/**`.
//
//   - The CLIENT payload sent to `submitRentalRequest` is exactly
//     `{ listingId, durationDays }`. The component never passes
//     `sellerId`, `borrowerId`, `price`, `amounts`, `status`,
//     `payment`, `pickup`, `return`, `settlement`, `adminId`,
//     `role`, `capability`, `approval`, `trustScore`, or
//     `claimReview`. Even the displayed amounts on success come
//     from the SERVER's response, never a client-computed
//     pre-submit estimate.
//
//   - The renter sees the BW Swiss Grid card style only — black /
//     white / dashed lines / opacity tokens. No new colors, no
//     gradients, no decorative accents.
//
//   - Pre-payment posture is explicit in copy. Success copy says
//     "요청이 전송되었어요" (request was sent), never anything
//     that implies a confirmed rental, payment, deposit, or
//     guarantee. Failure copy is calm and never reveals server
//     internals.
//
//   - `getMockRenterSession` is NOT used here. Server actor
//     identity is the only authority signal; the action surfaces
//     `unauthenticated` / `ownership` envelopes when the caller
//     is not a Supabase-authenticated borrower-capable user, and
//     the component renders sign-in copy in response.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { PriceBreakdown } from "@/components/pricing/PriceBreakdown";
import { CATEGORY_LABEL } from "@/domain/categories";
import {
  DEFAULT_DURATION,
  DURATIONS,
  type DurationKey,
  keyToDays,
} from "@/domain/durations";
import type { PublicListing } from "@/domain/listings";
import { formatKRW } from "@/lib/format";
import { calculateRentalAmounts } from "@/lib/pricing";
import { submitRentalRequest } from "@/lib/client/rentalRequestClient";

type Props = {
  listing: PublicListing;
};

type Submission =
  | { state: "idle" }
  | { state: "busy" }
  | {
      state: "ok";
      durationDays: 1 | 3 | 7;
      rentalFee: number;
      safetyDeposit: number;
      borrowerTotal: number;
      productName: string;
    }
  | {
      state: "blocked";
      reason:
        | "unauthenticated"
        | "ownership"
        | "not_found"
        | "input"
        | "unsupported"
        | "error";
    };

const FAILURE_COPY: Record<
  Exclude<Submission, { state: "idle" } | { state: "busy" } | { state: "ok" }>["reason"],
  string
> = {
  unauthenticated: "요청을 보내려면 먼저 로그인해주세요.",
  ownership:
    "이 계정에는 빌리는 사람 권한이 아직 없어요. 운영자에게 문의해주세요.",
  not_found:
    "이 리스팅은 더 이상 공개되어 있지 않아요. 잠시 뒤 다시 확인해주세요.",
  input: "요청을 처리할 수 없어요. 기간을 다시 선택해주세요.",
  unsupported: "데모 환경에서는 요청을 보낼 수 없어요.",
  error: "요청을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.",
};

export function ServerListingDetailClient({ listing }: Props) {
  const [duration, setDuration] = useState<DurationKey>(DEFAULT_DURATION);
  const [submission, setSubmission] = useState<Submission>({ state: "idle" });

  // Display-only amounts. The request button does NOT send these
  // to the server — the server derives canonical amounts from the
  // approved listing. We compute locally only for the price
  // preview before submission.
  const previewRentalFee = listing.prices[duration];
  const previewAmounts = useMemo(
    () => calculateRentalAmounts(previewRentalFee, listing.estimatedValue),
    [previewRentalFee, listing.estimatedValue],
  );

  const handleSubmit = async () => {
    setSubmission({ state: "busy" });
    const result = await submitRentalRequest({
      listingId: listing.sourceId,
      durationDays: keyToDays(duration) as 1 | 3 | 7,
    });
    if (result.kind === "ok") {
      setSubmission({
        state: "ok",
        durationDays: result.request.durationDays,
        rentalFee: result.request.rentalFee,
        safetyDeposit: result.request.safetyDeposit,
        borrowerTotal: result.request.borrowerTotal,
        productName: result.request.productName,
      });
      return;
    }
    setSubmission({ state: "blocked", reason: result.kind });
  };

  return (
    <article>
      <div className="border-b border-[color:var(--ink-12)]">
        <div className="container-main py-4 flex items-baseline justify-between">
          <span className="text-caption text-[color:var(--ink-60)]">
            Listing / {CATEGORY_LABEL[listing.category]}
          </span>
          <span className="text-caption text-[color:var(--ink-60)]">
            Server-approved
          </span>
        </div>
      </div>

      <section className="container-main py-16">
        <div className="grid-12 items-start gap-y-16">
          <header className="col-span-12 md:col-span-7 flex flex-col gap-6">
            <span className="text-caption">Approved Public Listing</span>
            <h1 className="text-h1">{listing.title}</h1>
            <p className="text-body text-[color:var(--ink-60)] max-w-[520px]">
              {listing.summary || "이 리스팅에 대한 추가 설명은 아직 없어요."}
            </p>
            <ul className="flex flex-col gap-2 text-small text-[color:var(--ink-60)]">
              <li>{listing.pickupArea} · 직접 수령</li>
              <li>상태: {listing.condition}</li>
              <li>등록 셀러 ID: {listing.sellerId}</li>
            </ul>
          </header>

          <aside className="col-span-12 md:col-span-5 flex flex-col gap-8 border border-[color:var(--ink-12)] p-6">
            <div className="flex items-center justify-between border-b border-black pb-3">
              <span className="text-caption">대여 기간</span>
              <span className="text-caption text-[color:var(--ink-60)]">
                1 / 3 / 7 days
              </span>
            </div>
            <div
              className="grid grid-cols-3"
              role="radiogroup"
              aria-label="대여 기간"
            >
              {DURATIONS.map((d, i) => {
                const active = d.key === duration;
                const borderL =
                  i === 0 ? "" : "border-l border-[color:var(--ink-12)]";
                return (
                  <button
                    key={d.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDuration(d.key)}
                    className={`flex flex-col items-start gap-2 px-4 py-4 text-left transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2 ${borderL} ${
                      active
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-[color:var(--ink-08)]"
                    }`}
                  >
                    <span
                      className={`text-caption ${
                        active
                          ? "text-white/70"
                          : "text-[color:var(--ink-60)]"
                      }`}
                    >
                      {d.label}
                    </span>
                    <span className="text-title">
                      {formatKRW(listing.prices[d.key])}
                    </span>
                  </button>
                );
              })}
            </div>

            <PriceBreakdown amounts={previewAmounts} />

            <div className="flex flex-col gap-3 border-t border-[color:var(--ink-12)] pt-6">
              <p className="text-caption text-[color:var(--ink-60)]">
                아직 결제는 발생하지 않아요. 요청만 전송돼요.
              </p>
              {submission.state === "ok" ? (
                <SuccessPanel submission={submission} />
              ) : submission.state === "blocked" ? (
                <BlockedPanel reason={submission.reason} />
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submission.state === "busy"}
                >
                  {submission.state === "busy"
                    ? "요청 보내는 중…"
                    : "요청 보내기"}
                </Button>
              )}
            </div>
          </aside>
        </div>
      </section>
    </article>
  );
}

function SuccessPanel({
  submission,
}: {
  submission: Extract<Submission, { state: "ok" }>;
}) {
  return (
    <div className="border border-black p-4 flex flex-col gap-2">
      <span className="text-caption">요청 전송 완료</span>
      <p className="text-body">
        요청이 전송되었어요. 셀러의 응답을 기다리는 중이에요.
      </p>
      <ul className="flex flex-col gap-1 text-small text-[color:var(--ink-60)]">
        <li>물품: {submission.productName}</li>
        <li>대여 기간: {submission.durationDays}일</li>
        <li>
          예상 합계 (참고용): {formatKRW(submission.borrowerTotal)} · 결제·청구
          없음
        </li>
      </ul>
      <p className="text-caption text-[color:var(--ink-60)]">
        아직 대여가 확정된 것은 아니에요. 셀러 승인 + 일정 합의 이후에 다음
        단계로 넘어가요.
      </p>
    </div>
  );
}

function BlockedPanel({
  reason,
}: {
  reason: Exclude<
    Submission,
    { state: "idle" } | { state: "busy" } | { state: "ok" }
  >["reason"];
}) {
  const showSignInLink = reason === "unauthenticated";
  return (
    <div className="border border-dashed border-[color:var(--line-dashed)] p-4 flex flex-col gap-2">
      <span className="text-caption">요청을 보낼 수 없어요</span>
      <p className="text-body">{FAILURE_COPY[reason]}</p>
      {showSignInLink ? (
        <Link href="/login" className="text-small underline">
          로그인 페이지로 이동
        </Link>
      ) : null}
    </div>
  );
}
