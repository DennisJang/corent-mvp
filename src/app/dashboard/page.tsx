import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SellerDashboardStat } from "@/components/SellerDashboardStat";
import {
  ACTIVE_RENTALS,
  DASHBOARD_SUMMARY,
  LISTED_ITEMS,
  PENDING_REQUESTS,
  SELLER,
  type ActiveRental,
  type ListedItem,
} from "@/data/dashboard";
import { calculateSettlement, formatKRW } from "@/lib/format";

export default function DashboardPage() {
  return (
    <PageShell width="dashboard">
      <section className="border-b border-black">
        <div className="container-dashboard py-16">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <div className="flex flex-col gap-6 max-w-[640px]">
              <div className="flex items-baseline justify-between border-b border-black pb-4">
                <span className="text-caption">Seller Ledger</span>
                <span className="text-caption text-[color:var(--ink-60)]">
                  {SELLER.name} / Seoul
                </span>
              </div>
              <h1 className="text-h1">
                안녕하세요, {SELLER.name} 님.
                <br />
                이번 달도 차분하게.
              </h1>
              <p className="text-body text-[color:var(--ink-60)] max-w-[480px]">
                대여 요청과 반납만 확인하면 돼요. 정산은 반납 확인 후 자동으로
                진행됩니다.
              </p>
            </div>
            <Button href="/sell">새 물건 등록하기</Button>
          </div>
        </div>
      </section>

      {/* Stat ledger — large numbers */}
      <section className="border-b border-black">
        <div className="container-dashboard">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-l border-[color:var(--ink-12)]">
            <SellerDashboardStat
              index={0}
              label="이번 달 정산 예정"
              value={formatKRW(DASHBOARD_SUMMARY.monthlyEarnings)}
              hint={`수수료 차감 후 ${formatKRW(
                calculateSettlement(DASHBOARD_SUMMARY.monthlyEarnings),
              )}`}
            />
            <SellerDashboardStat
              index={1}
              label="활성 대여"
              value={`${DASHBOARD_SUMMARY.activeRentals}`}
              hint={`${DASHBOARD_SUMMARY.returnsDueSoon}건 곧 반납`}
            />
            <SellerDashboardStat
              index={2}
              label="대기 중인 요청"
              value={`${DASHBOARD_SUMMARY.pendingRequests}`}
              hint="응답이 빠를수록 매칭이 잘 돼요"
            />
            <SellerDashboardStat
              index={3}
              label="신뢰도"
              value={`${SELLER.trustScore.toFixed(1)}`}
              hint={`5.0 만점 · 리뷰 ${SELLER.reviewCount}건`}
            />
          </div>
        </div>
      </section>

      {/* Pending + Active */}
      <section className="border-b border-black">
        <div className="container-dashboard py-16">
          <div className="grid-12 gap-y-12 items-start">
            <div className="col-span-12 md:col-span-7">
              <PendingRequestsBlock />
            </div>
            <div className="col-span-12 md:col-span-5">
              <ActiveRentalsBlock rentals={ACTIVE_RENTALS} />
            </div>
          </div>
        </div>
      </section>

      {/* Listed items table */}
      <section>
        <div className="container-dashboard py-16">
          <div className="flex items-baseline justify-between border-b border-black pb-4 mb-6">
            <h3 className="text-title">등록된 물건</h3>
            <span className="text-caption text-[color:var(--ink-60)]">
              {LISTED_ITEMS.length} items
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-caption text-[color:var(--ink-60)]">
                  <th className="py-3 pr-6 font-medium">물건</th>
                  <th className="py-3 pr-6 font-medium">상태</th>
                  <th className="py-3 pr-6 font-medium text-right">조회</th>
                  <th className="py-3 pl-6 font-medium text-right">
                    이번 달 대여
                  </th>
                </tr>
              </thead>
              <tbody>
                {LISTED_ITEMS.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[color:var(--ink-12)]"
                  >
                    <td className="py-5 pr-6 text-body">{item.productName}</td>
                    <td className="py-5 pr-6">
                      <ListedStatusBadge status={item.status} />
                    </td>
                    <td className="py-5 pr-6 text-body text-right tabular-nums">
                      {item.views}
                    </td>
                    <td className="py-5 pl-6 text-body text-right tabular-nums">
                      {item.rentalsThisMonth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-black pt-6 mt-6 flex justify-end">
            <Button href="/sell" variant="secondary" size="md">
              새 물건 등록
            </Button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function PendingRequestsBlock() {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">대기 중인 대여 요청</h3>
        <Badge variant="dashed">{PENDING_REQUESTS.length}건</Badge>
      </header>
      <ul className="flex flex-col">
        {PENDING_REQUESTS.map((r, i) => (
          <li
            key={r.id}
            className={`grid grid-cols-[60px_1fr_auto] gap-6 px-6 py-5 items-center ${
              i !== PENDING_REQUESTS.length - 1
                ? "border-b border-[color:var(--ink-12)]"
                : ""
            }`}
          >
            <span className="text-caption text-[color:var(--ink-60)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-body font-medium">{r.productName}</span>
              <span className="text-small text-[color:var(--ink-60)]">
                {r.borrowerName} · {r.duration} · {formatKRW(r.amount)} ·{" "}
                {r.requestedAt}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="md">
                거절
              </Button>
              <Button size="md">승인</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActiveRentalsBlock({ rentals }: { rentals: ActiveRental[] }) {
  return (
    <section className="bg-white border border-[color:var(--ink-12)]">
      <header className="flex items-baseline justify-between border-b border-black px-6 py-4">
        <h3 className="text-title">활성 대여</h3>
        <span className="text-caption text-[color:var(--ink-60)]">실시간</span>
      </header>
      <ul className="flex flex-col">
        {rentals.map((r, i) => {
          const isReturnPending = r.status === "반납 대기";
          return (
            <li
              key={r.id}
              className={`grid grid-cols-[1fr_auto] gap-6 px-6 py-5 items-start ${
                i !== rentals.length - 1
                  ? "border-b border-[color:var(--ink-12)]"
                  : ""
              }`}
            >
              <div className="flex flex-col gap-1">
                <span className="text-body font-medium">{r.productName}</span>
                <span className="text-small text-[color:var(--ink-60)]">
                  {r.borrowerName} · 반납 {r.returnDue}
                </span>
              </div>
              <Badge variant={isReturnPending ? "selected" : "outline"}>
                {r.status}
              </Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ListedStatusBadge({ status }: { status: ListedItem["status"] }) {
  if (status === "게시됨") return <Badge variant="filled">{status}</Badge>;
  if (status === "심사 중") return <Badge variant="dashed">{status}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
