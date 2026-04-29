"use client";

// Legacy reusable component preserved per CLAUDE.md's "Create reusable
// components" list. The active product detail page (`ItemDetailClient`)
// inlines a controlled duration grid because price + breakdown share the
// same selection state. Kept here as an uncontrolled drop-in for any
// future page that just needs the duration toggle.

import { useState } from "react";
import {
  DEFAULT_DURATION,
  DURATIONS,
  type DurationKey,
  type Product,
} from "@/data/products";
import { formatKRW } from "@/lib/format";

type DurationSelectorProps = {
  product: Product;
};

export function DurationSelector({ product }: DurationSelectorProps) {
  const [selected, setSelected] = useState<DurationKey>(DEFAULT_DURATION);
  const price = product.prices[selected];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-black pb-3">
        <span className="text-caption">대여 기간</span>
        <span className="text-caption text-[color:var(--ink-60)]">
          1 / 3 / 7 days
        </span>
      </div>
      <div
        className="grid grid-cols-3"
        role="radiogroup"
        aria-label="대여 기간"
      >
        {DURATIONS.map((d, i) => {
          const isSelected = d.key === selected;
          const borderL = i === 0 ? "" : "border-l border-[color:var(--ink-12)]";
          return (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(d.key)}
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
                {d.label}
              </span>
              <span className="text-title">
                {formatKRW(product.prices[d.key])}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between border-t border-black pt-4">
        <span className="text-small text-[color:var(--ink-60)]">총 금액</span>
        <span className="text-h3 tracking-tight">{formatKRW(price)}</span>
      </div>
    </div>
  );
}
