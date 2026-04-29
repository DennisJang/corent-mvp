// Phase 1 terms of use. Static page. Korean + English. Draft copy —
// external legal review still required before any public traffic.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms — CoRent",
};

export default function TermsPage() {
  return (
    <main className="container-main py-16 max-w-[720px]">
      <header className="border-b border-black pb-4 mb-12">
        <span className="text-caption">Terms / 이용약관</span>
      </header>

      <section className="flex flex-col gap-8 text-body">
        <p className="text-small text-[color:var(--ink-60)]">
          Draft v1 — external legal review pending. Not a final, production
          policy. CoRent operates in pre-revenue validation: no platform fee
          is charged, no payment is processed, no deposit is held, and no
          settlement is paid out during this window.
        </p>

        <h1 className="text-h2">이용약관 (검증 베타)</h1>

        <p>
          CoRent는 사용자(대여자, lender)와 사용자(차용자, borrower) 사이의
          단기 대여 거래를 위한 C2C 마켓플레이스 및 거래 상태·신뢰
          워크플로우 레이어입니다. CoRent는 거래의 직접 당사자가 아닙니다.
        </p>

        <h2 className="text-h3">현재 단계의 한계 (검증 베타)</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>플랫폼 수수료를 부과하지 않습니다.</li>
          <li>결제, 보증금, 정산, 환불을 제공하지 않습니다.</li>
          <li>CoRent 자체 지갑/잔액을 제공하지 않습니다.</li>
          <li>업로드, 사진 검증, 신원 확인, 정확한 위치 매칭을 제공하지 않습니다.</li>
          <li>광고·구독·유료 중개 서비스를 운영하지 않습니다.</li>
          <li>현재 표시되는 가격 모델은 향후 검토 중인 안내일 뿐
            실제 청구되지 않습니다.</li>
        </ul>

        <h2 className="text-h3">대여자(lender) 책임</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>물품 상태와 구성품을 정확히 표기합니다.</li>
          <li>약속된 시간·장소에서 직거래로 인계·반납합니다.</li>
          <li>플랫폼 외부에서의 결제·송금을 시도하지 않습니다.</li>
        </ul>

        <h2 className="text-h3">차용자(borrower) 책임</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>약속된 시간 내에 반납하고 상태를 유지합니다.</li>
          <li>플랫폼 외부 결제·송금을 시도하지 않습니다.</li>
          <li>물품을 상업적·재대여 목적으로 다시 사용하지 않습니다.</li>
        </ul>

        <h2 className="text-h3">CoRent의 역할</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>요청·승인·인계·반납·정산 등 거래 상태(state)를 추적합니다.</li>
          <li>증빙(사진, 체크리스트)을 매개합니다.</li>
          <li>분쟁 접수(intake) 창구를 제공합니다.</li>
          <li>결제 단계가 도입되면 결제는 라이선스 보유 결제대행사(PG)를
            통해 진행되며, CoRent는 사용자 자금을 직접 보관하지 않습니다.</li>
        </ul>

        <h2 className="text-h3">CoRent가 하지 않는 것</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>거래의 직접 당사자가 되지 않습니다.</li>
          <li>사용자 자금을 직접 보관하지 않습니다.</li>
          <li>법적 구속력 있는 보증·인수를 제공하지 않습니다.</li>
        </ul>

        <hr className="border-[color:var(--ink-12)] my-4" />

        <h1 className="text-h2">Terms of Use (Validation Beta)</h1>

        <p>
          CoRent is a C2C marketplace and a transaction-state /
          trust-workflow layer for short-term rentals between a lender (item
          owner) and a borrower. CoRent is not a direct counterparty to any
          rental.
        </p>

        <h2 className="text-h3">Limits during the validation beta</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>No platform fee is charged.</li>
          <li>No payment, deposit, settlement, or refund is processed.</li>
          <li>No CoRent wallet or stored value is provided.</li>
          <li>No upload, photo verification, identity verification, or
            exact-location matching is provided.</li>
          <li>No advertising, subscription, or paid brokerage service.</li>
          <li>Any pricing model shown is a planned / under-review notice
            and is not actually charged.</li>
        </ul>

        <h2 className="text-h3">Lender responsibilities</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Describe condition and components accurately.</li>
          <li>Hand over and receive return at the agreed time and place.</li>
          <li>Do not attempt off-platform payments.</li>
        </ul>

        <h2 className="text-h3">Borrower responsibilities</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Return on time and in agreed condition.</li>
          <li>Do not attempt off-platform payments.</li>
          <li>Do not re-rent or commercially exploit the item.</li>
        </ul>

        <h2 className="text-h3">CoRent&apos;s role</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Tracks transaction state (request, approval, handoff, return,
            settlement).</li>
          <li>Mediates evidence (photos, checklists).</li>
          <li>Provides a dispute-intake channel.</li>
          <li>When payments come online, money flows through a licensed
            payment partner; CoRent does not custody user funds.</li>
        </ul>

        <h2 className="text-h3">What CoRent does not do</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Act as the direct counterparty to a rental.</li>
          <li>Custody user funds.</li>
          <li>Provide a binding guarantee or underwrite the transaction.</li>
        </ul>

        <p className="text-small text-[color:var(--ink-60)] pt-8">
          See also: <Link href="/privacy" className="underline">Privacy / 개인정보 보호</Link>.
        </p>
      </section>
    </main>
  );
}
