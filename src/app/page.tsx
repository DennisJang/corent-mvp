import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/Button";
import { FeedbackIntakeCard } from "@/components/FeedbackIntakeCard";
import { ProductCard } from "@/components/ProductCard";
import { AISearchInput } from "@/components/AISearchInput";
import { PRODUCTS } from "@/data/products";
import { mapStaticProductToPublicListing } from "@/lib/services/publicListingService";

const TRUST_POINTS = [
  {
    n: "01",
    title: "AI 1차 + 사람 최종 검수",
    desc: "필수 사진과 작동 상태를 자동으로 점검한 뒤, 사람이 한 번 더 확인합니다.",
  },
  {
    n: "02",
    title: "오늘 찍은 사진 검증",
    desc: "그날의 안전 코드를 제품 옆에 두고 촬영해 신선도를 확인합니다.",
  },
  {
    n: "03",
    title: "반납 확인 + 클레임 검토",
    desc: "요청·승인·인계·반납 흐름을 기록하고, 반납 후 짧은 검토 기간이 끝나면 다음 단계로 진행합니다. 베타에서는 실제 결제·정산은 진행되지 않아요.",
  },
];

const DURATIONS = [
  { key: "1d", label: "01 / DAY", title: "하루만 써보기" },
  { key: "3d", label: "03 / DAYS", title: "주말 동안 써보기" },
  { key: "7d", label: "07 / DAYS", title: "한 주 동안 써보기" },
];

export default function LandingPage() {
  // Phase 1.12: render featured cards through the PublicListing
  // projection so the landing page reads from the same safe shape as
  // search and storefront. The slice still surfaces only static
  // products on the home page (approved persisted listings appear on
  // search / storefront).
  const featured = PRODUCTS.slice(0, 3).map(mapStaticProductToPublicListing);

  return (
    <PageShell>
      {/* Hero — Swiss poster, 7 / 5 split */}
      <section className="border-b border-black">
        <div className="container-main py-24 md:py-32">
          <div className="grid-12 items-start gap-y-16">
            {/* Left 7 columns — large headline */}
            <div className="col-span-12 md:col-span-7 flex flex-col gap-8">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Seoul Beta / AI Rental</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  v0.1
                </span>
              </div>
              <h1 className="text-display">
                사기 전에,
                <br />
                며칠 써보기.
              </h1>
              <p className="text-body text-[color:var(--ink-80)] max-w-[480px]">
                서울에서 마사지건, 홈케어 디바이스, 소형 운동기구를 1일·3일·7일
                동안 빌려 써보세요. 평가는 직접 써본 뒤에.
              </p>
              <div className="flex flex-wrap gap-3 pt-4">
                <Button href="/search">며칠 써볼 물건 찾기</Button>
                <Button href="/sell" variant="secondary">
                  내 물건 빌려주기
                </Button>
              </div>
            </div>

            {/* Right 5 columns — AI search + orbital diagram */}
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6">
              <OrbitDiagram />
              <AISearchInput />
            </div>
          </div>
        </div>
      </section>

      {/* Duration strip — 1 / 3 / 7 */}
      <section className="border-b border-black">
        <div className="container-main">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {DURATIONS.map((d, i) => (
              <div
                key={d.key}
                className={`px-8 py-12 ${
                  i !== 0
                    ? "md:border-l border-t md:border-t-0 border-[color:var(--ink-12)]"
                    : ""
                }`}
              >
                <div className="flex flex-col gap-3">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    {d.label}
                  </span>
                  <span className="text-h3 tracking-tight">{d.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust system — numbered */}
      <section className="border-b border-black">
        <div className="container-main py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-4 flex flex-col gap-6">
              <span className="text-caption">Trust System</span>
              <h2 className="text-h2">
                복잡한 검증을
                <br />
                단순한 신뢰로.
              </h2>
              <p className="text-body text-[color:var(--ink-60)] max-w-[360px]">
                CoRent는 검수와 흐름 기록만 사용자가 보이는 만큼만 남깁니다.
                베타에서는 실제 결제·보증금·정산이 동작하지 않아요.
              </p>
            </div>
            <ol className="col-span-12 md:col-span-8 flex flex-col">
              {TRUST_POINTS.map((p, i) => (
                <li
                  key={p.n}
                  className={`grid grid-cols-[80px_1fr] gap-8 py-8 ${
                    i !== TRUST_POINTS.length - 1
                      ? "border-b border-[color:var(--ink-12)]"
                      : ""
                  } ${i === 0 ? "border-t border-black" : ""}`}
                >
                  <span className="text-h3 tracking-tight">{p.n}</span>
                  <div className="flex flex-col gap-3">
                    <h3 className="text-title">{p.title}</h3>
                    <p className="text-body text-[color:var(--ink-60)]">
                      {p.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Featured — 3-column editorial grid */}
      <section className="border-b border-black">
        <div className="container-main py-24">
          <div className="flex items-end justify-between flex-wrap gap-6 border-b border-black pb-6 mb-12">
            <div className="flex flex-col gap-3">
              <span className="text-caption">Selected / 03 items</span>
              <h2 className="text-h2">며칠 써볼 만한 물건들</h2>
            </div>
            <Button href="/search" variant="secondary" size="md">
              전체 결과 보기
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-l border-[color:var(--ink-12)]">
            {featured.map((listing) => (
              <div
                key={listing.publicListingId}
                className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px"
              >
                <ProductCard listing={listing} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Seller — 5 / 7 split */}
      <section>
        <div className="container-main py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6">
              <span className="text-caption">For Sellers</span>
              <h2 className="text-h2">
                집에 잠든 물건을
                <br />
                작은 렌탈 사업장으로.
              </h2>
              <p className="text-body text-[color:var(--ink-60)] max-w-[400px]">
                대화형 AI가 등록을 도와줘요. 사진 몇 장과 짧은 답변으로 첫
                게시까지 완료할 수 있어요.
              </p>
              <div className="pt-2">
                <Button href="/sell">대화로 등록 시작하기</Button>
              </div>
            </div>
            <div className="col-span-12 md:col-span-7 border border-black">
              <div className="grid grid-cols-2">
                <div className="px-6 py-8 border-r border-b border-black flex flex-col gap-2">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    베타 모드
                  </span>
                  <span className="text-h3 tracking-tight">
                    실제 결제·정산 미연결
                  </span>
                </div>
                <div className="px-6 py-8 border-b border-black flex flex-col gap-2">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    검토 흐름
                  </span>
                  <span className="text-h3 tracking-tight">반납 확인 후</span>
                </div>
                <div className="px-6 py-8 border-r border-black flex flex-col gap-2">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    시리얼 번호
                  </span>
                  <span className="text-h3 tracking-tight">비공개 보관</span>
                </div>
                <div className="px-6 py-8 flex flex-col gap-2">
                  <span className="text-caption text-[color:var(--ink-60)]">
                    수령 방식
                  </span>
                  <span className="text-h3 tracking-tight">서울 직거래</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closed-alpha feedback / wishlist intake */}
      <section className="border-t border-black">
        <div className="container-main py-24">
          <div className="grid-12 items-start gap-y-12">
            <div className="col-span-12 md:col-span-5 flex flex-col gap-6">
              <span className="text-caption">Validation Loop</span>
              <h2 className="text-h2">
                어떤 물건을
                <br />
                며칠 써보고 싶으세요?
              </h2>
              <p className="text-body text-[color:var(--ink-60)] max-w-[400px]">
                CoRent는 사람들이 무엇을 사기 전에 며칠 써보고 싶은지를
                같이 알아보는 중이에요. 한 줄 메모도 도움이 돼요.
              </p>
            </div>
            <div className="col-span-12 md:col-span-7">
              <FeedbackIntakeCard sourcePage="/" />
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function OrbitDiagram() {
  return (
    <div
      className="w-full aspect-square border border-[color:var(--ink-12)] flex items-center justify-center"
      aria-hidden
    >
      <svg
        viewBox="0 0 320 320"
        width="100%"
        height="100%"
        fill="none"
        stroke="black"
        strokeWidth="1"
      >
        {/* Outer dashed orbit */}
        <circle
          cx="160"
          cy="160"
          r="140"
          strokeDasharray="3 4"
          opacity="0.4"
        />
        {/* Mid solid orbit */}
        <circle cx="160" cy="160" r="92" opacity="0.6" />
        {/* Inner dashed */}
        <circle cx="160" cy="160" r="48" strokeDasharray="3 4" opacity="0.5" />
        {/* Axes */}
        <line x1="20" y1="160" x2="300" y2="160" opacity="0.12" />
        <line x1="160" y1="20" x2="160" y2="300" opacity="0.12" />

        {/* Nodes */}
        <circle cx="160" cy="160" r="4" fill="black" stroke="none" />
        <circle cx="252" cy="160" r="5" fill="white" stroke="black" />
        <circle cx="160" cy="68" r="5" fill="white" stroke="black" />
        <circle
          cx="68"
          cy="160"
          r="5"
          fill="white"
          stroke="black"
          strokeDasharray="2 2"
        />
        <circle cx="160" cy="252" r="5" fill="black" stroke="none" />
        <circle cx="300" cy="160" r="3" fill="black" stroke="none" />

        {/* Labels */}
        <text
          x="160"
          y="180"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="8"
          fill="black"
          textAnchor="middle"
        >
          USER
        </text>
        <text
          x="252"
          y="148"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="8"
          fill="black"
          textAnchor="middle"
        >
          ITEM
        </text>
        <text
          x="160"
          y="56"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="8"
          fill="black"
          textAnchor="middle"
        >
          AI
        </text>
        <text
          x="68"
          y="148"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="8"
          fill="black"
          textAnchor="middle"
        >
          MATCH
        </text>
        <text
          x="160"
          y="270"
          fontFamily="Helvetica, Arial, sans-serif"
          fontSize="8"
          fill="black"
          textAnchor="middle"
        >
          PICKUP
        </text>
      </svg>
    </div>
  );
}
