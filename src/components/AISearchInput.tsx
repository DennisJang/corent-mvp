"use client";

// Home AI entry — first step of the CoRent Interactive Experience
// (CIE Phase 1 — deterministic interactive surface).
//
// Plan: docs/corent_interactive_experience_architecture.md (§1, §3
// core loop) + docs/corent_wanted_try_request_slice_plan.md (the
// cold-start wedge this surface routes into when inventory is
// empty).
//
// What this component does:
//
//   - Captures a natural-language try-before-buy intent from the
//     user.
//   - Parses it via the deterministic mock parser
//     (`searchService.parse`) — NO real LLM call. The parsed
//     `SearchIntent` is encoded into URL params via
//     `searchService.toQuery` and the browser navigates to
//     `/search?...`.
//   - Persists the intent locally via the persistence adapter so
//     subsequent visits to /search rehydrate the latest intent.
//
// What this component deliberately does NOT do:
//
//   - It does NOT call `submitFeedbackAction` or create a
//     `wanted_item` row. The wanted-try-request flow lives only on
//     `/search` empty state (rendered by `WantedTryRequestForm`
//     inside `SearchResults`). Home only routes to /search.
//   - It does NOT call any LLM provider. The mock parser is
//     deterministic.
//   - It does NOT make any authority claim ("자동 매칭",
//     "verified seller", "보증" etc.). The submit button label is
//     just `결과 보기` — calm, operational.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/Badge";
import { CATEGORY_LABEL } from "@/domain/categories";
import type { SearchIntent } from "@/domain/intents";
import { searchService } from "@/lib/services/searchService";

// Try-before-buy example chips. These replace the older keyword
// chips ("마사지건 3일", etc.) so the home AI entry now reads as
// the first step of CIE — the user expresses intent in their own
// voice and the parser does its best to extract category /
// duration. If the parser misses, the empty-state on /search picks
// up the demand signal via the wanted-try-request form.
const TRY_BEFORE_BUY_EXAMPLES: ReadonlyArray<string> = [
  "다이슨 에어랩 사기 전에 3일만 써보고 싶어요",
  "빔프로젝터를 내 방에서 테스트해보고 싶어요",
  "UMPC로 게임이 잘 되는지 써보고 싶어요",
];

const PLACEHOLDER = "예) 다이슨 에어랩 사기 전에 3일만 써보고 싶어요";

const EMPTY_VALIDATION =
  "어떤 물건을 며칠 써보고 싶은지 한 줄만 적어 주세요. 예시 문구를 눌러도 돼요.";

// Pure helper — converts the home input string into either an
// empty-validation result or the safe `/search?...` href + parsed
// intent. Exported so a source-level test can pin the URL shape
// without rendering React.
export type HomeSearchHrefResult =
  | { valid: false; reason: "empty" }
  | {
      valid: true;
      href: string;
      intent: SearchIntent;
    };

export function buildHomeSearchHref(rawInput: string): HomeSearchHrefResult {
  const raw = (rawInput ?? "").trim();
  if (!raw) return { valid: false, reason: "empty" };
  const intent = searchService.parse(raw);
  const params = new URLSearchParams(searchService.toQuery(intent));
  return {
    valid: true,
    href: `/search?${params.toString()}`,
    intent,
  };
}

export function AISearchInput() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const preview = value.trim() ? searchService.parse(value) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = buildHomeSearchHref(value);
    if (!result.valid) {
      setValidation(EMPTY_VALIDATION);
      return;
    }
    setValidation(null);
    // Persist the parsed intent locally (memory / localStorage
    // adapter). No server write, no Supabase, no env read.
    await searchService.save(result.intent);
    router.push(result.href);
  };

  const handleChip = (chip: string) => {
    setValue(chip);
    if (validation) setValidation(null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-black"
      data-testid="home-ai-search-form"
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
          자연어로 입력하면 카테고리·기간·지역을 자동으로 정리해 드려요.
        </span>
        <span className="text-small text-[color:var(--ink-60)]">
          먼저 체험 기준을 정리하고, 맞는 매물이 없으면 써보고 싶다는 신호를
          남길 수 있어요.
        </span>
        <input
          id="ai-search"
          name="q"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (validation) setValidation(null);
          }}
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
          <div className="flex flex-col gap-2 pt-2">
            <span className="text-caption text-[color:var(--ink-60)]">
              예시 문구
            </span>
            <div className="flex flex-wrap gap-2">
              {TRY_BEFORE_BUY_EXAMPLES.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChip(chip)}
                  className="focus-ring rounded-full"
                  data-testid="home-ai-example-chip"
                >
                  <Badge variant="dashed">{chip}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
        {validation ? (
          <span
            role="status"
            aria-live="polite"
            data-testid="home-ai-validation"
            className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            {validation}
          </span>
        ) : null}
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
