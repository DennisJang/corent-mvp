import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionHeader } from "@/components/SectionHeader";
import { SellerDashboardStat } from "@/components/SellerDashboardStat";
import {
  ACTIVE_RENTALS,
  DASHBOARD_SUMMARY,
  LISTED_ITEMS,
  PENDING_REQUESTS,
  SELLER,
} from "@/data/dashboard";
import { calculateSettlement, formatKRW } from "@/lib/format";

export default function DashboardPage() {
  return (
    <PageShell width="dashboard">
      <section className="container-dashboard py-16">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="flex flex-col gap-4 max-w-[640px]">
            <Badge>판매자 대시보드</Badge>
            <SectionHeader
              size="h1"
              title={
                <>
                  안녕하세요, {SELLER.name} 님.
                  <br />
                  이번 달도 차분하게.
                </>
              }
              description="대여 요청과 반납만 확인하면 돼요. 정산은 반납 확인 후 자동으로 진행됩니다."
            />
          </div>
          <Button href="/sell">새 물건 등록하기</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
          <SellerDashboardStat
            label="이번 달 정산 예정"
            value={formatKRW(DASHBOARD_SUMMARY.monthlyEarnings)}
            hint={`수수료 차감 후 ${formatKRW(calculateSettlement(DASHBOARD_SUMMARY.monthlyEarnings))}`}
          />
          <SellerDashboardStat
            label="활성 대여"
            value={`${DASHBOARD_SUMMARY.activeRentals}건`}
            hint={`${DASHBOARD_SUMMARY.returnsDueSoon}건 곧 반납`}
          />
          <SellerDashboardStat
            label="대기 중인 요청"
            value={`${DASHBOARD_SUMMARY.pendingRequests}건`}
            hint="응답이 빠를수록 매칭이 잘 돼요"
          />
          <SellerDashboardStat
            label="신뢰도"
            value={`${SELLER.trustScore.toFixed(1)} / 5.0`}
            hint={`리뷰 ${SELLER.reviewCount}건`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 mt-16">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-title">대기 중인 대여 요청</h3>
              <Badge>{PENDING_REQUESTS.length}건</Badge>
            </div>
            <ul className="flex flex-col">
              {PENDING_REQUESTS.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between ${
                    i !== PENDING_REQUESTS.length - 1
                      ? "border-b border-[color:var(--border-subtle)]"
                      : ""
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-body font-medium">
                      {r.productName}
                    </span>
                    <span className="text-body-small text-secondary">
                      {r.borrowerName} · {r.duration} ·{" "}
                      {formatKRW(r.amount)} · {r.requestedAt}
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
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-title">활성 대여</h3>
              <Badge>실시간</Badge>
            </div>
            <ul className="flex flex-col">
              {ACTIVE_RENTALS.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-start justify-between gap-6 py-5 ${
                    i !== ACTIVE_RENTALS.length - 1
                      ? "border-b border-[color:var(--border-subtle)]"
                      : ""
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-body font-medium">
                      {r.productName}
                    </span>
                    <span className="text-body-small text-secondary">
                      {r.borrowerName} · 반납 {r.returnDue}
                    </span>
                  </div>
                  <Badge tone="neutral">{r.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card padding="lg" className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-title">등록된 물건</h3>
            <Button href="/sell" variant="secondary" size="md">
              새 물건 등록
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-caption text-tertiary uppercase">
                  <th className="py-3 pr-6 font-medium">물건</th>
                  <th className="py-3 pr-6 font-medium">상태</th>
                  <th className="py-3 pr-6 font-medium">조회</th>
                  <th className="py-3 pr-6 font-medium">이번 달 대여</th>
                </tr>
              </thead>
              <tbody>
                {LISTED_ITEMS.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[color:var(--border-subtle)]"
                  >
                    <td className="py-4 pr-6 text-body">{item.productName}</td>
                    <td className="py-4 pr-6">
                      <Badge
                        tone={item.status === "게시됨" ? "primary" : "neutral"}
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="py-4 pr-6 text-body-small text-secondary">
                      {item.views}
                    </td>
                    <td className="py-4 pr-6 text-body-small text-secondary">
                      {item.rentalsThisMonth}건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}
