// Bundle 2 Slice 4 — founder validation cockpit.
//
// A narrow, founder-only operational surface that lets the founder
// review closed-alpha signals in one place:
//
//   - recent feedback / wishlist submissions (the only PII slot
//     intentionally surfaced is `contactEmail`, because the founder
//     needs it to follow up with optionally-anonymous testers);
//   - recent server listings across every status (so drafts can be
//     triaged toward `approved`);
//   - recent renter requests across every status;
//   - aggregate counts by status (reused from the existing admin
//     dashboard panel).
//
// Auth posture:
//
//   - `requireFounderSession()` runs inside `readFounderCockpitData`.
//     Non-founder / non-allowlisted users → `kind: "forbidden"` →
//     this page calls `notFound()`. The same fail-closed posture
//     `/admin/dashboard` uses.
//
// Backend posture:
//
//   - Mock / default backend → `kind: "inactive"` → the page
//     renders a calm "supabase backend is not active in this
//     environment" panel. localStorage is NEVER read; the founder's
//     validation signals only have meaning against the real
//     `corent-dev` schema.
//
// Pre-payment posture:
//
//   - The cockpit copy is explicit: requests show as "결제 전" /
//     "확정 전" / reference-only totals. The publish button
//     surfaces "공개로 승인" only — no payment / lifecycle / trust
//     / claim language anywhere on this surface.
//
// Scope:
//
//   - Read-only surface PLUS one founder-controlled mutation
//     (publish). No approve/decline/cancel/payment/lifecycle.
//
// References:
//   - `src/server/admin/founderCockpitData.ts` (orchestrator)
//   - `src/server/admin/auth.ts` (`requireFounderSession`)
//   - `src/server/listings/publishListing.ts` (publish action)
//   - `src/components/PublishListingButton.tsx` (publish UI)
//   - `docs/corent_validation_bundle2_slice4_founder_cockpit_note.md`

import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { FeedbackReviewControls } from "@/components/FeedbackReviewControls";
import { PublishListingButton } from "@/components/PublishListingButton";
import { CATEGORY_LABEL } from "@/data/products";
import { formatKRW } from "@/lib/format";
import {
  readFounderCockpitData,
  type CockpitFeedbackRow,
  type CockpitListingRow,
  type CockpitRequestRow,
} from "@/server/admin/founderCockpitData";
import { getBackendMode } from "@/server/backend/mode";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export default async function FounderCockpitPage() {
  const result = await readFounderCockpitData();

  if (result.kind === "forbidden") {
    notFound();
  }

  if (result.kind === "inactive") {
    return (
      <main className="container-main py-16">
        <header className="border-b border-black pb-4 mb-12 flex items-baseline justify-between">
          <span className="text-caption">Admin / Founder Cockpit</span>
          <span className="text-caption text-[color:var(--ink-60)]">
            {result.founderEmail}
          </span>
        </header>
        <section className="border border-dashed border-[color:var(--line-dashed)] p-12 max-w-[640px]">
          <h1 className="text-h2">서버 백엔드가 아직 활성화되지 않았어요.</h1>
          <p className="text-body text-[color:var(--ink-60)] mt-4">
            검증 콕핏은 Supabase 모드에서만 신호를 보여드려요. 데모 환경에서는
            로컬 데이터를 서버 데이터인 것처럼 보여주지 않아요. 운영 환경에서
            <code className="px-1">CORENT_BACKEND_MODE=supabase</code> 와 서버
            전용 환경변수가 설정되어 있는지 확인해주세요.
          </p>
        </section>
      </main>
    );
  }

  const { data } = result;
  const backendMode = getBackendMode();

  return (
    <main className="container-main py-16 flex flex-col gap-16">
      <header className="border-b border-black pb-4 flex items-baseline justify-between">
        <span className="text-caption">Admin / Founder Cockpit</span>
        <span className="text-caption text-[color:var(--ink-60)]">
          {data.founderEmail} · backend={backendMode}
        </span>
      </header>

      {data.aggregates ? (
        <section>
          <header className="flex items-baseline justify-between border-b border-black pb-3 mb-6">
            <h2 className="text-title">상태별 집계</h2>
            <span className="text-caption text-[color:var(--ink-60)]">
              counts only
            </span>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-y-12">
            <CountTable
              title="Listings by status"
              rows={Object.entries(data.aggregates.listings.byStatus).map(
                ([label, count]) => ({ label, count }),
              )}
              total={data.aggregates.listings.total}
            />
            <CountTable
              title="Rental intents by status"
              rows={Object.entries(data.aggregates.rentalIntents.byStatus).map(
                ([label, count]) => ({ label, count }),
              )}
              total={data.aggregates.rentalIntents.total}
            />
            <CountTable
              title="Profiles"
              rows={[]}
              total={data.aggregates.profiles.total}
            />
          </div>
        </section>
      ) : null}

      <section>
        <header className="flex items-baseline justify-between border-b border-black pb-3 mb-6">
          <h2 className="text-title">최근 리스팅</h2>
          <Badge variant="dashed">{data.listings.length}건</Badge>
        </header>
        <p className="text-caption text-[color:var(--ink-60)] mb-4">
          드래프트·심사 대기·공개 상태를 모두 표시해요. 비공개 필드(rawSellerInput,
          시리얼 번호, 검증 메모)는 이 화면에서 노출하지 않아요.
        </p>
        {data.listings.length === 0 ? (
          <p className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2">
            아직 서버 리스팅이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col">
            {data.listings.map((row) => (
              <CockpitListingRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-baseline justify-between border-b border-black pb-3 mb-6">
          <h2 className="text-title">최근 대여 요청</h2>
          <Badge variant="dashed">{data.requests.length}건</Badge>
        </header>
        <p className="text-caption text-[color:var(--ink-60)] mb-4">
          요청만 표시돼요. 결제·정산은 아직 연결되어 있지 않아요. 승인·거절·환불은
          이 화면에서 처리하지 않아요.
        </p>
        {data.requests.length === 0 ? (
          <p className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2">
            아직 서버 요청이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col">
            {data.requests.map((row) => (
              <CockpitRequestRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="flex items-baseline justify-between border-b border-black pb-3 mb-6">
          <h2 className="text-title">최근 의견 / 위시리스트</h2>
          <Badge variant="dashed">{data.feedback.length}건</Badge>
        </header>
        <p className="text-caption text-[color:var(--ink-60)] mb-4">
          연락처 이메일은 응답이 있을 때만 표시돼요. 다른 채널로 전달되거나
          저장되지 않아요.
        </p>
        {data.feedback.length === 0 ? (
          <p className="text-small text-[color:var(--ink-60)] border border-dashed border-[color:var(--line-dashed)] px-3 py-2">
            아직 의견이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col">
            {data.feedback.map((row) => (
              <CockpitFeedbackRowItem key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-[color:var(--ink-12)] pt-6 text-caption text-[color:var(--ink-60)]">
        Generated at {data.generatedAt}. 결제·정산·반납·클레임·신뢰 점수·알림은
        이 화면의 범위가 아니에요.
      </footer>
    </main>
  );
}

function CountTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div className="md:pr-6">
      <h3 className="text-title border-b border-[color:var(--ink-12)] pb-3 mb-4">
        {title}
      </h3>
      <p className="text-caption text-[color:var(--ink-60)] mb-3">
        Total: {total.toLocaleString("ko-KR")}
      </p>
      {rows.length === 0 ? (
        <p className="text-small text-[color:var(--ink-60)]">
          상태별 데이터가 없어요.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-baseline justify-between py-2 border-b border-[color:var(--ink-12)]"
            >
              <span className="text-body">{r.label}</span>
              <span className="text-body tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CockpitListingRowItem({ row }: { row: CockpitListingRow }) {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-6 py-4 border-b border-[color:var(--ink-12)] items-start">
      <div className="flex flex-col gap-1">
        <span className="text-body font-medium">{row.itemName}</span>
        <span className="text-small text-[color:var(--ink-60)]">
          {CATEGORY_LABEL[row.category]} · {row.pickupArea ?? "권역 미지정"}
        </span>
        <span className="text-caption text-[color:var(--ink-60)]">
          1일 {formatKRW(row.prices.oneDay)} · 3일{" "}
          {formatKRW(row.prices.threeDays)} · 7일{" "}
          {formatKRW(row.prices.sevenDays)}
        </span>
        <span className="text-caption text-[color:var(--ink-60)]">
          seller={row.sellerId} · listing={row.id}
        </span>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className="text-caption">{row.status}</span>
        {row.status === "approved" ? (
          <span className="text-caption text-[color:var(--ink-60)]">
            이미 공개됨
          </span>
        ) : (
          <PublishListingButton listingId={row.id} />
        )}
      </div>
    </li>
  );
}

function CockpitRequestRowItem({ row }: { row: CockpitRequestRow }) {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-6 py-4 border-b border-[color:var(--ink-12)] items-start">
      <div className="flex flex-col gap-1">
        <span className="text-body font-medium">{row.productName}</span>
        <span className="text-small text-[color:var(--ink-60)]">
          {row.borrowerDisplayName ?? "익명"} · {row.durationDays}일 · 참고용{" "}
          {formatKRW(row.borrowerTotal)}
        </span>
        <span className="text-caption text-[color:var(--ink-60)]">
          seller={row.sellerId} · borrower={row.borrowerId ?? "—"} · listing=
          {row.listingId}
        </span>
        {row.pickupArea ? (
          <span className="text-caption text-[color:var(--ink-60)]">
            수령 권역: {row.pickupArea}
          </span>
        ) : null}
      </div>
      <span className="text-caption">{row.status}</span>
    </li>
  );
}

function CockpitFeedbackRowItem({ row }: { row: CockpitFeedbackRow }) {
  return (
    <li className="grid grid-cols-[1fr_auto] gap-6 py-4 border-b border-[color:var(--ink-12)] items-start">
      <div className="flex flex-col gap-1">
        <span className="text-caption text-[color:var(--ink-60)]">
          {row.kind} · {row.sourcePage ?? "—"}
        </span>
        <p className="text-body whitespace-pre-wrap">{row.message}</p>
        {row.itemName ? (
          <span className="text-small text-[color:var(--ink-60)]">
            아이템: {row.itemName}
          </span>
        ) : null}
        {row.contactEmail ? (
          <span className="text-small">연락처: {row.contactEmail}</span>
        ) : (
          <span className="text-caption text-[color:var(--ink-60)]">
            연락처 미입력
          </span>
        )}
      </div>
      <FeedbackReviewControls feedbackId={row.id} status={row.status} />
    </li>
  );
}
