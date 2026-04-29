import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeader } from "@/components/SectionHeader";
import { PRODUCTS } from "@/data/products";

const SEARCH_CHIPS = [
  "마사지건 3일",
  "홈케어 기기",
  "소형 운동기구",
  "구매 전 체험",
  "서울 직거래",
];

const TRUST_POINTS = [
  {
    title: "AI 1차 + 사람 최종 검수",
    desc: "필수 사진과 작동 상태를 자동으로 점검한 뒤, 사람이 한 번 더 확인해요.",
  },
  {
    title: "오늘 찍은 사진 검증",
    desc: "그날의 안전 코드를 제품 옆에 두고 촬영해 신선도를 확인합니다.",
  },
  {
    title: "반납 확인 후 정산",
    desc: "거래는 플랫폼 안에서 진행되고, 반납이 확인되면 수수료 10%를 제외한 금액이 정산돼요.",
  },
];

export default function LandingPage() {
  const featured = PRODUCTS.slice(0, 3);

  return (
    <PageShell>
      <section className="hero-wash">
        <div className="container-main py-24 flex flex-col gap-12">
          <div className="flex flex-col items-start gap-6 max-w-[720px]">
            <Badge>Seoul beta · AI 렌탈</Badge>
            <h1 className="text-display">
              사기 전에,
              <br />
              며칠만 살아보기.
            </h1>
            <p className="text-body-large text-secondary max-w-[640px]">
              마사지건, 홈케어 디바이스, 소형 운동기구를 서울에서 1일, 3일, 7일
              동안 빌려 써보세요. 평가는 직접 써본 뒤에.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button href="/search">며칠 써볼 물건 찾기</Button>
              <Button href="/sell" variant="secondary">
                내 물건 빌려주기
              </Button>
            </div>
          </div>

          <Card padding="lg" className="max-w-[720px]">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex w-9 h-9 rounded-full bg-[color:var(--color-air)] items-center justify-center text-[color:var(--color-primary)] font-bold">
                  AI
                </span>
                <div className="flex flex-col">
                  <span className="text-title">무엇을 며칠 써보고 싶나요?</span>
                  <span className="text-body-small text-secondary">
                    자연어로 입력하면 카테고리·기간·지역을 자동으로 찾아드려요.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[12px] border border-[color:var(--border-subtle)] bg-[color:var(--color-air)] px-4 h-[52px]">
                <span className="flex-1 text-body text-tertiary">
                  예) 합정 근처에서 마사지건 3일만 써보고 싶어요
                </span>
                <span className="text-caption text-tertiary">Mock</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SEARCH_CHIPS.map((chip) => (
                  <Badge key={chip} tone="neutral">
                    {chip}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="bg-white border-y border-[color:var(--border-subtle)]">
        <div className="container-main py-16">
          <SectionHeader
            eyebrow="안전한 거래"
            title="복잡한 검증을 단순한 신뢰로."
            description="CoRent는 검수, 보증, 정산을 사용자가 보지 않아도 되는 만큼 숨깁니다. 화면에는 필요한 것만 남아요."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
            {TRUST_POINTS.map((p) => (
              <Card key={p.title} padding="lg">
                <div className="flex flex-col gap-3">
                  <h3 className="text-title">{p.title}</h3>
                  <p className="text-body-small text-secondary">{p.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="container-main py-24">
        <div className="flex items-end justify-between mb-12 gap-6 flex-wrap">
          <SectionHeader
            eyebrow="오늘의 추천"
            title="며칠만 살아볼 만한 물건들."
            description="서울 직거래 기준으로 큐레이션된 인기 카테고리."
          />
          <Button href="/search" variant="secondary" size="md">
            전체 결과 보기
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="bg-white border-t border-[color:var(--border-subtle)]">
        <div className="container-main py-24 grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <SectionHeader
            eyebrow="판매자에게"
            title={
              <>
                집에 잠든 물건을
                <br />
                작은 렌탈 사업장으로.
              </>
            }
            description="대화형 AI가 등록을 도와줘요. 사진 몇 장과 짧은 답변으로 첫 게시까지 완료할 수 있어요."
          />
          <Card padding="lg">
            <div className="flex flex-col gap-6">
              <div className="flex items-baseline justify-between">
                <span className="text-body text-secondary">수수료</span>
                <span className="text-h3">10%</span>
              </div>
              <div className="divider" />
              <div className="flex items-baseline justify-between">
                <span className="text-body text-secondary">정산 시점</span>
                <span className="text-body">반납 확인 후</span>
              </div>
              <div className="divider" />
              <div className="flex items-baseline justify-between">
                <span className="text-body text-secondary">시리얼 번호</span>
                <span className="text-body">비공개 보관</span>
              </div>
              <Button href="/sell">대화로 등록 시작하기</Button>
            </div>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
