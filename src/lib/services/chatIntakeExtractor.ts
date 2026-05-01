// Deterministic local extractor for the chat-to-listing intake flow.
//
// MVP constraints — read before editing:
//
//   - No external AI / LLM call. No network. No API keys. The output
//     is fully derivable from the seller's input string in the
//     current process.
//   - Reuses the existing `mockAIParser` heuristics for item-name,
//     category, condition, components, defects, and estimatedValue
//     so the chat intake and the legacy `/sell` AI box stay aligned.
//   - Adds pickup-area detection (Korean district / station phrases).
//   - Marks every field the heuristics can't recover as `missingFields`
//     instead of inventing values. The downstream draft creation
//     uses safe defaults (massage_gun category, ₩200,000 estimated
//     value) only when a field is missing — those defaults are never
//     promised to the seller as "the AI guessed for you".
//
// The output is a plain `IntakeExtraction` shape. The caller (the
// chat intake service) is responsible for persisting it.

import type { CategoryId } from "@/domain/categories";
import type {
  IntakeExtraction,
  IntakeExtractionField,
} from "@/domain/intake";
import type { ItemCondition } from "@/domain/products";
import { mockAIParser } from "@/lib/adapters/ai/mockAIParserAdapter";
import { nowIso } from "@/lib/ids";
import { calculateRecommendedPriceTable } from "@/lib/pricing";

// Common Seoul-region neighborhood / station tokens. The MVP demo
// region is Seoul (see CLAUDE.md / corent_product_direction_v2.md
// §2 — Seoul is a demo assumption, not a product constraint), so the
// initial dictionary is Seoul-heavy. Adding a Busan / Daegu / etc.
// token here is a one-line change.
const PICKUP_TOKENS: string[] = [
  "강남역",
  "강남",
  "역삼",
  "성수",
  "송파",
  "잠실",
  "마포",
  "합정",
  "용산",
  "한남",
  "여의도",
  "이태원",
  "홍대",
  "서울역",
  "신촌",
  "건대",
  "노원",
  "수유",
  "명동",
  "교대",
  "선릉",
];

// Detect the first matching pickup phrase. Looks for `<token> 근처`,
// `<token>역`, or the bare token. The matched substring is normalized
// to a short label like "강남역 근처" so the assistant summary reads
// naturally.
function detectPickupArea(text: string): string | undefined {
  if (!text) return undefined;
  for (const token of PICKUP_TOKENS) {
    if (!text.includes(token)) continue;
    if (new RegExp(`${token}\\s*역\\s*근처`).test(text)) {
      return `${token}역 근처`;
    }
    if (text.includes(`${token} 근처`) || text.includes(`${token}근처`)) {
      return `${token} 근처`;
    }
    if (new RegExp(`${token}\\s*역`).test(text)) {
      return `${token}역`;
    }
    return token;
  }
  return undefined;
}

// Detect a daily-rate-style "하루 9000원" / "1일 12000원" hint. We
// keep this strict — only "하루"/"1일" pulls a price into the
// `oneDayPrice` slot. Anything ambiguous stays uninterpreted so the
// assistant summary can mark it as missing instead.
function detectOneDayPrice(text: string): number | undefined {
  if (!text) return undefined;
  const m =
    text.match(/(?:하루|1\s*일)\s*에?\s*(\d{3,7})\s*원/) ??
    text.match(/(\d{3,7})\s*원\s*\/\s*(?:일|day)/i);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export type ChatIntakeExtractInput = {
  sessionId: string;
  text: string;
  // Optional override; tests use a fixed `at` for deterministic
  // snapshots. Defaults to `nowIso()` in production.
  at?: string;
};

// Produce an IntakeExtraction from raw seller chat text. Pure: no
// persistence, no network, no module-level state.
export function extractIntake(
  input: ChatIntakeExtractInput,
): IntakeExtraction {
  const text = (input.text ?? "").trim();
  const at = input.at ?? nowIso();

  if (text.length === 0) {
    // Empty input — every field is missing. The caller still gets a
    // fully-shaped object so its UI doesn't have to special-case it.
    return {
      sessionId: input.sessionId,
      missingFields: [
        "itemName",
        "category",
        "pickupArea",
        "estimatedValue",
        "condition",
        "defects",
        "oneDayPrice",
      ],
      createdAt: at,
    };
  }

  const parsed = mockAIParser.parseSellerInput(text);
  const itemName = parsed.itemName;
  const category = parsed.category as CategoryId | undefined;
  const condition = parsed.condition as ItemCondition | undefined;
  const components = parsed.components;
  const defects = parsed.defects;
  const estimatedValue = parsed.estimatedValue;
  const pickupArea = detectPickupArea(text);
  const oneDayPrice = detectOneDayPrice(text);

  // Derive 3d / 7d suggestions ONLY when we have an estimatedValue —
  // the shared pricing module computes them from value, not from a
  // seller-stated daily price. This keeps the chat extractor and the
  // listing draft on the same number for the suggested table.
  let threeDaysPrice: number | undefined;
  let sevenDaysPrice: number | undefined;
  if (typeof estimatedValue === "number" && Number.isFinite(estimatedValue)) {
    const table = calculateRecommendedPriceTable(estimatedValue);
    threeDaysPrice = table["3d"];
    sevenDaysPrice = table["7d"];
  }

  const missingFields: IntakeExtractionField[] = [];
  if (!itemName) missingFields.push("itemName");
  if (!category) missingFields.push("category");
  if (!pickupArea) missingFields.push("pickupArea");
  if (typeof estimatedValue !== "number") missingFields.push("estimatedValue");
  if (!condition) missingFields.push("condition");
  if (!defects) missingFields.push("defects");
  if (typeof oneDayPrice !== "number") missingFields.push("oneDayPrice");

  return {
    sessionId: input.sessionId,
    itemName,
    category,
    pickupArea,
    condition,
    defects,
    components,
    estimatedValue,
    oneDayPrice,
    threeDaysPrice,
    sevenDaysPrice,
    missingFields,
    createdAt: at,
  };
}

// Beta-safe assistant summary copy. Used by the intake service to
// append an `assistant`-role message immediately after the seller's
// text. Tone is "초안" / "검토 후 수정 가능" / explicit no-payment
// disclaimer per CoRent's pre-revenue beta posture.
export function buildAssistantSummary(extraction: IntakeExtraction): string {
  const lines: string[] = [];
  lines.push("초안 미리보기 (검토 후 수정 가능):");
  if (extraction.itemName) {
    lines.push(`· 물건: ${extraction.itemName}`);
  } else {
    lines.push("· 물건: 이름이 명확하지 않아요. 직접 입력해 주세요.");
  }
  if (extraction.pickupArea) {
    lines.push(`· 픽업 지역: ${extraction.pickupArea}`);
  } else {
    lines.push("· 픽업 지역: 알 수 없어요. 직접 입력해 주세요.");
  }
  if (typeof extraction.oneDayPrice === "number") {
    lines.push(`· 하루 대여 희망가 (참고용): ${extraction.oneDayPrice.toLocaleString("ko-KR")}원`);
  } else {
    lines.push("· 하루 대여 희망가: 추출하지 못했어요. 초안에서 직접 설정해 주세요.");
  }
  if (extraction.missingFields.length > 0) {
    lines.push(
      `· 비어 있는 항목 ${extraction.missingFields.length}개는 초안 저장 후 직접 채워 주세요.`,
    );
  }
  lines.push("");
  lines.push("이 초안은 베타 로컬 도우미가 만든 미리보기예요.");
  lines.push("자동 게시·실거래·실제 송금은 진행되지 않아요.");
  lines.push("공개 전 사람 검수 단계가 필요해요.");
  return lines.join("\n");
}
