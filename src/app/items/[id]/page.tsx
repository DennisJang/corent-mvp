import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DurationSelector } from "@/components/DurationSelector";
import { TrustSummary } from "@/components/TrustSummary";
import { SafetyCodeCard } from "@/components/SafetyCodeCard";
import { CATEGORY_LABEL, getProductById, PRODUCTS } from "@/data/products";
import { formatKRW } from "@/lib/format";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) notFound();

  const trustItems = [
    {
      label: "최근 사진 확인",
      detail: `오늘의 안전 코드 ${product.trust.safetyCode} 검증 완료`,
    },
    {
      label: "구성품 확인",
      detail: product.components.join(", "),
    },
    {
      label: "작동 상태",
      detail: product.condition,
    },
    {
      label: "외관 결함",
      detail: product.defects,
    },
    {
      label: "시리얼 번호",
      detail: product.trust.serialOnFile
        ? "비공개 보관 — 다른 사용자에게 보이지 않아요"
        : "이 물건은 시리얼 보관 대상 아님",
    },
    {
      label: "사람 최종 검수",
      detail: product.trust.humanReviewed ? "검수 완료" : "검수 진행 중",
    },
  ];

  const depositTier = getDepositTier(product.estimatedValue);

  return (
    <PageShell>
      <article className="container-main py-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-center w-full aspect-[4/3] rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:var(--color-air)]">
              <span className="text-display text-[color:var(--color-primary)] tracking-tight">
                {product.hero.initials}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{CATEGORY_LABEL[product.category]}</Badge>
              <Badge tone="neutral">{product.pickupArea}</Badge>
              <Badge>안전 확인 완료</Badge>
            </div>
            <div className="flex flex-col gap-3">
              <h1 className="text-h1">{product.name}</h1>
              <p className="text-body-large text-secondary max-w-[560px]">
                {product.summary}
              </p>
            </div>
          </div>

          <aside className="flex flex-col gap-6">
            <Card padding="lg">
              <DurationSelector product={product} />
              <div className="divider my-6" />
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-body-small text-secondary">
                    안전 보증
                  </span>
                  <span className="text-body">
                    {depositTier === 0
                      ? "보증 없음"
                      : `${formatKRW(depositTier)} (반납 후 환급)`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-body-small text-secondary">
                    수령 방식
                  </span>
                  <span className="text-body">서울 직거래</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-body-small text-secondary">정산</span>
                  <span className="text-body">반납 확인 후</span>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Button>대여 요청하기</Button>
                <span className="text-body-small text-secondary text-center">
                  결제는 요청 승인 후 토스페이먼츠로 진행됩니다 (모의).
                </span>
              </div>
            </Card>

            <Card padding="lg">
              <div className="flex items-center gap-4">
                <span className="inline-flex w-12 h-12 rounded-full bg-[color:var(--color-air)] items-center justify-center text-[color:var(--color-primary)] text-title">
                  {product.sellerName[0]}
                </span>
                <div className="flex flex-col">
                  <span className="text-title">{product.sellerName}</span>
                  <span className="text-body-small text-secondary">
                    {product.sellerTrustNote}
                  </span>
                </div>
              </div>
            </Card>
          </aside>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-16">
          <TrustSummary items={trustItems} />
          <SafetyCodeCard code={product.trust.safetyCode} />
        </section>

        <section className="mt-16">
          <Card padding="lg">
            <div className="flex flex-col gap-3 max-w-[640px]">
              <h3 className="text-title">서로 안심하고 거래하기 위한 장치</h3>
              <p className="text-body text-secondary">
                반납이 확인되면 수수료 10%를 제외한 금액이 판매자에게
                정산됩니다. 안전 보증금은 반납 확인 후 자동으로 환급돼요.
                고가품의 경우 시리얼 번호는 비공개로만 사용해요.
              </p>
            </div>
          </Card>
        </section>
      </article>
    </PageShell>
  );
}

function getDepositTier(value: number): number {
  if (value < 100000) return 0;
  if (value < 300000) return 30000;
  if (value < 700000) return 70000;
  return 70000;
}
