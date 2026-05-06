// Founder admin sign-in entry point.
//
// Renders one of three states:
//
//   1. signed_out → existing magic-link form (founder allowlist
//                    posture unchanged).
//   2. signed_in (allowlisted founder) → email + Founder pill +
//                    link to /admin/cockpit + sign-out form.
//   3. signed_in (not allowlisted) → calm "you are signed in but
//                    this account is not a founder" copy + sign-
//                    out form. Avoids the previous behavior where
//                    a logged-in non-founder bouncing to
//                    /admin/cockpit hit a bare 404 with no signal.
//
// IMPORTANT: this page only changes the LOGIN surface. The actual
// `/admin/cockpit` guard via `requireFounderSession` is unchanged
// — non-allowlisted users still 404 there. The login page is just
// an honest landing surface.
//
// Magic link remains the only sign-in method for founders. The
// SSR client factory is called only from the route handlers, not
// from this server component (matches the existing posture).

import type { Metadata } from "next";
import Link from "next/link";
import { readCurrentSessionSummary } from "@/server/auth/sessionSummary";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign-in — CoRent",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{
  e?: string;
  sent?: string;
  next?: string;
  out?: string;
  pe?: string;
}>;

export default async function FounderAdminLoginPage({
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
  const nextRaw = typeof params.next === "string" ? params.next : "";

  const summary = await readCurrentSessionSummary();

  return (
    <main className="container-main py-16 max-w-[480px]">
      <header className="border-b border-black pb-4 mb-12">
        <span className="text-caption">Admin / Sign-in</span>
      </header>

      <section className="flex flex-col gap-6">
        <h1 className="text-h2">CoRent 운영자 로그인</h1>

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
          <SignedInButNoProfilePanel
            email={summary.email}
            isAllowlistedFounder={summary.isAllowlistedFounder}
          />
        ) : summary.isAllowlistedFounder ? (
          <SignedInFounderPanel email={summary.email} />
        ) : (
          <SignedInNotFounderPanel email={summary.email} />
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
        등록된 클로즈드 알파 운영자 계정으로 로그인해 주세요. 운영자 권한은
        로그인만으로 부여되지 않아요. 허용 목록에 등록된 계정만 cockpit에
        접근할 수 있어요.
      </p>

      {passwordError === "password_invalid" ? (
        <p
          role="status"
          className="text-small border border-black p-3"
          data-testid="password-error-invalid"
        >
          이메일 또는 비밀번호가 일치하지 않아요. 등록된 운영자 계정인지 다시
          확인해 주세요.
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
        action="/admin/auth/password-sign-in"
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
            placeholder="founder@example.com"
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
          action="/admin/auth/sign-in"
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
              placeholder="founder@example.com"
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

      <p className="text-small text-[color:var(--ink-60)]">
        이 페이지는 ENABLE_ANALYTICS_BETA 플래그와 무관하게 운영자 인증
        용도로만 사용되며, 일반 사용자 회원가입은 제공하지 않습니다. 허용
        목록에 없는 계정으로 로그인을 시도해도 동일한 응답이 표시돼요.
      </p>
    </>
  );
}

function SignOutForm() {
  return (
    <form method="post" action="/auth/sign-out" className="flex">
      <input type="hidden" name="next" value="/admin/login" />
      <button
        type="submit"
        className="border border-[color:var(--ink-20)] hover:border-black px-4 py-2 text-body bg-white text-black"
      >
        로그아웃
      </button>
    </form>
  );
}

function FounderPill() {
  return (
    <span className="inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase border border-black bg-black text-white">
      Founder ✓
    </span>
  );
}

function SignedInFounderPanel({ email }: { email: string }) {
  return (
    <>
      <p className="text-body">
        <span className="text-[color:var(--ink-60)]">로그인됨:</span> {email}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <FounderPill />
      </div>
      <div className="flex flex-col gap-2 border-t border-[color:var(--ink-12)] pt-6">
        <span className="text-caption text-[color:var(--ink-60)]">
          다음으로 이동
        </span>
        <ul className="flex flex-col gap-1 text-body">
          <li>
            <Link href="/admin/cockpit" className="underline">
              /admin/cockpit
            </Link>
            {" "}
            <span className="text-small text-[color:var(--ink-60)]">
              — 클로즈드 알파 검증 신호
            </span>
          </li>
          <li>
            <Link href="/admin/dashboard" className="underline">
              /admin/dashboard
            </Link>
            {" "}
            <span className="text-small text-[color:var(--ink-60)]">
              — Phase 1 분석 대시보드
            </span>
          </li>
        </ul>
      </div>
      <p className="text-small text-[color:var(--ink-60)]">
        운영자 로그인과 일반 로그인은 같은 Supabase 세션을 사용해요. 한 번
        로그아웃하면 두 화면 모두에서 로그아웃돼요.
      </p>
      <SignOutForm />
    </>
  );
}

function SignedInNotFounderPanel({ email }: { email: string }) {
  return (
    <>
      <p className="text-body">
        <span className="text-[color:var(--ink-60)]">로그인됨:</span> {email}
      </p>
      <p className="text-small border border-dashed border-[color:var(--line-dashed)] p-3">
        이 계정은 인증은 됐지만 운영자 허용 목록에 등록되어 있지 않아요. 운영자
        화면(`/admin/cockpit`, `/admin/dashboard`)은 이 계정으로는 열리지
        않아요. 일반 사용자 화면은
        {" "}
        <Link href="/login" className="underline">/login</Link>에서 확인할 수
        있어요.
      </p>
      <p className="text-small text-[color:var(--ink-60)]">
        운영자 로그인과 일반 로그인은 같은 Supabase 세션을 사용해요. 한 번
        로그아웃하면 두 화면 모두에서 로그아웃돼요.
      </p>
      <SignOutForm />
    </>
  );
}

function SignedInButNoProfilePanel({
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
        이 계정은 Supabase 인증은 됐지만 아직 `profiles` 행이 없어요.
        {isAllowlistedFounder
          ? " 운영자 허용 목록에는 있지만, 프로파일 등록 후에 운영자 화면을 사용할 수 있어요."
          : " 운영자 허용 목록에도 없어요."}
      </p>
      <SignOutForm />
    </>
  );
}
