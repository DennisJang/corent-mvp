"use client";

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
    <div className="flex flex-col gap-4">
      <span className="text-caption uppercase text-[color:var(--color-primary)]">
        대여 기간 선택
      </span>
      <div
        className="grid grid-cols-3 gap-3"
        role="radiogroup"
        aria-label="대여 기간"
      >
        {DURATIONS.map((d) => {
          const isSelected = d.key === selected;
          return (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(d.key)}
              className={`flex flex-col items-start gap-1 rounded-[12px] border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:shadow-[0_0_0_4px_rgba(43,89,195,0.14)] ${
                isSelected
                  ? "border-[color:var(--color-primary)] bg-[color:var(--tint-primary-soft)]"
                  : "border-[color:var(--border-subtle)] bg-white hover:border-[color:var(--border-strong)]"
              }`}
            >
              <span className="text-body-small text-secondary">{d.label}</span>
              <span className="text-title">
                {formatKRW(product.prices[d.key])}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-2">
        <span className="text-body-small text-secondary">
          선택한 기간 총 금액
        </span>
        <span className="text-h3">{formatKRW(price)}</span>
      </div>
    </div>
  );
}
