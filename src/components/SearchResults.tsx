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
import { PRODUCTS } from "@/data/products";
import { publicListingService } from "@/lib/services/publicListingService";
import { searchService } from "@/lib/services/searchService";
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

  // Phase 1.12: read public listings via the projection layer.
  // Initial paint uses the static-product projections so SSR /
  // first render is stable; the effect below re-fetches via
  // `listPublicListings()` so any approved persisted listings
  // become visible after hydration.
  const initialListings = useMemo<PublicListing[]>(
    () =>
      PRODUCTS.map((p) => ({
        publicListingId: `product:${p.id}`,
        source: "static_product",
        sourceId: p.id,
        detailHref: `/items/${p.id}`,
        sellerId: p.sellerId,
        sellerName: p.sellerName,
        title: p.name,
        category: p.category,
        summary: p.summary,
        pickupArea: p.pickupArea,
        prices: { "1d": p.prices["1d"], "3d": p.prices["3d"], "7d": p.prices["7d"] },
        estimatedValue: p.estimatedValue,
        hero: { initials: p.hero.initials },
        condition: p.condition,
        isPersistedProjection: false,
      })),
    [],
  );
  const [listings, setListings] =
    useState<PublicListing[]>(initialListings);

  useEffect(() => {
    let cancelled = false;
    publicListingService.listPublicListings().then((all) => {
      if (cancelled) return;
      setListings(all);
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
                며칠만 써볼 만한 물건들을 찾았어요.
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
          <span className="text-title">총 {filtered.length}개 결과</span>
          <span className="text-caption text-[color:var(--ink-60)]">
            정렬 / AI 추천순 (모의)
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyResults
            onReset={() => {
              router.replace(`/search`);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-l border-[color:var(--ink-12)]">
            {filtered.map((listing) => (
              <div
                key={listing.publicListingId}
                className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px"
              >
                <ProductCard listing={listing} />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
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
