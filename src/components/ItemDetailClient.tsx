"use client";

// Client side of the product detail page. Handles duration selection,
// derived pricing, and the create-RentalIntent flow. Visual structure
// matches the original BW Swiss Grid layout.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { TrustSummary } from "@/components/TrustSummary";
import { SafetyCodeCard } from "@/components/SafetyCodeCard";
import { PriceBreakdown } from "@/components/pricing/PriceBreakdown";
import { RentalIntentTimeline } from "@/components/intent/RentalIntentTimeline";
import { CATEGORY_LABEL } from "@/domain/categories";
import {
  DEFAULT_DURATION,
  DURATIONS,
  type DurationKey,
  keyToDays,
} from "@/domain/durations";
import type { RentalIntent } from "@/domain/intents";
import type { Product } from "@/domain/products";
import { getMockRenterSession } from "@/lib/auth/mockSession";
import { APPROVAL_COPY } from "@/lib/copy/returnTrust";
import { formatKRW } from "@/lib/format";
import { calculateRentalAmounts } from "@/lib/pricing";
import { rentalService } from "@/lib/services/rentalService";

type Props = {
  product: Product;
};

export function ItemDetailClient({ product }: Props) {
  const [duration, setDuration] = useState<DurationKey>(DEFAULT_DURATION);
  const [submitting, setSubmitting] = useState(false);
  const [intent, setIntent] = useState<RentalIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rentalFee = product.prices[duration];
  const amounts = useMemo(
    () => calculateRentalAmounts(rentalFee, product.estimatedValue),
    [rentalFee, product.estimatedValue],
  );

  // Phase 1.11 — mock renter identity. Same posture as the seller
  // mock session: NOT real auth. The renter id below is the only
  // thing the request-creation boundary uses to scope ownership.
  const renterSession = getMockRenterSession();

  // Surface the most recent intent THIS visitor has sent for this
  // product. Phase 1.11: scoped by `(productId, borrowerId)` so two
  // local-MVP visitors sharing a browser don't read each other's
  // requests.
  useEffect(() => {
    let active = true;
    rentalService
      .listMyRequestsForProduct(product.id, renterSession.borrowerId)
      .then((mine) => {
        if (!active) return;
        const latest = [...mine].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        )[0];
        if (latest) setIntent(latest);
      });
    return () => {
      active = false;
    };
  }, [product.id, renterSession.borrowerId]);

  const handleRequest = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Canonical-request boundary: the client sends only the product
      // id, the selected duration, and the local-MVP renter identity.
      // Seller / product name / price / amounts / status / payment
      // fields are resolved server-side from `getProductById` — a
      // tampered client cannot smuggle a different value in.
      const created = await rentalService.createRequestFromProductId({
        productId: product.id,
        durationDays: keyToDays(duration),
        actorBorrowerId: renterSession.borrowerId,
        actorBorrowerName: renterSession.displayName,
      });
      setIntent(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 보내지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  };

  const trustItems = [
    {
      label: "Recent code photo",
      detail: `오늘의 안전 코드 ${product.trust.safetyCode} 검증 완료 — 그날 촬영된 사진만 통과시킵니다.`,
    },
    {
      label: "Components checked",
      detail: product.components.join(" · "),
    },
    {
      label: "Private serial stored",
      detail: product.trust.serialOnFile
        ? "시리얼 번호는 비공개 보관 — 다른 사용자에게는 보이지 않아요."
        : "이 물건은 시리얼 보관 대상이 아닙니다.",
      pending: !product.trust.serialOnFile,
    },
    {
      label: "Return-first review flow",
      detail:
        "반납 확인 단계가 끝나야 다음 단계가 열려요. 베타에서는 실제 결제·정산 처리가 진행되지 않아요.",
    },
  ];

  return (
    <article>
      <div className="border-b border-[color:var(--ink-12)]">
        <div className="container-main py-4 flex items-baseline justify-between">
          <span className="text-caption text-[color:var(--ink-60)]">
            Item / {CATEGORY_LABEL[product.category]}
          </span>
          <span className="text-caption text-[color:var(--ink-60)]">
            {product.pickupArea}
          </span>
        </div>
      </div>

      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-6 flex flex-col gap-8">
              <div className="aspect-[5/4] border border-[color:var(--ink-12)] flex items-center justify-center">
                <span className="text-display tracking-tight">
                  {product.hero.initials}
                </span>
              </div>
              <div className="flex flex-col gap-4">
                <span className="text-caption text-[color:var(--ink-60)]">
                  {CATEGORY_LABEL[product.category]} / Verified
                </span>
                <h1 className="text-h1">{product.name}</h1>
                <p className="text-body text-[color:var(--ink-80)] max-w-[520px]">
                  {product.summary}
                </p>
              </div>
            </div>

            <aside className="col-span-12 md:col-span-6 md:pl-6 flex flex-col gap-6">
              <div className="bg-white border border-black p-8 flex flex-col gap-8">
                <DurationGrid
                  product={product}
                  selected={duration}
                  onSelect={setDuration}
                />

                <PriceBreakdown amounts={amounts} />

                <ul className="flex flex-col">
                  <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
                    <span className="text-small text-[color:var(--ink-60)]">
                      수령 방식
                    </span>
                    <span className="text-body">서울 직거래</span>
                  </li>
                  <li className="flex items-baseline justify-between py-3 border-y border-[color:var(--ink-12)]">
                    <span className="text-small text-[color:var(--ink-60)]">
                      다음 단계
                    </span>
                    <span className="text-body">반납 확인 후 검토</span>
                  </li>
                </ul>

                <div className="flex flex-col gap-3">
                  <div className="border border-dashed border-[color:var(--line-dashed)] px-4 py-3 flex flex-col gap-1">
                    <span className="text-caption">
                      {APPROVAL_COPY.requestOnlyTitle}
                    </span>
                    <span className="text-small text-[color:var(--ink-60)]">
                      {APPROVAL_COPY.requestOnlyBody}
                    </span>
                  </div>
                  {intent ? (
                    <div className="border border-black p-4 flex flex-col gap-2">
                      <span className="text-caption">
                        {APPROVAL_COPY.requestReceived}
                      </span>
                      <span className="text-body">
                        요청 ID: {intent.id} · {intent.durationDays}일 ·{" "}
                        {formatKRW(intent.amounts.borrowerTotal)} (참고용)
                      </span>
                      <span className="text-small text-[color:var(--ink-60)]">
                        {APPROVAL_COPY.notChargedYet}{" "}
                        {APPROVAL_COPY.awaitingSellerApproval}
                      </span>
                      <span className="text-small text-[color:var(--ink-60)]">
                        {APPROVAL_COPY.renterMutationsDeferred}
                      </span>
                    </div>
                  ) : (
                    <Button
                      onClick={handleRequest}
                      disabled={submitting}
                      type="button"
                    >
                      {submitting
                        ? APPROVAL_COPY.requestCtaSubmitting
                        : APPROVAL_COPY.requestCtaIdle}
                    </Button>
                  )}
                  {error ? (
                    <span className="text-small">{error}</span>
                  ) : (
                    <span className="text-small text-[color:var(--ink-60)] text-center">
                      {APPROVAL_COPY.paymentNotImplementedYet}
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[color:var(--ink-12)] p-6 flex items-center gap-6">
                <span className="inline-flex w-12 h-12 border border-black items-center justify-center text-title">
                  {product.sellerName[0]}
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-title">{product.sellerName}</span>
                  <span className="text-small text-[color:var(--ink-60)]">
                    {product.sellerTrustNote}
                  </span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {intent ? (
        <section className="border-b border-black">
          <div className="container-main py-16">
            <RentalIntentTimeline intent={intent} title="요청 진행" />
          </div>
        </section>
      ) : null}

      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-7">
              <TrustSummary items={trustItems} title="Trust Summary" />
            </div>
            <div className="col-span-12 md:col-span-5">
              <SafetyCodeCard code={product.trust.safetyCode} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container-main py-16">
          <div className="grid-12 gap-y-8 items-start">
            <div className="col-span-12 md:col-span-4">
              <span className="text-caption">Beta / Process Only</span>
            </div>
            <div className="col-span-12 md:col-span-8 flex flex-col gap-4 border-t border-black pt-6">
              <h3 className="text-h3">
                베타에서는 실제 결제 없이 흐름만 확인해요.
              </h3>
              <p className="text-body text-[color:var(--ink-60)] max-w-[640px]">
                요청·승인·인계·반납·클레임 검토는 기록 단계로만 동작합니다.
                결제, 보증금, 정산, 환불, 에스크로, 자동 보상 처리는 아직
                연결되어 있지 않아요. 고가품의 시리얼 번호는 비공개로만
                보관합니다.
              </p>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}

function DurationGrid({
  product,
  selected,
  onSelect,
}: {
  product: Product;
  selected: DurationKey;
  onSelect: (k: DurationKey) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-black pb-3">
        <span className="text-caption">대여 기간</span>
        <span className="text-caption text-[color:var(--ink-60)]">
          1 / 3 / 7 days
        </span>
      </div>
      <div className="grid grid-cols-3" role="radiogroup" aria-label="대여 기간">
        {DURATIONS.map((d, i) => {
          const isSelected = d.key === selected;
          const borderL = i === 0 ? "" : "border-l border-[color:var(--ink-12)]";
          return (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(d.key)}
              className={`flex flex-col items-start gap-2 px-4 py-4 text-left transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2 ${borderL} ${
                isSelected
                  ? "bg-black text-white"
                  : "bg-white text-black hover:bg-[color:var(--ink-08)]"
              }`}
            >
              <span
                className={`text-caption ${
                  isSelected ? "text-white/70" : "text-[color:var(--ink-60)]"
                }`}
              >
                {d.capLabel}
              </span>
              <span className="text-title">
                {formatKRW(product.prices[d.key])}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
