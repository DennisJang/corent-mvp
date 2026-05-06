// Closed-alpha CoRent user sign-in entry page.
//
// Renders one of three states:
//
//   1. signed_out       → magic-link form (the original flow).
//   2. signed_in_no_profile → "you're signed in but not provisioned"
//                              + sign-out form. The closed-alpha
//                              provisioning workflow (PR 5B) forbids
//                              auto-creating a profiles row; this
//                              surface tells the tester what's
//                              missing instead of pretending the
//                              session does not exist.
//   3. signed_in        → email + capability pills (`hasSeller` /
//                          `hasBorrower`) + post-login next-step
//                          links + sign-out form.
//
// The page never reveals whether an unrelated email is provisioned.
// The signed-in summary is the *current viewer's own* email +
// capability flags only (per `readCurrentSessionSummary`).
//
// Magic link remains the only sign-in method. Founder allowlist is
// surfaced as a small caption when the current account is on it,
// with a link to `/admin/login` — but the actual `/admin/cockpit`
// guard is unchanged.

import type { Metadata } from "next";
import Link from "next/link";
import { readCurrentSessionSummary } from "@/server/auth/sessionSummary";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — CoRent",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  e?: string;
  sent?: string;
  next?: string;
  out?: string;
  pe?: string;
}>;

export default async function CoRentLoginPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const showError = params.e === "1";
  const showSent = params.sent === "1";
  const showSignedOut = params.out === "1";
  const passwordError =
    params.pe === "invalid"
      ? "password_invalid"
      : params.pe === "unavailable"
        ? "password_unavailable"
        : null;
  // `next` is re-validated client-side: the route handler validates
  // against `safeUserNextPath` again on submit, so this is purely for
  // round-tripping the user's intended landing surface across a
  // failed attempt. Never echoed if absent.
  const nextRaw = typeof params.next === "string" ? params.next : "";

  const summary = await readCurrentSessionSummary();

  return (
    <main className="container-main py-16 max-w-[480px]">
      <header className="border-b border-black pb-4 mb-12">
        <span className="text-caption">CoRent / Sign-in</span>
      </header>

      <section className="flex flex-col gap-6">
        <h1 className="text-h2">CoRent 로그인</h1>

        {showSignedOut ? (
          <p
            role="status"
            className="text-small border border-dashed border-[color:var(--line-dashed)] px-3 py-2"
          >
            로그아웃되었어요. 다시 로그인하려면 아래에서 매직 링크를 받아주세요.
          </p>
        ) : null}

        {summary.kind === "signed_out" ? (
          <SignedOutPanel
            showError={showError}
            showSent={showSent}
            passwordError={passwordError}
            nextRaw={nextRaw}
          />
        ) : summary.kind === "signed_in_no_profile" ? (
          <NoProfilePanel
            email={summary.email}
            isAllowlistedFounder={summary.isAllowlistedFounder}
          />
        ) : (
          <SignedInPanel
            email={summary.email}
            hasSeller={summary.hasSeller}
            hasBorrower={summary.hasBorrower}
            isAllowlistedFounder={summary.isAllowlistedFounder}
          />
        )}

        <p className="text-small text-[color:var(--ink-60)] pt-8 border-t border-[color:var(--ink-12)]">
          <Link href="/" className="underline">홈으로 돌아가기</Link>
        </p>
      </section>
    </main>
  );
}

function SignedOutPanel({
  showError,
  showSent,
  passwordError,
  nextRaw,
}: {
  showError: boolean;
  showSent: boolean;
  passwordError: "password_invalid" | "password_unavailable" | null;
  nextRaw: string;
}) {
  return (
    <>
      <p className="text-body text-[color:var(--ink-80)]">
        등록된 클로즈드 알파 계정으로 로그인해 주세요. 새 계정 생성은 아직
        열려 있지 않아요. 비밀번호가 빠르고, 매직 링크는 백업 경로예요.
      </p>
      <p className="text-small text-[color:var(--ink-60)]">
        로그인은 사용자 신원 확인용입니다. 판매자 자격(셀러 권한)은 로그인만으로는
        부여되지 않으며, 운영자가 별도로 승인합니다.
      </p>

      {passwordError === "password_invalid" ? (
        <p
          role="status"
          className="text-small border border-black p-3"
          data-testid="password-error-invalid"
        >
          이메일 또는 비밀번호가 일치하지 않아요. 등록된 클로즈드 알파 계정인지
          다시 확인해 주세요.
        </p>
      ) : null}

      {passwordError === "password_unavailable" ? (
        <p
          role="status"
          className="text-small border border-black p-3"
          data-testid="password-error-unavailable"
        >
          비밀번호 로그인이 일시적으로 준비되지 않았어요. 아래 매직 링크를 사용해
          주세요.
        </p>
      ) : null}

      <form
        method="post"
        action="/auth/password-sign-in"
        className="flex flex-col gap-4"
        data-testid="password-sign-in-form"
      >
        <label className="flex flex-col gap-2">
          <span className="text-caption">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="border border-black px-3 py-2 text-body"
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-caption">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            minLength={1}
            maxLength={1024}
            className="border border-black px-3 py-2 text-body"
          />
        </label>
        {nextRaw ? (
          <input type="hidden" name="next" value={nextRaw} />
        ) : null}
        <button
          type="submit"
          className="border border-black px-4 py-2 text-body bg-black text-white"
        >
          비밀번호로 로그인
        </button>
      </form>

      <div className="border-t border-[color:var(--ink-12)] pt-6 flex flex-col gap-3">
        <p className="text-caption text-[color:var(--ink-60)]">
          매직 링크 (백업 경로)
        </p>

        {showError ? (
          <p className="text-small border border-black p-3">
            로그인 링크를 처리할 수 없습니다. 다시 시도해주세요.
          </p>
        ) : null}

        {showSent ? (
          <p className="text-small border border-black p-3">
            요청이 접수되었습니다. 이메일을 확인해주세요.
          </p>
        ) : null}

        <form
          method="post"
          action="/auth/sign-in"
          className="flex flex-col gap-4"
          data-testid="magic-link-form"
        >
          <label className="flex flex-col gap-2">
            <span className="text-caption">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="border border-black px-3 py-2 text-body"
              placeholder="you@example.com"
            />
          </label>
          {nextRaw ? (
            <input type="hidden" name="next" value={nextRaw} />
          ) : null}
          <button
            type="submit"
            className="border border-[color:var(--ink-20)] hover:border-black px-4 py-2 text-body bg-white text-black"
          >
            로그인 링크 받기
          </button>
        </form>
      </div>
    </>
  );
}

function CapabilityPill({ ok, label }: { ok: boolean; label: string }) {
  // BW Swiss Grid only — strong border + filled black for confirmed
  // capability, dashed border for absent. No new colors.
  if (ok) {
    return (
      <span className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-black bg-black text-white">
        {label} ✓
      </span>
    );
  }
  return (
    <span className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-dashed border-[color:var(--line-dashed)] text-[color:var(--ink-60)]">
      {label} —
    </span>
  );
}

function SignOutForm({ next }: { next: "/login" | "/admin/login" }) {
  return (
    <form method="post" action="/auth/sign-out" className="flex">
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="border border-[color:var(--ink-20)] hover:border-black px-4 py-2 text-body bg-white text-black"
      >
        로그아웃
      </button>
    </form>
  );
}

function NoProfilePanel({
  email,
  isAllowlistedFounder,
}: {
  email: string;
  isAllowlistedFounder: boolean;
}) {
  return (
    <>
      <p className="text-body">
        <span className="text-[color:var(--ink-60)]">로그인됨:</span> {email}
      </p>
      <p className="text-small border border-dashed border-[color:var(--line-dashed)] p-3">
        이 계정은 인증은 됐지만 아직 프로필이 등록되어 있지 않아요. 운영자가
        프로파일과 권한을 수동으로 등록해야 셀러/빌리는 사람 흐름을 사용할 수
        있어요.
      </p>
      {isAllowlistedFounder ? (
        <p className="text-small text-[color:var(--ink-60)]">
          이 이메일은 운영자 허용 목록에 있어요. 운영자 화면은
          {" "}
          <Link href="/admin/login" className="underline">
            /admin/login
          </Link>
          에서 진입할 수 있어요.
        </p>
      ) : null}
      <p className="text-small text-[color:var(--ink-60)]">
        운영자 로그인과 일반 로그인은 같은 Supabase 세션을 사용해요. 한 번
        로그아웃하면 두 화면 모두에서 로그아웃돼요.
      </p>
      <SignOutForm next="/login" />
    </>
  );
}

function SignedInPanel({
  email,
  hasSeller,
  hasBorrower,
  isAllowlistedFounder,
}: {
  email: string;
  hasSeller: boolean;
  hasBorrower: boolean;
  isAllowlistedFounder: boolean;
}) {
  return (
    <>
      <p className="text-body">
        <span className="text-[color:var(--ink-60)]">로그인됨:</span> {email}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <CapabilityPill ok={hasSeller} label="Seller" />
        <CapabilityPill ok={hasBorrower} label="Borrower" />
        {isAllowlistedFounder ? (
          <CapabilityPill ok={true} label="Founder" />
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-[color:var(--ink-12)] pt-6">
        <span className="text-caption text-[color:var(--ink-60)]">
          다음으로 이동
        </span>
        <ul className="flex flex-col gap-1 text-body">
          {hasSeller ? (
            <li>
              <Link href="/sell" className="underline">/sell</Link>
              {" "}
              <span className="text-small text-[color:var(--ink-60)]">
                — 채팅으로 물건 등록 (서버 모드)
              </span>
            </li>
          ) : null}
          <li>
            <Link href="/dashboard" className="underline">/dashboard</Link>
            {" "}
            <span className="text-small text-[color:var(--ink-60)]">
              — 내 리스팅 / 받은 요청
            </span>
          </li>
          {hasBorrower ? (
            <li>
              <Link href="/requests" className="underline">/requests</Link>
              {" "}
              <span className="text-small text-[color:var(--ink-60)]">
                — 내가 보낸 대여 요청
              </span>
            </li>
          ) : null}
          <li>
            <Link href="/search" className="underline">/search</Link>
            {" "}
            <span className="text-small text-[color:var(--ink-60)]">
              — 공개 리스팅 둘러보기
            </span>
          </li>
          {isAllowlistedFounder ? (
            <li>
              <Link href="/admin/login" className="underline">/admin/login</Link>
              {" "}
              <span className="text-small text-[color:var(--ink-60)]">
                — 운영자 화면 진입
              </span>
            </li>
          ) : null}
        </ul>
      </div>

      <p className="text-small text-[color:var(--ink-60)]">
        운영자 로그인과 일반 로그인은 같은 Supabase 세션을 사용해요. 한 번
        로그아웃하면 두 화면 모두에서 로그아웃돼요.
      </p>

      <SignOutForm next="/login" />
    </>
  );
}
