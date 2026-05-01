// Local demo guide helpers.
//
// CoRent's MVP runs entirely in one browser profile: there is no
// shared backend, no real auth, no payment integration, and no
// production onboarding. Founders / testers walking through the app
// for the first time have to bridge the gap between mock fixtures
// and "what would I do as a real seller / renter / admin?". This
// module is the single place those bridges live.
//
// What this module is NOT:
//
//   - It is not authentication. The roles surfaced here come straight
//     from `mockSession.ts`. The instant real auth ships, the
//     `getMockSellerSession` / `getMockRenterSession` callers in this
//     module become known migration sites.
//   - It is not a publishing path. The recommended demo product is
//     chosen from the trusted static `PRODUCTS` source so that
//     `rentalService.createRequestFromProductId` produces a request
//     the canonical mock seller dashboard will see. ListingIntent
//     drafts (including those produced by chat-to-listing intake)
//     are never returned by `getRecommendedDemoProduct` — only
//     approved-projection-eligible static products are.

import type { Product } from "@/domain/products";
import { PRODUCTS } from "@/data/products";
import {
  getMockRenterSession,
  getMockSellerSession,
} from "@/lib/auth/mockSession";

export type DemoRole = {
  // User-facing role label. Korean in current copy.
  label: string;
  // The mock identity slot this role maps to. Always `"mock"` in the
  // current MVP — the field exists so the future `"server"` source
  // can land without a copy refactor.
  source: "mock" | "server";
  // The id (sellerId / borrowerId / "founder") used by the canonical
  // helpers downstream.
  id: string;
  // Human-readable display name for the demo guide UI.
  displayName: string;
  // One-line description of what this role does in the demo.
  hint: string;
};

export type DemoStep = {
  // 1..N — used as both display and stable order key.
  index: number;
  // Compact title used in the stepper.
  title: string;
  // One-line body. Kept beta-safe (no payment / settlement language).
  body: string;
  // Optional href the demo guide can link to. When `undefined` the
  // step renders as text only — used for steps that aren't a single
  // route (e.g. "approve a request" lives on the dashboard).
  href?: string;
  // Which role drives this step.
  driver: "seller" | "renter" | "admin";
};

// The canonical demo step list. Order maps to the user story:
// chat-to-listing → review → public context → renter request →
// seller approval → handoff/return → claim/admin/trust.
export const DEMO_STEPS: DemoStep[] = [
  {
    index: 1,
    title: "셀러 챗으로 물건 등록",
    body: "셀러 대시보드의 채팅 카드에서 물건을 한 문장으로 설명해 초안을 만들어요.",
    href: "/dashboard",
    driver: "seller",
  },
  {
    index: 2,
    title: "초안 검토 / 직접 수정",
    body: "공개 프로필 카드 아래의 등록된 물건 표에서 초안을 확인하고 직접 수정해요.",
    href: "/dashboard",
    driver: "seller",
  },
  {
    index: 3,
    title: "공개 context (스토어프론트)",
    body: "셀러 storefront 페이지에서 공개되는 카드 형태를 미리 봐요. 베타에서 셀프 게시는 하지 않아요.",
    driver: "seller",
  },
  {
    index: 4,
    title: "렌터 요청 보내기",
    body: "추천 데모 물건의 상세 페이지에서 1·3·7일 중 하나로 요청을 보내요.",
    driver: "renter",
  },
  {
    index: 5,
    title: "셀러 승인",
    body: "셀러 대시보드의 대기 중인 요청에서 승인을 누르면 다음 단계로 넘어가요.",
    href: "/dashboard",
    driver: "seller",
  },
  {
    index: 6,
    title: "인계 · 반납 · 클레임",
    body: "베타에서는 실제 송금 없이 상태 흐름만 기록돼요. 인계 체크와 반납 후 짧은 검토 창이 열려요.",
    href: "/dashboard",
    driver: "seller",
  },
  {
    index: 7,
    title: "신뢰 요약 갱신",
    body: "성공 반납·검토 완료 등 카운트가 셀러 대시보드의 신뢰 요약에 반영돼요.",
    href: "/dashboard",
    driver: "seller",
  },
];

// Resolve the recommended demo product. The selection rule is:
// the first static product whose `sellerId` matches the supplied
// seller id. This guarantees that a renter request created from
// the demo product appears on the dashboard for the same mock
// seller — without it, testers see "대기 중인 요청 0건" forever.
//
// Returns `null` when the seller has no matching static product.
// Callers must surface a "데모용 정적 물건이 없어요" copy in that case
// rather than silently picking a stranger's item.
export function getRecommendedDemoProduct(
  sellerId: string,
): Product | null {
  if (typeof sellerId !== "string" || sellerId.length === 0) return null;
  for (const product of PRODUCTS) {
    if (product.sellerId === sellerId) return product;
  }
  return null;
}

// Snapshot of the demo's three roles. Reads from `mockSession.ts`
// — the only place in the app that resolves a "current user" today.
// Admin is documented as founder-gated since the local same-browser
// demo does not exercise the real founder login flow.
export function getCurrentDemoRoles(): {
  seller: DemoRole;
  renter: DemoRole;
  admin: DemoRole;
} {
  const sellerSession = getMockSellerSession();
  const renterSession = getMockRenterSession();
  return {
    seller: {
      label: "셀러",
      source: sellerSession.source,
      id: sellerSession.sellerId,
      displayName: sellerSession.displayName,
      hint: "물건을 챗으로 등록하고 요청을 승인해요.",
    },
    renter: {
      label: "렌터",
      source: renterSession.source,
      id: renterSession.borrowerId,
      displayName: renterSession.displayName,
      hint: "추천 데모 물건에 대해 요청을 보내요.",
    },
    admin: {
      label: "관리자",
      source: "mock",
      id: "founder_local_mvp",
      displayName: "운영자 (파운더 게이트)",
      hint: "관리자 화면은 파운더 로그인 게이트로 보호되어 있어 같은 브라우저 시연에서는 다루지 않아요.",
    },
  };
}

// Beta-safe copy bundle. Centralizing it lets the copy guardrail
// test scan a small surface and lets the UI re-use the strings
// without forking near-duplicates per call site.
export const LOCAL_DEMO_GUIDE_COPY = {
  sectionTitle: "로컬 데모 가이드 (베타)",
  sectionBadge: "같은 브라우저",
  intro:
    "이 브라우저 한 곳에 셀러·렌터·관리자 데이터가 함께 저장돼요. 시연을 처음부터 다시 보려면 아래 셀러 대시보드의 “로컬 데이터 비우기”를 눌러 주세요.",
  rolesHeading: "이 시연의 역할 (모의)",
  rolesNote:
    "지금 보이는 셀러 / 렌터 ID는 모의 세션 헬퍼에서 만들어진 값이에요. 실제 로그인·실명·실제 결제와는 연결되어 있지 않아요.",
  stepsHeading: "시연 흐름 7단계",
  recommendedItemHeading: "추천 데모 요청 물건",
  recommendedItemMissing:
    "이 모의 셀러는 시연용 정적 물건을 갖고 있지 않아요. 다른 셀러 ID로 시연하려면 mockSession 헬퍼를 바꿔 주세요.",
  recommendedItemHint:
    "이 물건은 현재 모의 셀러가 소유한 정적 데이터예요. 렌터로 요청을 보내면 같은 대시보드에서 승인 단계가 보여요.",
  recommendedItemCta: "물건 상세에서 요청 시작",
  resetHint:
    "로컬 데모 데이터는 이 브라우저에만 저장돼요. 시연을 초기화하려면 셀러 대시보드의 “로컬 데이터 비우기”를 눌러 주세요.",
  betaScope:
    "베타에서는 실거래·실제 송금·실거래 알림이 진행되지 않아요. 흐름과 상태 기록만 같은 브라우저 안에서 동작해요.",
} as const;
