import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
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
      label: "Recent code photo",
      detail: `오늘의 안전 코드 ${product.trust.safetyCode} 검증 완료 — 그날 촬영된 사진만 통과시킵니다.`,
    },
    {
      label: "Components checked",
      detail: product.components.join(" · "),
    },
    {
      label: "Private serial stored",
      detail: product.trust.serialOnFile
        ? "시리얼 번호는 비공개 보관 — 다른 사용자에게는 보이지 않아요."
        : "이 물건은 시리얼 보관 대상이 아닙니다.",
      pending: !product.trust.serialOnFile,
    },
    {
      label: "Return before settlement",
      detail: "반납이 확인되기 전까지 정산은 진행되지 않아요.",
    },
  ];

  const depositTier = getDepositTier(product.estimatedValue);

  return (
    <PageShell>
      <article>
        {/* Top label strip */}
        <div className="border-b border-[color:var(--ink-12)]">
          <div className="container-main py-4 flex items-baseline justify-between">
            <span className="text-caption text-[color:var(--ink-60)]">
              Item / {CATEGORY_LABEL[product.category]}
            </span>
            <span className="text-caption text-[color:var(--ink-60)]">
              {product.pickupArea}
            </span>
          </div>
        </div>

        {/* Hero — 6/6 split */}
        <section className="border-b border-black">
          <div className="container-main py-16">
            <div className="grid-12 items-start gap-y-12">
              <div className="col-span-12 md:col-span-6 flex flex-col gap-8">
                <div className="aspect-[5/4] border border-[color:var(--ink-12)] flex items-center justify-center">
                  <span className="text-display tracking-tight">
                    {product.hero.initials}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    {CATEGORY_LABEL[product.category]} / Verified
                  </span>
                  <h1 className="text-h1">{product.name}</h1>
                  <p className="text-body text-[color:var(--ink-80)] max-w-[520px]">
                    {product.summary}
                  </p>
                </div>
              </div>

              <aside className="col-span-12 md:col-span-6 md:pl-6 flex flex-col gap-6">
                <div className="bg-white border border-black p-8 flex flex-col gap-8">
                  <DurationSelector product={product} />

                  <ul className="flex flex-col">
                    <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
                      <span className="text-small text-[color:var(--ink-60)]">
                        안전 보증
                      </span>
                      <span className="text-body">
                        {depositTier === 0
                          ? "보증 없음"
                          : `${formatKRW(depositTier)} (반납 후 환급)`}
                      </span>
                    </li>
                    <li className="flex items-baseline justify-between py-3 border-t border-[color:var(--ink-12)]">
                      <span className="text-small text-[color:var(--ink-60)]">
                        수령 방식
                      </span>
                      <span className="text-body">서울 직거래</span>
                    </li>
                    <li className="flex items-baseline justify-between py-3 border-y border-[color:var(--ink-12)]">
                      <span className="text-small text-[color:var(--ink-60)]">
                        정산
                      </span>
                      <span className="text-body">반납 확인 후</span>
                    </li>
                  </ul>

                  <div className="flex flex-col gap-3">
                    <Button>대여 요청하기</Button>
                    <span className="text-small text-[color:var(--ink-60)] text-center">
                      결제는 요청 승인 후 토스페이먼츠로 진행됩니다 (모의).
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-[color:var(--ink-12)] p-6 flex items-center gap-6">
                  <span className="inline-flex w-12 h-12 border border-black items-center justify-center text-title">
                    {product.sellerName[0]}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-title">{product.sellerName}</span>
                    <span className="text-small text-[color:var(--ink-60)]">
                      {product.sellerTrustNote}
                    </span>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Trust + safety code */}
        <section className="border-b border-black">
          <div className="container-main py-16">
            <div className="grid-12 gap-y-12 items-start">
              <div className="col-span-12 md:col-span-7">
                <TrustSummary items={trustItems} title="Trust Summary" />
              </div>
              <div className="col-span-12 md:col-span-5">
                <SafetyCodeCard code={product.trust.safetyCode} />
              </div>
            </div>
          </div>
        </section>

        {/* Closing copy */}
        <section>
          <div className="container-main py-16">
            <div className="grid-12 gap-y-8 items-start">
              <div className="col-span-12 md:col-span-4">
                <span className="text-caption">Settlement / Deposit</span>
              </div>
              <div className="col-span-12 md:col-span-8 flex flex-col gap-4 border-t border-black pt-6">
                <h3 className="text-h3">반납이 확인되기 전까지는 정산되지 않습니다.</h3>
                <p className="text-body text-[color:var(--ink-60)] max-w-[640px]">
                  반납이 확인되면 수수료 10%를 제외한 금액이 판매자에게
                  정산됩니다. 안전 보증금은 반납 확인 후 자동으로 환급돼요.
                  고가품의 경우 시리얼 번호는 비공개로만 사용해요.
                </p>
              </div>
            </div>
          </div>
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
