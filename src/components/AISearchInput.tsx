"use client";

// AI search input for the landing page. Parses the natural-language input
// via the search service and hands off to /search with structured params.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/Badge";
import { CATEGORY_LABEL } from "@/domain/categories";
import { searchService } from "@/lib/services/searchService";

const SEARCH_CHIPS = [
  "마사지건 3일",
  "홈케어 기기",
  "소형 운동기구",
  "구매 전 체험",
  "서울 직거래",
];

const PLACEHOLDER = "예) 합정 근처에서 마사지건 3일만 써보고 싶어요";

export function AISearchInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const preview = value.trim() ? searchService.parse(value) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) {
      // Empty submit: don't fabricate a query — just go to /search and let
      // the user pick filters from the full list.
      router.push(`/search`);
      return;
    }
    const intent = searchService.parse(raw);
    await searchService.save(intent);
    const params = new URLSearchParams(searchService.toQuery(intent));
    router.push(`/search?${params.toString()}`);
  };

  const handleChip = (chip: string) => {
    setValue(chip);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-black"
    >
      <div className="border-b border-black px-5 py-3 flex items-baseline justify-between">
        <span className="text-caption">AI Search / Mock</span>
        <span className="text-caption text-[color:var(--ink-60)]">01</span>
      </div>
      <div className="px-5 py-6 flex flex-col gap-4">
        <label className="text-title" htmlFor="ai-search">
          무엇을 며칠 써보고 싶나요?
        </label>
        <span className="text-small text-[color:var(--ink-60)]">
          자연어로 입력하면 카테고리·기간·지역을 자동으로 찾아드려요.
        </span>
        <input
          id="ai-search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDER}
          className="w-full bg-transparent border-b border-dashed border-[color:var(--line-dashed)] pb-3 mt-2 text-body text-black placeholder:text-[color:var(--ink-40)] focus:outline-none focus:border-black"
        />
        {preview ? (
          <ul className="flex flex-col gap-2 pt-2 text-small">
            {preview.category ? (
              <li className="flex items-baseline justify-between">
                <span className="text-[color:var(--ink-60)]">카테고리</span>
                <span>{CATEGORY_LABEL[preview.category]}</span>
              </li>
            ) : null}
            {preview.durationDays ? (
              <li className="flex items-baseline justify-between">
                <span className="text-[color:var(--ink-60)]">기간</span>
                <span>{preview.durationDays}일</span>
              </li>
            ) : null}
            {preview.region ? (
              <li className="flex items-baseline justify-between">
                <span className="text-[color:var(--ink-60)]">지역</span>
                <span>서울</span>
              </li>
            ) : null}
            {preview.priceMax ? (
              <li className="flex items-baseline justify-between">
                <span className="text-[color:var(--ink-60)]">최대 가격</span>
                <span>₩{preview.priceMax.toLocaleString("ko-KR")}</span>
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="flex flex-wrap gap-2 pt-2">
            {SEARCH_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleChip(chip)}
                className="focus-ring rounded-full"
              >
                <Badge variant="dashed">{chip}</Badge>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="h-[48px] px-6 rounded-full bg-black text-white text-[16px] font-medium border border-black focus-ring"
          >
            결과 보기
          </button>
        </div>
      </div>
    </form>
  );
}
