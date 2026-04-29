// Rule-based mock parser. Good enough to make the AI input boxes feel
// alive without an external dependency. Real OpenAI extraction will replace
// this implementation behind the same interface.

import { CATEGORIES, type CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import type { ItemCondition } from "@/domain/products";
import type { SearchIntent } from "@/domain/intents";
import type { AIParserAdapter, ParsedSellerInput } from "./types";

function lowercased(input: string): string {
  return input.toLowerCase();
}

function detectCategory(text: string): CategoryId | undefined {
  const lower = lowercased(text);
  for (const cat of CATEGORIES) {
    if (!cat.enabled) continue;
    for (const kw of cat.keywords) {
      if (lower.includes(kw.toLowerCase())) return cat.id;
    }
  }
  return undefined;
}

function detectDurationDays(text: string): DurationDays | undefined {
  const lower = lowercased(text);
  // Order matters — "7일" before "1일" so "17일" doesn't false-match.
  if (/(7\s*일|일주일|7\s*days?|1\s*week)/.test(lower)) return 7;
  if (/(3\s*일|3\s*days?|주말 동안|이번 주말)/.test(lower)) return 3;
  if (/(1\s*일|하루|1\s*day)/.test(lower)) return 1;
  return undefined;
}

function detectRegion(text: string): "seoul" | undefined {
  const lower = lowercased(text);
  if (lower.includes("서울") || lower.includes("seoul")) return "seoul";
  // Common Seoul neighborhood names — treat as Seoul region in the MVP.
  const neighborhoods = [
    "합정",
    "강남",
    "성수",
    "송파",
    "잠실",
    "마포",
    "용산",
    "한남",
    "여의도",
    "역삼",
    "이태원",
    "홍대",
  ];
  if (neighborhoods.some((n) => lower.includes(n))) return "seoul";
  return undefined;
}

function detectPriceMax(text: string): number | undefined {
  // Patterns like "5만원 이하", "30000원 이내".
  const manMatch = text.match(/(\d+)\s*만\s*원/);
  if (manMatch) return Number(manMatch[1]) * 10_000;
  const wonMatch = text.match(/(\d{4,})\s*원/);
  if (wonMatch) return Number(wonMatch[1]);
  return undefined;
}

function detectCondition(text: string): ItemCondition | undefined {
  const lower = lowercased(text);
  if (/(거의 새것|새것 같|미개봉|새 제품|like new|brand new)/.test(lower))
    return "like_new";
  if (/(거의 안 썼|얼마 안 썼|사용감 적|살짝 사용)/.test(lower))
    return "lightly_used";
  if (/(사용감 보통|보통 사용)/.test(lower)) return "used";
  if (/(새것|new)/.test(lower)) return "new";
  return undefined;
}

// Heuristic name extraction for the seller flow. We look for the first
// quoted phrase, or a recognizable brand model token.
const KNOWN_BRAND_MODELS = [
  { match: /테라건\s*미니/i, name: "Theragun Mini" },
  { match: /테라건\s*프로/i, name: "Theragun Pro" },
  { match: /theragun\s*mini/i, name: "Theragun Mini" },
  { match: /hyperice\s*hypervolt/i, name: "Hyperice Hypervolt" },
  { match: /hypervolt\s*go\s*2/i, name: "Hyperice Hypervolt Go 2" },
  { match: /다이슨\s*수퍼소닉|dyson\s*supersonic/i, name: "Dyson Supersonic" },
  { match: /lg\s*스타일러/i, name: "LG 스타일러" },
  { match: /폼롤러/i, name: "폼롤러" },
  { match: /저항밴드/i, name: "스마트 저항밴드 세트" },
];

function detectItemName(text: string): string | undefined {
  for (const m of KNOWN_BRAND_MODELS) {
    if (m.match.test(text)) return m.name;
  }
  // Fallback: first noun-like chunk before "고", "이고", "을", "를".
  const m = text.match(/^[^\s.,!?]+(?:\s+[^\s.,!?]+){0,3}/);
  return m ? m[0].trim() : undefined;
}

function detectComponents(text: string): string[] | undefined {
  const lower = lowercased(text);
  const found: string[] = [];
  if (lower.includes("본체")) found.push("본체");
  if (lower.includes("충전")) found.push("충전 케이블");
  if (lower.includes("파우치")) found.push("휴대용 파우치");
  if (lower.includes("헤드")) found.push("헤드");
  if (lower.includes("어댑터")) found.push("어댑터");
  return found.length ? found : undefined;
}

function detectDefects(text: string): string | undefined {
  const lower = lowercased(text);
  if (/(잔기스|기스|스크래치|scratch)/.test(lower))
    return "외관 잔기스 있음";
  if (/(고장|작동 안|불량)/.test(lower)) return "작동 불량 가능";
  return undefined;
}

function detectEstimatedValue(text: string): number | undefined {
  const manMatch = text.match(/(\d+)\s*만\s*원/);
  if (manMatch) return Number(manMatch[1]) * 10_000;
  const wonMatch = text.match(/(\d{5,})\s*원/);
  if (wonMatch) return Number(wonMatch[1]);
  return undefined;
}

export class MockAIParserAdapter implements AIParserAdapter {
  parseSearch(input: string): Omit<SearchIntent, "id" | "createdAt"> {
    return {
      rawInput: input,
      category: detectCategory(input),
      durationDays: detectDurationDays(input),
      region: detectRegion(input),
      priceMax: detectPriceMax(input),
      pickupMethod: "direct",
    };
  }

  parseSellerInput(input: string): ParsedSellerInput {
    return {
      itemName: detectItemName(input),
      category: detectCategory(input),
      condition: detectCondition(input),
      recommendedDurationDays: detectDurationDays(input),
      components: detectComponents(input),
      defects: detectDefects(input),
      estimatedValue: detectEstimatedValue(input),
    };
  }
}

export const mockAIParser = new MockAIParserAdapter();
