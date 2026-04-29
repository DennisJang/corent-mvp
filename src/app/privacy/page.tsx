// Phase 1 privacy notice. Static page. Korean + English. Draft copy —
// external legal review still required before any public traffic.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — CoRent",
};

export default function PrivacyPage() {
  return (
    <main className="container-main py-16 max-w-[720px]">
      <header className="border-b border-black pb-4 mb-12">
        <span className="text-caption">Privacy / 개인정보 보호</span>
      </header>

      <section className="flex flex-col gap-8 text-body">
        <p className="text-small text-[color:var(--ink-60)]">
          Draft v1 — external legal review pending. CoRent is currently in a
          pre-revenue validation beta. This notice is not a final legal policy.
        </p>

        <h1 className="text-h2">개인정보 보호 안내 (검증 베타)</h1>

        <p>
          CoRent는 Korea-wide 단기 대여 검증 베타입니다. 이 단계에서는 결제,
          업로드, 신원 확인, 정확한 위치, 제휴 보호 상품을 제공하지 않으며,
          이름·이메일·전화번호·주소·주민등록번호·결제 정보 등 개인을 식별할 수
          있는 데이터를 수집·보관하지 않습니다.
        </p>

        <h2 className="text-h3">수집하는 정보</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>익명·집계 형태의 퍼널 이벤트 (검색 카테고리, 기간, 광역 지역,
            가격 구간 등)</li>
          <li>세션 식별을 위한 무작위 세션 해시 (브라우저별 1세션 단위)</li>
          <li>동의 상태 (granted / denied / unknown)</li>
        </ul>

        <h2 className="text-h3">수집하지 않는 정보</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>이름, 이메일, 전화번호, 주민등록번호, 주소</li>
          <li>구·동 단위 등 광역 지역보다 세분화된 위치</li>
          <li>IP 주소(저장하지 않음), User-Agent 원본 문자열</li>
          <li>정확한 KRW 금액 (가격 구간만 사용)</li>
          <li>제품 시리얼 번호, 사진/파일 데이터</li>
          <li>결제 카드·계좌·결제 메타데이터</li>
          <li>제3자 광고 추적기, 크로스사이트 쿠키, 픽셀</li>
        </ul>

        <h2 className="text-h3">데이터 보관 위치</h2>
        <p>
          이벤트 데이터는 Supabase의 Seoul (ap-northeast-2) 리전에 저장됩니다.
          국외 이전 없이 한국 내에서 처리됩니다.
        </p>

        <h2 className="text-h3">보관 기간</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>익명 이벤트(growth_events): 18개월 롤링 후 자동 삭제</li>
          <li>새니타이저 거부 로그: 90일 롤링</li>
          <li>동의 쿠키: 365일 또는 정책 버전 갱신 시 만료</li>
        </ul>

        <h2 className="text-h3">선택권</h2>
        <p>
          첫 방문 시 노출되는 배너에서 동의를 거부하면 이후 행동 데이터는
          저장되지 않습니다. 거부 사실 자체만 단일 이벤트로 기록됩니다.
        </p>

        <h2 className="text-h3">데이터 관리자 (Data Controller)</h2>
        <p>
          본 베타 기간 동안의 데이터 관리자는 CoRent 운영자(개인 창업자)입니다.
          문의는 향후 게시될 공식 연락처를 통해 받겠습니다.
        </p>

        <hr className="border-[color:var(--ink-12)] my-4" />

        <h1 className="text-h2">Privacy Notice (Validation Beta)</h1>

        <p>
          CoRent is a Korea-wide short-term rental validation beta. During
          this phase the product does not run payments, uploads, identity
          verification, exact-location matching, or partner protection
          products, and does not collect or store any personally identifiable
          information (name, email, phone, address, RRN, payment details).
        </p>

        <h2 className="text-h3">What we collect</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Anonymous, aggregated funnel events (search category,
            duration, coarse region, price band, etc.)</li>
          <li>A random per-session hash for de-duplicating events</li>
          <li>Consent state (granted / denied / unknown)</li>
        </ul>

        <h2 className="text-h3">What we do NOT collect</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Names, emails, phone numbers, RRN, addresses</li>
          <li>District-level geography (only coarse region)</li>
          <li>IP addresses (not stored), raw user-agent strings</li>
          <li>Exact KRW amounts (price bands only)</li>
          <li>Product serial numbers, photos, files</li>
          <li>Payment cards, bank accounts, payment metadata</li>
          <li>Third-party ad trackers, cross-site cookies, pixels</li>
        </ul>

        <h2 className="text-h3">Where data is stored</h2>
        <p>
          Event data is stored in a Supabase project in the Seoul
          (ap-northeast-2) region; data is processed inside Korea with no
          cross-border transfer.
        </p>

        <h2 className="text-h3">Retention</h2>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          <li>Anonymous events (growth_events): 18 months rolling</li>
          <li>Sanitizer rejections: 90 days rolling</li>
          <li>Consent cookie: 365 days or until the privacy version changes</li>
        </ul>

        <h2 className="text-h3">Your choice</h2>
        <p>
          The first-load consent banner lets you decline. If declined, no
          behavioral data is stored; only a single &ldquo;denied&rdquo;
          counter event is recorded.
        </p>

        <h2 className="text-h3">Data Controller</h2>
        <p>
          The data controller during the beta is the CoRent operator (solo
          founder). Contact details will be added when public outreach
          begins.
        </p>

        <p className="text-small text-[color:var(--ink-60)] pt-8">
          See also: <Link href="/terms" className="underline">Terms / 이용약관</Link>.
        </p>
      </section>
    </main>
  );
}
