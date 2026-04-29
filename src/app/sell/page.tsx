import { PageShell } from "@/components/PageShell";
import { AIChatPanel } from "@/components/AIChatPanel";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { SafetyCodeCard } from "@/components/SafetyCodeCard";
import { formatKRW } from "@/lib/format";

const CONVERSATION = [
  {
    kind: "ai" as const,
    index: 1,
    text: "등록할 물건의 종류를 알려주세요.",
  },
  {
    kind: "user" as const,
    text: "테라건 미니 2세대를 빌려주려고 해요.",
  },
  {
    kind: "ai" as const,
    index: 2,
    text: "구매한 지 얼마나 됐을까요? 그리고 사용감은 어떤 편인가요?",
  },
  {
    kind: "user" as const,
    text: "작년 6월에 샀고, 외관에 잔기스 하나 정도. 작동은 멀쩡해요.",
  },
  {
    kind: "ai" as const,
    index: 3,
    text: "비슷한 물건의 평균 가격으로 1일 9,800원, 3일 22,400원, 7일 42,000원이 추천돼요. 가격은 직접 조정할 수 있어요.",
  },
];

const EXTRACTED_FIELDS = [
  { label: "Product", value: "Theragun Mini 2세대" },
  { label: "Category", value: "마사지건" },
  { label: "Purchased", value: "2025년 6월" },
  { label: "Condition", value: "사용감 적음" },
  { label: "Components", value: "본체 · 충전 케이블 · 파우치 · 헤드 1종" },
  { label: "Defects", value: "잔기스 1개" },
];

const RECOMMENDED_PRICES = {
  "1d": 9800,
  "3d": 22400,
  "7d": 42000,
};

const VERIFICATION_STEPS = [
  { n: "01", label: "물건 정보 입력", state: "완료" },
  { n: "02", label: "안전 코드 사진", state: "대기 중", pending: true },
  { n: "03", label: "비공개 정보 (선택)", state: "대기 중", pending: true },
  { n: "04", label: "사람 검수", state: "대기 중", pending: true },
];

export default function SellPage() {
  return (
    <PageShell>
      <section className="border-b border-black">
        <div className="container-main py-16 md:py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-7 flex flex-col gap-6">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Seller / Registration</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  Step 01 / 04
                </span>
              </div>
              <h1 className="text-h1">
                대화하면 상품 페이지가
                <br />
                만들어져요.
              </h1>
              <p className="text-body text-[color:var(--ink-60)] max-w-[520px]">
                AI가 필요한 정보를 자연스럽게 수집하고, 사진 몇 장만 더하면
                게시 가능한 초안이 완성돼요. 마지막 수정과 사람 검수가 끝나면
                게시됩니다.
              </p>
            </div>
            <div className="col-span-12 md:col-span-5 border border-[color:var(--ink-12)] p-6 flex flex-col gap-4">
              <span className="text-caption text-[color:var(--ink-60)]">
                Listing Preview / Draft
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-h3 tracking-tight">Theragun Mini</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  DRAFT
                </span>
              </div>
              <div className="border-t border-dashed border-[color:var(--line-dashed)] pt-3 flex items-baseline justify-between">
                <span className="text-small text-[color:var(--ink-60)]">
                  3일 추천가
                </span>
                <span className="text-title">
                  {formatKRW(RECOMMENDED_PRICES["3d"])}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Left 5 / Right 7 — conversation + listing preview */}
      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-5">
              <AIChatPanel
                blocks={CONVERSATION}
                hint="여기에 답해보세요 (모의)"
              />
            </div>

            <div className="col-span-12 md:col-span-7 flex flex-col gap-6">
              <section className="bg-white border border-[color:var(--ink-12)]">
                <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
                  <span className="text-caption">Extracted / 자동 추출</span>
                  <Badge variant="dashed">AI 추론</Badge>
                </header>
                <ul className="flex flex-col">
                  {EXTRACTED_FIELDS.map((f, i) => (
                    <li
                      key={f.label}
                      className={`grid grid-cols-[140px_1fr] gap-6 px-6 py-4 ${
                        i !== EXTRACTED_FIELDS.length - 1
                          ? "border-b border-[color:var(--ink-12)]"
                          : ""
                      }`}
                    >
                      <span className="text-caption text-[color:var(--ink-60)] pt-1">
                        {f.label}
                      </span>
                      <span className="text-body">{f.value}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-white border border-[color:var(--ink-12)]">
                <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
                  <span className="text-caption">AI Recommended Price</span>
                  <span className="text-caption text-[color:var(--ink-60)]">
                    조정 가능
                  </span>
                </header>
                <div className="grid grid-cols-3">
                  <PriceCell label="01 / Day" amount={RECOMMENDED_PRICES["1d"]} />
                  <PriceCell
                    label="03 / Days"
                    amount={RECOMMENDED_PRICES["3d"]}
                    highlight
                  />
                  <PriceCell label="07 / Days" amount={RECOMMENDED_PRICES["7d"]} />
                </div>
                <div className="px-6 py-4 border-t border-[color:var(--ink-12)]">
                  <span className="text-small text-[color:var(--ink-60)]">
                    최종 가격은 판매자가 결정합니다. 수수료 10%는 반납 확인
                    후 자동으로 빠져나갑니다.
                  </span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      {/* Verification checklist + serial */}
      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-6">
              <SafetyCodeCard code="B-428" status="대기 중" />
            </div>
            <div className="col-span-12 md:col-span-6 bg-white border border-[color:var(--ink-12)] p-8 flex flex-col gap-6">
              <header className="flex items-baseline justify-between border-b border-black pb-4">
                <h3 className="text-title">비공개 보관 정보</h3>
                <Badge variant="dashed">선택 입력</Badge>
              </header>
              <p className="text-body text-[color:var(--ink-80)]">
                시리얼 번호는 다른 사용자에게 보이지 않아요. 분쟁 발생 시
                내부적으로만 사용됩니다.
              </p>
              <Input placeholder="시리얼 번호 (선택)" />
              <span className="text-caption text-[color:var(--ink-60)]">
                저장 후에는 마스킹 처리되어 표시돼요.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Verification ledger */}
      <section className="border-b border-black">
        <div className="container-main py-16">
          <div className="border-b border-black pb-4 mb-6">
            <span className="text-caption">Verification Checklist</span>
          </div>
          <ol className="flex flex-col">
            {VERIFICATION_STEPS.map((s, i) => (
              <li
                key={s.n}
                className={`grid grid-cols-[80px_1fr_140px] gap-6 py-5 items-baseline ${
                  i !== VERIFICATION_STEPS.length - 1
                    ? s.pending
                      ? "border-b border-dashed border-[color:var(--line-dashed)]"
                      : "border-b border-[color:var(--ink-12)]"
                    : ""
                }`}
              >
                <span className="text-h3 tracking-tight">{s.n}</span>
                <span className="text-body">{s.label}</span>
                <span className="text-caption text-[color:var(--ink-60)] text-right">
                  {s.state}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="container-main py-16">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 border-t border-black pt-8">
            <div className="flex flex-col gap-2 max-w-[560px]">
              <h3 className="text-title">검수 후 자동으로 게시돼요.</h3>
              <p className="text-small text-[color:var(--ink-60)]">
                사람 검수까지 평균 2시간 이내. 게시 후에도 가격과 기간 옵션은
                언제든 수정할 수 있어요.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary">초안으로 저장</Button>
              <Button>검수 요청 보내기</Button>
            </div>
          </div>
        </div>
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
      className={`flex flex-col gap-2 px-6 py-6 border-l first:border-l-0 border-[color:var(--ink-12)] ${
        highlight ? "bg-black text-white" : "bg-white text-black"
      }`}
    >
      <span
        className={`text-caption ${
          highlight ? "text-white/70" : "text-[color:var(--ink-60)]"
        }`}
      >
        {label}
      </span>
      <span className="text-h3 tracking-tight">{formatKRW(amount)}</span>
    </div>
  );
}
