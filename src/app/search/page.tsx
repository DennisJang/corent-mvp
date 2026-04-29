import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeader } from "@/components/SectionHeader";
import { PRODUCTS } from "@/data/products";

const PARSED_FILTERS = [
  { label: "카테고리", value: "마사지건 외 2종" },
  { label: "기간", value: "3일" },
  { label: "지역", value: "서울 전 지역" },
  { label: "안전 보증", value: "양방향" },
];

export default function SearchPage() {
  return (
    <PageShell>
      <section className="container-main py-16">
        <div className="flex flex-col gap-6 max-w-[720px]">
          <Badge>AI 결과 요약</Badge>
          <SectionHeader
            size="h1"
            title="며칠만 써볼 만한 물건들을 찾았어요."
            description="“합정 근처에서 마사지건 3일만 써보고 싶어요” 와 비슷한 결과로 정리했어요."
          />
        </div>

        <Card padding="md" className="mt-12">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-body-small text-secondary">파싱된 조건</span>
            <div className="flex flex-wrap gap-2">
              {PARSED_FILTERS.map((f) => (
                <Badge key={f.label}>
                  {f.label} · {f.value}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between mt-16 mb-8 gap-6 flex-wrap">
          <span className="text-title">총 {PRODUCTS.length}개 결과</span>
          <span className="text-body-small text-secondary">
            정렬: AI 추천순 (모의)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </PageShell>
  );
}
