// AI parser adapter interface. The current implementation is a rule-based
// mock; a future implementation can call OpenAI structured extraction
// without changing any caller.

import type { CategoryId } from "@/domain/categories";
import type { DurationDays } from "@/domain/durations";
import type { ItemCondition } from "@/domain/products";
import type { SearchIntent } from "@/domain/intents";

export type ParsedSellerInput = {
  itemName?: string;
  category?: CategoryId;
  condition?: ItemCondition;
  recommendedDurationDays?: DurationDays;
  components?: string[];
  defects?: string;
  estimatedValue?: number;
};

export interface AIParserAdapter {
  parseSearch(input: string): Omit<SearchIntent, "id" | "createdAt">;
  parseSellerInput(input: string): ParsedSellerInput;
}
