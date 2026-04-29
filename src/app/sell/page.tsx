import { PageShell } from "@/components/PageShell";
import { AIChatPanel } from "@/components/AIChatPanel";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { SafetyCodeCard } from "@/components/SafetyCodeCard";
import { SectionHeader } from "@/components/SectionHeader";
import { formatKRW } from "@/lib/format";

const CHAT = [
  {
    role: "ai" as const,
    text: "안녕하세요. 등록할 물건의 종류를 알려주세요.",
  },
  {
    role: "user" as const,
    text: "테라건 미니 2세대를 빌려주려고 해요.",
  },
  {
    role: "ai" as const,
    text: "구매한 지 얼마나 됐을까요? 그리고 사용감은 어떤 편인가요?",
  },
  {
    role: "user" as const,
    text: "작년 6월에 샀고, 외관에 잔기스 하나 정도. 작동은 멀쩡해요.",
  },
  {
    role: "ai" as const,
    text: "감사합니다. 비슷한 물건의 평균 가격으로 1일 9,800원, 3일 22,400원, 7일 42,000원이 추천돼요. 가격은 직접 조정할 수 있어요.",
  },
];

const EXTRACTED_FIELDS = [
  { label: "물건 이름", value: "Theragun Mini 2세대" },
  { label: "카테고리", value: "마사지건" },
  { label: "구매 시기", value: "2025년 6월" },
  { label: "상태", value: "사용감 적음" },
  { label: "구성품", value: "본체 · 충전 케이블 · 파우치 · 헤드 1종" },
  { label: "결함", value: "잔기스 1개" },
];

const RECOMMENDED_PRICES = {
  "1d": 9800,
  "3d": 22400,
  "7d": 42000,
};

export default function SellPage() {
  return (
    <PageShell>
      <section className="container-main py-16">
        <div className="flex flex-col gap-6 max-w-[720px]">
          <Badge>판매자 등록</Badge>
          <SectionHeader
            size="h1"
            title="대화하면 상품 페이지가 만들어져요."
            description="AI가 필요한 정보를 자연스럽게 수집하고, 사진 몇 장만 더하면 게시 가능한 초안이 완성돼요. 마지막 수정과 사람 검수가 끝나면 게시됩니다."
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 mt-12">
          <AIChatPanel turns={CHAT} hint="여기에 답해보세요 (모의)" />

          <div className="flex flex-col gap-6">
            <Card padding="lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-title">자동 추출된 정보</h3>
                <Badge>편집 가능</Badge>
              </div>
              <ul className="flex flex-col">
                {EXTRACTED_FIELDS.map((f, i) => (
                  <li
                    key={f.label}
                    className={`flex items-start justify-between gap-6 py-4 ${
                      i !== EXTRACTED_FIELDS.length - 1
                        ? "border-b border-[color:var(--border-subtle)]"
                        : ""
                    }`}
                  >
                    <span className="text-body-small text-secondary">
                      {f.label}
                    </span>
                    <span className="text-body text-right max-w-[280px]">
                      {f.value}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card padding="lg">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-title">AI 추천 가격</h3>
                  <Badge>3일 추천</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <PriceCell label="1일" amount={RECOMMENDED_PRICES["1d"]} />
                  <PriceCell
                    label="3일"
                    amount={RECOMMENDED_PRICES["3d"]}
                    highlight
                  />
                  <PriceCell label="7일" amount={RECOMMENDED_PRICES["7d"]} />
                </div>
                <span className="text-body-small text-secondary">
                  최종 가격은 판매자가 결정해요. 수수료 10%는 반납 확인 후
                  자동으로 빠져나갑니다.
                </span>
              </div>
            </Card>
          </div>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-16">
          <SafetyCodeCard code="B-428" status="대기 중" />
          <Card padding="lg">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-title">비공개 보관 정보</h3>
                <Badge tone="neutral">선택 입력</Badge>
              </div>
              <p className="text-body text-secondary">
                시리얼 번호는 다른 사용자에게 보이지 않아요. 분쟁 발생 시
                내부적으로만 사용됩니다.
              </p>
              <Input placeholder="시리얼 번호 (선택)" />
              <span className="text-caption text-tertiary">
                저장 후에는 마스킹 처리되어 표시돼요.
              </span>
            </div>
          </Card>
        </section>

        <section className="mt-16">
          <Card padding="lg">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex flex-col gap-2 max-w-[560px]">
                <h3 className="text-title">검수 후 자동으로 게시돼요</h3>
                <p className="text-body text-secondary">
                  사람 검수까지 평균 2시간 이내. 게시 후에도 가격과 기간 옵션은
                  언제든 수정할 수 있어요.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary">초안으로 저장</Button>
                <Button>검수 요청 보내기</Button>
              </div>
            </div>
          </Card>
        </section>
      </section>
    </PageShell>
  );
}

function PriceCell({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-[12px] border px-4 py-3 ${
        highlight
          ? "border-[color:var(--color-primary)] bg-[color:var(--tint-primary-soft)]"
          : "border-[color:var(--border-subtle)] bg-white"
      }`}
    >
      <span className="text-body-small text-secondary">{label}</span>
      <span className="text-title">{formatKRW(amount)}</span>
    </div>
  );
}
