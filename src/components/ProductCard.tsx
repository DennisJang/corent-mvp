import Link from "next/link";
import { Badge } from "./Badge";
import { CATEGORY_LABEL, type Product } from "@/data/products";
import { formatKRW } from "@/lib/format";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/items/${product.id}`}
      className="group block rounded-[20px] border border-[color:var(--border-subtle)] bg-white p-6 transition-colors hover:border-[color:var(--border-strong)] focus:outline-none focus-visible:shadow-[0_0_0_4px_rgba(43,89,195,0.14)]"
    >
      <div className="flex items-center justify-center w-full aspect-[4/3] rounded-[16px] bg-[color:var(--color-air)] mb-6">
        <span className="text-h2 text-[color:var(--color-primary)] tracking-tight">
          {product.hero.initials}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge>{CATEGORY_LABEL[product.category]}</Badge>
          <Badge tone="neutral">{product.pickupArea}</Badge>
        </div>
        <h3 className="text-title">{product.name}</h3>
        <p className="text-body-small text-secondary line-clamp-2">
          {product.summary}
        </p>
        <div className="divider my-2" />
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-caption text-tertiary">3일 기준</span>
            <span className="text-title">
              {formatKRW(product.prices["3d"])}
            </span>
          </div>
          <span className="text-body-small text-secondary">
            1일 {formatKRW(product.prices["1d"])} · 7일{" "}
            {formatKRW(product.prices["7d"])}
          </span>
        </div>
      </div>
    </Link>
  );
}
