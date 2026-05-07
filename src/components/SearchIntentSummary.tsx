"use client";

// Search Intent Summary — second step of the CoRent Interactive
// Experience (CIE Phase 1, deterministic).
//
// Plan:
//   docs/corent_interactive_experience_architecture.md (§3 core
//   loop step "interpret" + "derive try criteria")
//   docs/corent_wanted_try_request_slice_plan.md (the wedge this
//   surface routes into when inventory is empty)
//
// Purpose:
//
//   When a user arrives at /search from the home AI entry, this
//   surface acknowledges what they typed and translates it into
//   try-before-buy criteria. It is the calm "we heard you,
//   here's what we're looking for" panel that sits between the
//   raw query and the results grid.
//
// What this component does:
//
//   - Echoes the user's free-text input back, trimmed and
//     length-limited.
//   - Lists the parsed dimensions that are present (category /
//     duration / region / max price). Skips dimensions the
//     parser missed.
//   - Pulls 2–4 deterministic try-before-buy points from the
//     existing readiness service when a category was parsed.
//   - Renders a calm fallback caption when the parser missed the
//     category.
//   - Renders a footer line pointing the user toward the wanted-
//     try-request form below if no listings match.
//
// What this component deliberately does NOT do:
//
//   - It does NOT call `submitFeedbackAction` or write any row.
//     Wanted-item creation lives only in `WantedTryRequestForm`
//     on /search empty state (rendered by SearchResults).
//   - It does NOT call any LLM provider. The category-to-criteria
//     mapping comes from `tryBeforeBuyReadinessService` — the
//     same closed deterministic vocabulary the listing detail
//     readiness card uses.
//   - It does NOT make any authority claim ("자동 매칭",
//     "verified seller", "보증" / "보험" / "보장"). Banlist scan
//     in the test pins the surface clean.
//   - It is rendered ONLY in the loaded state. SearchResults
//     gates the render so this panel never appears in the error
//     state, where surfacing "we heard you" copy could imply we
//     saved the demand signal — we did not.

import { CATEGORY_LABEL, type CategoryId } from "@/domain/categories";
import type { SearchIntent } from "@/domain/intents";
import { formatKRW } from "@/lib/format";
import { deriveTryBeforeBuyReadiness } from "@/lib/services/tryBeforeBuyReadinessService";

const RAW_INPUT_DISPLAY_MAX = 160;
const TRY_CRITERIA_MIN = 2;
const TRY_CRITERIA_MAX = 4;

// Compute the deterministic try-before-buy criteria preview for a
// parsed intent. Returns an empty array when no category was
// parsed (the surface renders the calm fallback caption instead).
// The caller passes the readiness service in via dependency so a
// future swap (mock readiness service in a test) is trivial; the
// default is the production service.
type ReadinessDeriver = typeof deriveTryBeforeBuyReadiness;

export function buildSearchTryCriteriaPreview(
  category: CategoryId | undefined,
  derive: ReadinessDeriver = deriveTryBeforeBuyReadiness,
): string[] {
  if (!category) return [];
  const card = derive({
    category,
    // Stub the SAFE fields the readiness service does not consume
    // for `tryBeforeBuyPoints` derivation. The service only reads
    // these for other slots (`checkBeforeRequest` items, the
    // responsibility-basis label) which the summary surface does
    // not display.
    pickupArea: "",
    condition: "",
    estimatedValue: 0,
  });
  return card.tryBeforeBuyPoints.slice(0, TRY_CRITERIA_MAX);
}

function clipRawInput(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= RAW_INPUT_DISPLAY_MAX) return trimmed;
  return `${trimmed.slice(0, RAW_INPUT_DISPLAY_MAX - 1)}…`;
}

export type SearchIntentSummaryProps = {
  // The parsed search intent. When `null` (the user landed on
  // /search with no meaningful query), the component renders
  // nothing.
  intent: SearchIntent | null;
};

export function SearchIntentSummary({ intent }: SearchIntentSummaryProps) {
  // Defensive short-circuit. SearchResults already gates this on
  // loadState === "loaded" + intent !== null; the inner check is
  // belt-and-suspenders so a future caller cannot accidentally
  // surface the panel during the loading / error states.
  if (!intent) return null;

  const rawInput = clipRawInput(intent.rawInput);
  const hasMeaningfulSignal =
    rawInput.length > 0 ||
    Boolean(intent.category) ||
    Boolean(intent.durationDays) ||
    Boolean(intent.region) ||
    Boolean(intent.priceMax);
  if (!hasMeaningfulSignal) return null;

  const criteria = buildSearchTryCriteriaPreview(intent.category);
  const minCriteria = Math.min(TRY_CRITERIA_MIN, criteria.length);

  return (
    <section
      className="border-b border-black"
      data-testid="search-intent-summary"
    >
      <div className="container-main py-12 md:py-16">
        <div className="grid-12 items-start gap-y-8">
          <div className="col-span-12 md:col-span-7 flex flex-col gap-4">
            <span className="text-caption text-[color:var(--ink-60)]">
              Step 02 / 체험 기준
            </span>
            <h2 className="text-h2">
              입력한 고민을 체험 기준으로 정리했어요
            </h2>
            {rawInput ? (
              <p
                className="text-body text-[color:var(--ink-80)] border-l border-[color:var(--ink-12)] pl-4 max-w-[640px]"
                data-testid="search-intent-summary-raw"
              >
                “{rawInput}”
              </p>
            ) : null}
            <ul className="flex flex-wrap gap-2 pt-1">
              {intent.category ? (
                <li
                  className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-black bg-black text-white"
                  data-testid="search-intent-summary-chip-category"
                >
                  카테고리 · {CATEGORY_LABEL[intent.category]}
                </li>
              ) : null}
              {intent.durationDays ? (
                <li
                  className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-dashed border-[color:var(--line-dashed)] text-[color:var(--ink-80)]"
                  data-testid="search-intent-summary-chip-duration"
                >
                  기간 · {intent.durationDays}일
                </li>
              ) : null}
              {intent.region === "seoul" ? (
                <li
                  className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-dashed border-[color:var(--line-dashed)] text-[color:var(--ink-80)]"
                  data-testid="search-intent-summary-chip-region"
                >
                  지역 · 서울
                </li>
              ) : null}
              {intent.priceMax ? (
                <li
                  className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-dashed border-[color:var(--line-dashed)] text-[color:var(--ink-80)]"
                  data-testid="search-intent-summary-chip-price"
                >
                  최대 가격 · {formatKRW(intent.priceMax)}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="col-span-12 md:col-span-5 border border-[color:var(--ink-12)]">
            <div className="border-b border-[color:var(--ink-12)] px-5 py-3">
              <span className="text-caption text-[color:var(--ink-60)]">
                구매 전 확인할 점 (자동 정리)
              </span>
            </div>
            {intent.category && criteria.length >= minCriteria ? (
              <ul
                className="flex flex-col"
                data-testid="search-intent-summary-criteria"
              >
                {criteria.map((point, i) => (
                  <li
                    key={point}
                    className={`px-5 py-3 text-body text-[color:var(--ink-80)] ${
                      i !== criteria.length - 1
                        ? "border-b border-[color:var(--ink-12)]"
                        : ""
                    }`}
                  >
                    {point}
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="px-5 py-4 text-small text-[color:var(--ink-60)]"
                data-testid="search-intent-summary-fallback"
              >
                카테고리는 아직 확실하지 않아요. 결과를 보면서 조정할 수
                있어요.
              </p>
            )}
          </div>

          <p
            className="col-span-12 text-small text-[color:var(--ink-60)] border-t border-dashed border-[color:var(--line-dashed)] pt-4"
            data-testid="search-intent-summary-footer"
          >
            맞는 매물이 없으면 아래에서 써보고 싶다는 신호를 남길 수 있어요.
          </p>
        </div>
      </div>
    </section>
  );
}
