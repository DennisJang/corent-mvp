"use client";

// Functional /search results. Reads parsed conditions from URL params,
// filters mock products by category/duration/price, and lets users adjust
// duration and category live without leaving the page.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import { CATEGORIES, CATEGORY_LABEL } from "@/domain/categories";
import type { DurationKey } from "@/domain/durations";
import type { PublicListing } from "@/domain/listings";
import type { MatchExplanation } from "@/domain/marketplaceIntelligence";
import { loadPublicListings } from "@/lib/client/publicListingsClient";
import { publicListingService } from "@/lib/services/publicListingService";
import { searchService } from "@/lib/services/searchService";
import { explainMatch } from "@/lib/services/marketplaceIntelligenceService";
import { formatKRW } from "@/lib/format";

const DURATION_FILTER: { key: DurationKey; days: 1 | 3 | 7; capLabel: string }[] = [
  { key: "1d", days: 1, capLabel: "01 / Day" },
  { key: "3d", days: 3, capLabel: "03 / Days" },
  { key: "7d", days: 7, capLabel: "07 / Days" },
];

function durationDaysToKey(days: 1 | 3 | 7): DurationKey {
  return days === 1 ? "1d" : days === 3 ? "3d" : "7d";
}

export function SearchResults() {
  const router = useRouter();
  const params = useSearchParams();
  const intent = useMemo(() => searchService.fromQuery(params), [params]);
  const rawInput = intent?.rawInput ?? "";
  const category = intent?.category;
  const durationDays = intent?.durationDays ?? 3;
  const durationKey = durationDaysToKey(durationDays);

  // Bundle 2 Slice 1 + post-2026-05-05 leakage guard.
  //
  // No static-PRODUCTS initial seed. Before the server probe
  // resolves the client cannot tell server vs local; seeding
  // `listings` with static `PRODUCTS` would (a) flash demo cards
  // in supabase mode and (b) keep those cards on a `kind: "error"`
  // server response — exactly the "static demo as if server data"
  // failure the smoke ops checklist §8 lists as a Stop Condition.
  //
  // Mode dispatch:
  //
  //   - loadState: "loading" → empty list + neutral loading panel
  //     (covers both pre-probe and the local-path async fetch).
  //   - probe.kind === "server" → render only server-projected
  //     approved listings; static `PRODUCTS` are NOT mixed in.
  //   - probe.kind === "local"  → call
  //     `publicListingService.listPublicListings()`, the
  //     isomorphic path that includes static `PRODUCTS` + any
  //     localStorage-persisted approved listings (the local-mode
  //     demo behavior is preserved).
  //   - probe.kind === "error" → empty list + calm error panel.
  //     Server data was attempted and failed; we do NOT silently
  //     substitute static demo products.
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    void loadPublicListings().then(async (probe) => {
      if (cancelled) return;
      if (probe.kind === "server") {
        setListings(probe.listings);
        setLoadState("loaded");
        return;
      }
      if (probe.kind === "error") {
        setListings([]);
        setLoadState("error");
        return;
      }
      // probe.kind === "local"
      const all = await publicListingService.listPublicListings();
      if (cancelled) return;
      setListings(all);
      setLoadState("loaded");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (category && l.category !== category) return false;
      if (intent?.priceMax && l.prices[durationKey] > intent.priceMax)
        return false;
      return true;
    });
  }, [listings, category, intent, durationKey]);

  // Bundle 4 Slice 1 — deterministic match explanations.
  //
  // We compute one MatchExplanation per visible card from the
  // parsed search intent. The output is deterministic; it never
  // claims authority. We only render hints when there is a parsed
  // intent (otherwise the renter has not given us enough signal).
  const explanations = useMemo<Record<string, MatchExplanation>>(() => {
    if (!intent) return {};
    const out: Record<string, MatchExplanation> = {};
    for (const l of filtered) {
      out[l.publicListingId] = explainMatch(intent, l);
    }
    return out;
  }, [intent, filtered]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v === null) next.delete(k);
    else next.set(k, v);
    router.replace(`/search?${next.toString()}`);
  };

  const parsedRows = [
    {
      label: "카테고리",
      value: category ? CATEGORY_LABEL[category] : "전체",
      pending: !category,
    },
    {
      label: "기간",
      value: `${durationDays}일`,
      pending: !intent?.durationDays,
    },
    {
      label: "지역",
      value: intent?.region === "seoul" ? "서울 전 지역" : "서울 베타",
      pending: !intent?.region,
    },
    {
      label: "최대 가격",
      value: intent?.priceMax ? formatKRW(intent.priceMax) : "제한 없음",
      pending: !intent?.priceMax,
    },
  ];

  return (
    <>
      <section className="border-b border-black">
        <div className="container-main py-16 md:py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-7 flex flex-col gap-6">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Search Results</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  AI Parsed
                </span>
              </div>
              <h1 className="text-h1">
                며칠 써볼 만한 물건들을 찾았어요.
              </h1>
              <p className="text-body text-[color:var(--ink-60)] max-w-[520px]">
                {rawInput
                  ? `“${rawInput}” 와 비슷한 결과로 정리했어요.`
                  : "조건을 입력하면 AI가 카테고리·기간·지역으로 정리해 보여드려요."}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <CategoryChip
                  active={!category}
                  label="전체"
                  onClick={() => setParam("category", null)}
                />
                {CATEGORIES.filter((c) => c.enabled).map((c) => (
                  <CategoryChip
                    key={c.id}
                    label={c.label}
                    active={category === c.id}
                    onClick={() =>
                      setParam("category", category === c.id ? null : c.id)
                    }
                  />
                ))}
              </div>
            </div>

            <div className="col-span-12 md:col-span-5 border border-[color:var(--ink-12)]">
              <div className="border-b border-[color:var(--ink-12)] px-5 py-3">
                <span className="text-caption text-[color:var(--ink-60)]">
                  파싱된 조건
                </span>
              </div>
              <ul className="flex flex-col">
                {parsedRows.map((f, i) => (
                  <li
                    key={f.label}
                    className={`flex items-baseline justify-between px-5 py-3 ${
                      i !== parsedRows.length - 1
                        ? f.pending
                          ? "border-b border-dashed border-[color:var(--line-dashed)]"
                          : "border-b border-[color:var(--ink-12)]"
                        : ""
                    }`}
                  >
                    <span className="text-small text-[color:var(--ink-60)]">
                      {f.label}
                    </span>
                    <span
                      className={`text-body ${
                        f.pending ? "text-[color:var(--ink-60)]" : ""
                      }`}
                    >
                      {f.value}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black">
        <div className="container-main">
          <div className="grid grid-cols-3" role="radiogroup" aria-label="대여 기간">
            {DURATION_FILTER.map((d, i) => {
              const active = d.days === durationDays;
              return (
                <button
                  key={d.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setParam("duration", String(d.days))}
                  className={`px-6 py-5 text-left transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2 ${
                    i !== 0 ? "border-l border-[color:var(--ink-12)]" : ""
                  } ${
                    active
                      ? "bg-black text-white"
                      : "bg-white text-black hover:bg-[color:var(--ink-08)]"
                  }`}
                >
                  <span
                    className={`text-caption ${
                      active ? "text-white/70" : "text-[color:var(--ink-60)]"
                    }`}
                  >
                    Filter
                  </span>
                  <div className="text-title mt-1">{d.capLabel}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container-main py-16">
        <div className="flex items-baseline justify-between border-b border-black pb-4 mb-12">
          <span className="text-title">
            {loadState === "loading"
              ? "결과를 불러오는 중…"
              : loadState === "error"
                ? "결과를 불러오지 못했어요"
                : `총 ${filtered.length}개 결과`}
          </span>
          <span className="text-caption text-[color:var(--ink-60)]">
            정렬 / AI 추천순 (모의)
          </span>
        </div>

        {loadState === "loading" ? (
          <LoadingResults />
        ) : loadState === "error" ? (
          <ErrorResults
            onRetry={() => {
              router.replace(`/search`);
            }}
          />
        ) : filtered.length === 0 ? (
          <EmptyResults
            onReset={() => {
              router.replace(`/search`);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-l border-[color:var(--ink-12)]">
            {filtered.map((listing) => {
              const explanation = explanations[listing.publicListingId];
              return (
                <div
                  key={listing.publicListingId}
                  className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px flex flex-col"
                >
                  <ProductCard listing={listing} />
                  {explanation ? (
                    <MatchHints explanation={explanation} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function LoadingResults() {
  return (
    <div className="border border-dashed border-[color:var(--line-dashed)] p-12 flex flex-col gap-3">
      <span className="text-caption text-[color:var(--ink-60)]">Loading</span>
      <p className="text-body text-[color:var(--ink-60)]">
        검색 결과를 불러오고 있어요. 잠시만 기다려 주세요.
      </p>
    </div>
  );
}

function ErrorResults({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-dashed border-[color:var(--line-dashed)] p-12 flex flex-col gap-4 items-start">
      <span className="text-caption text-[color:var(--ink-60)]">
        Unavailable
      </span>
      <h3 className="text-h3">결과를 불러오지 못했어요.</h3>
      <p className="text-body text-[color:var(--ink-60)] max-w-[480px]">
        잠시 뒤 다시 시도해 주세요. 이 화면에서는 데모 데이터를
        대신 보여드리지 않아요.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="h-[48px] px-6 rounded-full bg-black text-white text-[16px] font-medium border border-black focus-ring"
      >
        다시 시도
      </button>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border ${
        active
          ? "bg-black text-white border-black"
          : "bg-white text-black border-[color:var(--ink-20)] hover:border-black"
      } focus-ring`}
    >
      {label}
    </button>
  );
}

// Bundle 4 Slice 1 — non-authoritative match hints rendered below
// each search-result card. Uses BW Swiss Grid tokens only (no new
// colors); reasons go in a dashed-bordered "추천 이유" block and
// cautions in an "확인할 점" block. Copy is calm and avoids any
// regulated-language phrase by construction (the deterministic
// generator's vocabulary is closed; this surface only echoes it).
function MatchHints({ explanation }: { explanation: MatchExplanation }) {
  const { reasons, cautions } = explanation;
  if (reasons.length === 0 && cautions.length === 0) return null;
  return (
    <div className="border-t border-[color:var(--ink-12)] px-6 py-4 flex flex-col gap-3 bg-white">
      {reasons.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-caption text-[color:var(--ink-60)]">
            추천 이유
          </span>
          <ul className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <li
                key={`reason-${r.label}`}
                className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-dashed border-[color:var(--line-dashed)] text-[color:var(--ink-80)]"
              >
                {r.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {cautions.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-[color:var(--ink-12)] pt-3">
          <span className="text-caption text-[color:var(--ink-60)]">
            확인할 점
          </span>
          <ul className="flex flex-wrap gap-2">
            {cautions.map((c) => (
              <li
                key={`caution-${c.label}`}
                className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-dashed border-[color:var(--line-dashed)] text-[color:var(--ink-60)]"
              >
                {c.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function EmptyResults({ onReset }: { onReset: () => void }) {
  return (
    <div className="border border-dashed border-[color:var(--line-dashed)] p-12 flex flex-col gap-4 items-start">
      <span className="text-caption text-[color:var(--ink-60)]">No matches</span>
      <h3 className="text-h3">조건에 맞는 물건이 아직 없어요.</h3>
      <p className="text-body text-[color:var(--ink-60)] max-w-[480px]">
        조건을 줄이면 더 많은 결과가 나와요. 카테고리나 가격 조건을 풀어보세요.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="h-[48px] px-6 rounded-full bg-black text-white text-[16px] font-medium border border-black focus-ring"
      >
        조건 초기화
      </button>
    </div>
  );
}
