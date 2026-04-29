"use client";

// Functional seller registration. Natural-language input → mock parser →
// structured ListingIntent. The listing preview, AI price band, safety
// code, and verification checklist all stay live as the seller edits.

import { useMemo, useState } from "react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { SafetyCodeCard } from "@/components/SafetyCodeCard";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  type CategoryId,
} from "@/domain/categories";
import type { ListingIntent } from "@/domain/intents";
import type { ItemCondition } from "@/domain/products";
import { CURRENT_SELLER } from "@/data/mockSellers";
import { formatKRW } from "@/lib/format";
import { listingService } from "@/lib/services/listingService";

const CONDITION_OPTIONS: { value: ItemCondition; label: string }[] = [
  { value: "new", label: "새것" },
  { value: "like_new", label: "거의 새것" },
  { value: "lightly_used", label: "사용감 적음" },
  { value: "used", label: "사용감 보통" },
];

const VERIFICATION_LABELS: Record<
  keyof ListingIntent["verification"]["checks"],
  string
> = {
  frontPhoto: "정면 사진",
  backPhoto: "후면 사진",
  componentsPhoto: "구성품 사진",
  workingProof: "작동 영상/사진",
  safetyCodePhoto: "안전 코드 사진",
  privateSerialStored: "비공개 시리얼 (선택)",
};

// Stable SSR seed for the initial draft. Both server and client compute
// the same id, verification id, and safety code from this seed, so the
// page hydrates without a mismatch warning. The user clicking "AI로
// 다시 추출" still generates a fresh random id (no idSeed passed).
const INITIAL_RAW_INPUT = "테라건 미니고 거의 안 썼어. 3일 정도 빌려주고 싶어.";
const INITIAL_DRAFT_SEED = "demo_initial_seller_draft";
const INITIAL_DRAFT_AT = "2026-04-30T00:00:00.000Z";

export function SellerRegistration() {
  const [rawInput, setRawInput] = useState(INITIAL_RAW_INPUT);
  const [listing, setListing] = useState<ListingIntent | null>(() =>
    listingService.draftFromInput({
      sellerId: CURRENT_SELLER.id,
      rawInput: INITIAL_RAW_INPUT,
      idSeed: INITIAL_DRAFT_SEED,
      at: INITIAL_DRAFT_AT,
    }),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<ListingIntent | null>(null);

  const reExtract = () => {
    const draft = listingService.draftFromInput({
      sellerId: CURRENT_SELLER.id,
      rawInput,
    });
    setListing(draft);
    setSubmitted(null);
  };

  const conversation = useMemo(
    () => buildConversation(rawInput, listing),
    [rawInput, listing],
  );

  if (!listing) return null;

  const updateItem = <K extends keyof ListingIntent["item"]>(
    key: K,
    value: ListingIntent["item"][K],
  ) => {
    setListing(listingService.applyEdits(listing, { [key]: value }));
  };

  const setEstimatedValue = (value: number) => {
    setListing(listingService.applyEdits(listing, { estimatedValue: value }));
  };

  const toggleCheck = (
    key: keyof ListingIntent["verification"]["checks"],
    next: boolean,
  ) => {
    setListing(listingService.toggleVerificationCheck(listing, key, next));
  };

  const handleSaveDraft = async () => {
    await listingService.saveDraft(listing);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const next = await listingService.submitForReview(listing);
      setListing(next);
      setSubmitted(next);
    } finally {
      setSubmitting(false);
    }
  };

  const verificationComplete = listingService.isVerificationComplete(listing);

  return (
    <>
      <section className="border-b border-black">
        <div className="container-main py-16 md:py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-7 flex flex-col gap-6">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Seller / Registration</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  Step 01 / 04
                </span>
              </div>
              <h1 className="text-h1">
                대화하면 상품 페이지가
                <br />
                만들어져요.
              </h1>
              <p className="text-body text-[color:var(--ink-60)] max-w-[520px]">
                AI가 필요한 정보를 자연스럽게 수집하고, 사진 몇 장만 더하면
                게시 가능한 초안이 완성돼요. 마지막 수정과 사람 검수가 끝나면
                게시됩니다.
              </p>
            </div>
            <div className="col-span-12 md:col-span-5 border border-[color:var(--ink-12)] p-6 flex flex-col gap-4">
              <span className="text-caption text-[color:var(--ink-60)]">
                Listing Preview / {listing.status === "ai_extracted" ? "DRAFT" : listing.status.toUpperCase()}
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-h3 tracking-tight">{listing.item.name}</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  {CATEGORY_LABEL[listing.item.category]}
                </span>
              </div>
              <div className="border-t border-dashed border-[color:var(--line-dashed)] pt-3 flex items-baseline justify-between">
                <span className="text-small text-[color:var(--ink-60)]">
                  3일 추천가
                </span>
                <span className="text-title">
                  {formatKRW(listing.pricing.threeDays)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Left 5 / Right 7 — conversation + structured fields */}
      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6">
              <section className="bg-white border border-[color:var(--ink-12)]">
                <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
                  <span className="text-caption">CoRent AI / 대화 기록</span>
                  <span className="text-caption text-[color:var(--ink-60)]">
                    Mock
                  </span>
                </header>
                <ol className="flex flex-col">
                  {conversation.map((block, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-[120px_1fr] gap-6 px-6 py-6 border-b border-[color:var(--ink-12)]"
                    >
                      {block.kind === "ai" ? (
                        <>
                          <span className="text-caption text-[color:var(--ink-60)]">
                            AI Q.{String(block.index).padStart(2, "0")}
                          </span>
                          <p className="text-body text-black">{block.text}</p>
                        </>
                      ) : (
                        <>
                          <span className="text-caption text-[color:var(--ink-60)]">
                            Seller
                          </span>
                          <p className="text-body text-[color:var(--ink-80)]">
                            {block.text}
                          </p>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="grid grid-cols-[120px_1fr] gap-6 px-6 py-5 items-start">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    Seller / 입력
                  </span>
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={rawInput}
                      onChange={(e) => setRawInput(e.target.value)}
                      rows={3}
                      placeholder="자연어로 등록할 물건과 상태를 알려주세요."
                      className="w-full border border-[color:var(--ink-20)] p-3 text-body focus:outline-2 focus:outline-black focus:outline-offset-2"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={reExtract}
                        className="h-[40px] px-4 rounded-full border border-black text-[14px] font-medium hover:bg-black hover:text-white focus-ring"
                      >
                        AI로 다시 추출
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="col-span-12 md:col-span-7 flex flex-col gap-6">
              <section className="bg-white border border-[color:var(--ink-12)]">
                <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
                  <span className="text-caption">Extracted / 자동 추출</span>
                  <Badge variant="dashed">AI 추론</Badge>
                </header>
                <ul className="flex flex-col">
                  <FieldRow label="Product">
                    <Input
                      value={listing.item.name}
                      onChange={(e) => updateItem("name", e.target.value)}
                    />
                  </FieldRow>
                  <FieldRow label="Category">
                    <select
                      value={listing.item.category}
                      onChange={(e) =>
                        updateItem("category", e.target.value as CategoryId)
                      }
                      className="h-[56px] w-full border border-[color:var(--ink-20)] bg-white px-4 text-[16px] focus:outline-2 focus:outline-black focus:outline-offset-2"
                    >
                      {CATEGORIES.filter((c) => c.enabled).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                  <FieldRow label="Estimated value">
                    <Input
                      type="number"
                      value={listing.item.estimatedValue}
                      onChange={(e) =>
                        setEstimatedValue(Number(e.target.value) || 0)
                      }
                    />
                  </FieldRow>
                  <FieldRow label="Condition">
                    <div className="flex flex-wrap gap-2">
                      {CONDITION_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => updateItem("condition", opt.value)}
                          className={`h-[36px] px-4 rounded-full border text-[13px] font-medium focus-ring ${
                            listing.item.condition === opt.value
                              ? "bg-black text-white border-black"
                              : "bg-white text-black border-[color:var(--ink-20)] hover:border-black"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </FieldRow>
                  <FieldRow label="Components">
                    <Input
                      value={listing.item.components.join(", ")}
                      onChange={(e) =>
                        updateItem(
                          "components",
                          e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="본체, 충전 케이블, 파우치"
                    />
                  </FieldRow>
                  <FieldRow label="Defects">
                    <Input
                      value={listing.item.defects ?? ""}
                      onChange={(e) => updateItem("defects", e.target.value)}
                      placeholder="없음"
                    />
                  </FieldRow>
                </ul>
              </section>

              <section className="bg-white border border-[color:var(--ink-12)]">
                <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
                  <span className="text-caption">AI Recommended Price</span>
                  <span className="text-caption text-[color:var(--ink-60)]">
                    {listing.pricing.sellerAdjusted ? "직접 조정됨" : "조정 가능"}
                  </span>
                </header>
                <div className="grid grid-cols-3">
                  <PriceCell label="01 / Day" amount={listing.pricing.oneDay} />
                  <PriceCell
                    label="03 / Days"
                    amount={listing.pricing.threeDays}
                    highlight
                  />
                  <PriceCell
                    label="07 / Days"
                    amount={listing.pricing.sevenDays}
                  />
                </div>
                <div className="px-6 py-4 border-t border-[color:var(--ink-12)]">
                  <span className="text-small text-[color:var(--ink-60)]">
                    가격은 추정 가치({formatKRW(listing.item.estimatedValue)})를
                    기준으로 자동 계산됩니다. 수수료 10%는 반납 확인 후 자동으로
                    빠져나갑니다.
                  </span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      {/* Verification checklist + serial */}
      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-6">
              <SafetyCodeCard
                code={listing.verification.safetyCode}
                status={
                  listing.verification.checks.safetyCodePhoto
                    ? "확인 완료"
                    : "대기 중"
                }
              />
            </div>
            <div className="col-span-12 md:col-span-6 bg-white border border-[color:var(--ink-12)] p-8 flex flex-col gap-6">
              <header className="flex items-baseline justify-between border-b border-black pb-4">
                <h3 className="text-title">비공개 보관 정보</h3>
                <Badge variant="dashed">선택 입력</Badge>
              </header>
              <p className="text-body text-[color:var(--ink-80)]">
                시리얼 번호는 다른 사용자에게 보이지 않아요. 분쟁 발생 시
                내부적으로만 사용됩니다.
              </p>
              <Input
                placeholder="시리얼 번호 (선택)"
                value={listing.item.privateSerialNumber ?? ""}
                onChange={(e) =>
                  updateItem("privateSerialNumber", e.target.value)
                }
              />
              <span className="text-caption text-[color:var(--ink-60)]">
                저장 후에는 마스킹 처리되어 표시돼요.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Verification ledger */}
      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="border-b border-black pb-4 mb-6">
            <span className="text-caption">Verification Checklist</span>
          </div>
          <ol className="flex flex-col">
            {(
              Object.keys(VERIFICATION_LABELS) as Array<
                keyof typeof VERIFICATION_LABELS
              >
            ).map((key, i, arr) => {
              const checked = listing.verification.checks[key];
              const number = String(i + 1).padStart(2, "0");
              const isLast = i === arr.length - 1;
              const lineClass = checked
                ? "border-b border-[color:var(--ink-12)]"
                : "border-b border-dashed border-[color:var(--line-dashed)]";
              return (
                <li
                  key={key}
                  className={`grid grid-cols-[80px_1fr_140px] gap-6 py-5 items-baseline ${
                    isLast ? "" : lineClass
                  }`}
                >
                  <span className="text-h3 tracking-tight">{number}</span>
                  <span className="text-body">{VERIFICATION_LABELS[key]}</span>
                  <button
                    type="button"
                    onClick={() => toggleCheck(key, !checked)}
                    className={`text-caption text-right focus-ring ${
                      checked
                        ? "text-black underline"
                        : "text-[color:var(--ink-60)]"
                    }`}
                  >
                    {checked ? "확인됨 (해제)" : "체크하기"}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section>
        <div className="container-main py-16">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 border-t border-black pt-8">
            <div className="flex flex-col gap-2 max-w-[560px]">
              <h3 className="text-title">
                {submitted
                  ? submitted.status === "human_review_pending"
                    ? "사람 검수 대기 중이에요."
                    : "검증이 부족해서 임시 저장만 되었어요."
                  : verificationComplete
                    ? "모든 검증이 끝났어요. 검수 요청을 보내세요."
                    : "검증 항목을 마저 체크해주세요."}
              </h3>
              <p className="text-small text-[color:var(--ink-60)]">
                사람 검수까지 평균 2시간 이내. 게시 후에도 가격과 기간 옵션은
                언제든 수정할 수 있어요.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                type="button"
              >
                초안으로 저장
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                type="button"
              >
                {submitting ? "전송 중…" : "검수 요청 보내기"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[140px_1fr] gap-6 px-6 py-4 border-b border-[color:var(--ink-12)] last:border-b-0 items-start">
      <span className="text-caption text-[color:var(--ink-60)] pt-3">
        {label}
      </span>
      <div>{children}</div>
    </li>
  );
}

function PriceCell({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-2 px-6 py-6 border-l first:border-l-0 border-[color:var(--ink-12)] ${
        highlight ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      <span
        className={`text-caption ${
          highlight ? "text-white/70" : "text-[color:var(--ink-60)]"
        }`}
      >
        {label}
      </span>
      <span className="text-h3 tracking-tight">{formatKRW(amount)}</span>
    </div>
  );
}

function buildConversation(
  rawInput: string,
  listing: ListingIntent | null,
): ({ kind: "ai"; index: number; text: string } | { kind: "user"; text: string })[] {
  const blocks: ({ kind: "ai"; index: number; text: string } | { kind: "user"; text: string })[] = [
    {
      kind: "ai",
      index: 1,
      text: "등록할 물건의 종류와 사용감을 알려주세요.",
    },
    { kind: "user", text: rawInput || "—" },
  ];
  if (listing) {
    blocks.push({
      kind: "ai",
      index: 2,
      text: `${listing.item.name}로 인식했어요. 비슷한 물건의 평균으로 1일 ${formatKRW(listing.pricing.oneDay)}, 3일 ${formatKRW(listing.pricing.threeDays)}, 7일 ${formatKRW(listing.pricing.sevenDays)}이 추천돼요. 가격은 직접 조정할 수 있어요.`,
    });
  }
  return blocks;
}
