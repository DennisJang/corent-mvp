import Link from "next/link";
import { CATEGORY_LABEL, type Product } from "@/data/products";
import { formatKRW } from "@/lib/format";

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/items/${product.id}`}
      className="group block bg-white border border-[color:var(--ink-12)] hover:border-black transition-colors focus-ring"
    >
      <div className="flex items-center justify-center w-full aspect-[4/3] border-b border-[color:var(--ink-12)] group-hover:border-black transition-colors">
        <span className="text-h1 tracking-tight">{product.hero.initials}</span>
      </div>
      <div className="p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between text-caption text-[color:var(--ink-60)]">
          <span>{CATEGORY_LABEL[product.category]}</span>
          <span>VERIFIED</span>
        </div>
        <h3 className="text-title">{product.name}</h3>

        <div className="border-t border-[color:var(--ink-12)] pt-4 flex items-baseline justify-between">
          <span className="text-h3 tracking-tight">
            {formatKRW(product.prices["3d"])}
          </span>
          <span className="text-small text-[color:var(--ink-60)]">/ 3일</span>
        </div>

        <ul className="flex flex-col gap-1 text-small text-[color:var(--ink-60)]">
          <li className="flex justify-between">
            <span>1일</span>
            <span>{formatKRW(product.prices["1d"])}</span>
          </li>
          <li className="flex justify-between">
            <span>7일</span>
            <span>{formatKRW(product.prices["7d"])}</span>
          </li>
        </ul>

        <div className="border-t border-[color:var(--ink-12)] pt-4 flex flex-col gap-1">
          <span className="text-small text-[color:var(--ink-60)]">
            {product.pickupArea} · 직접 수령
          </span>
          <span className="text-small text-black">
            안전 코드 사진 검증 완료
          </span>
        </div>
      </div>
    </Link>
  );
}
