import { PageShell } from "@/components/PageShell";
import { ProductCard } from "@/components/ProductCard";
import { PRODUCTS } from "@/data/products";

const PARSED_FILTERS = [
  { label: "카테고리", value: "마사지건 외 2종" },
  { label: "기간", value: "3일" },
  { label: "지역", value: "서울 전 지역" },
  { label: "안전 보증", value: "양방향" },
];

const DURATION_FILTERS = [
  { key: "1d", label: "01 / Day" },
  { key: "3d", label: "03 / Days", active: true },
  { key: "7d", label: "07 / Days" },
];

export default function SearchPage() {
  return (
    <PageShell>
      <section className="border-b border-black">
        <div className="container-main py-16 md:py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-7 flex flex-col gap-6">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Search Results</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  AI Parsed
                </span>
              </div>
              <h1 className="text-h1">
                며칠만 써볼 만한 물건들을 찾았어요.
              </h1>
              <p className="text-body text-[color:var(--ink-60)] max-w-[520px]">
                “합정 근처에서 마사지건 3일만 써보고 싶어요” 와 비슷한 결과로
                정리했어요.
              </p>
            </div>

            <div className="col-span-12 md:col-span-5 border border-[color:var(--ink-12)]">
              <div className="border-b border-[color:var(--ink-12)] px-5 py-3">
                <span className="text-caption text-[color:var(--ink-60)]">
                  파싱된 조건
                </span>
              </div>
              <ul className="flex flex-col">
                {PARSED_FILTERS.map((f, i) => (
                  <li
                    key={f.label}
                    className={`flex items-baseline justify-between px-5 py-3 ${
                      i !== PARSED_FILTERS.length - 1
                        ? "border-b border-[color:var(--ink-12)]"
                        : ""
                    }`}
                  >
                    <span className="text-small text-[color:var(--ink-60)]">
                      {f.label}
                    </span>
                    <span className="text-body">{f.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black">
        <div className="container-main">
          <div className="grid grid-cols-3">
            {DURATION_FILTERS.map((d, i) => (
              <button
                key={d.key}
                type="button"
                className={`px-6 py-5 text-left transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2 ${
                  i !== 0 ? "border-l border-[color:var(--ink-12)]" : ""
                } ${
                  d.active
                    ? "bg-black text-white"
                    : "bg-white text-black hover:bg-[color:var(--ink-08)]"
                }`}
              >
                <span
                  className={`text-caption ${
                    d.active ? "text-white/70" : "text-[color:var(--ink-60)]"
                  }`}
                >
                  Filter
                </span>
                <div className="text-title mt-1">{d.label}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="container-main py-16">
        <div className="flex items-baseline justify-between border-b border-black pb-4 mb-12">
          <span className="text-title">총 {PRODUCTS.length}개 결과</span>
          <span className="text-caption text-[color:var(--ink-60)]">
            정렬 / AI 추천순 (모의)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-l border-[color:var(--ink-12)]">
          {PRODUCTS.map((p) => (
            <div
              key={p.id}
              className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px"
            >
              <ProductCard product={p} />
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
