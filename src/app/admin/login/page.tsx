// Phase 1.5 — Founder admin sign-in entry point.
//
// This is the only public-reachable page in the admin surface. It posts
// to `/admin/auth/sign-in` which:
//   - validates the email shape,
//   - checks the server-side founder allowlist,
//   - asks Supabase to send a magic link (if allowlisted),
//   - returns the same generic response either way.
//
// The page never reveals whether an email is allowlisted, never lists
// which emails are allowed, and never collects anything beyond a single
// email field. No client JS is required (the form submits as a regular
// `application/x-www-form-urlencoded` POST and the response renders as
// JSON; the user sees a plain success page from the browser).
//
// We deliberately do **not** call any Supabase code from this server
// component. The factory is reached only from the route handlers.

import type { Metadata } from "next";
import Link from "next/link";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign-in — CoRent",
  // Belt-and-suspenders: this page should never be indexed even if the
  // outer Vercel Deployment Protection is somehow misconfigured.
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ e?: string; sent?: string; next?: string }>;

export default async function FounderAdminLoginPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = (await searchParams) ?? {};
  const showError = params.e === "1";
  const showSent = params.sent === "1";

  return (
    <main className="container-main py-16 max-w-[480px]">
      <header className="border-b border-black pb-4 mb-12">
        <span className="text-caption">Admin / Sign-in</span>
      </header>

      <section className="flex flex-col gap-6">
        <h1 className="text-h2">CoRent 운영자 로그인</h1>
        <p className="text-body text-[color:var(--ink-80)]">
          창업자 전용 매직 링크로 로그인합니다. 입력하신 주소가 허용 목록에
          있으면 Supabase가 일회성 로그인 링크를 이메일로 보냅니다. 입력하신
          주소가 허용 목록에 없더라도 동일한 응답이 표시됩니다.
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
          <button
            type="submit"
            className="border border-black px-4 py-2 text-body bg-black text-white"
          >
            로그인 링크 받기
          </button>
        </form>

        <p className="text-small text-[color:var(--ink-60)]">
          이 페이지는 ENABLE_ANALYTICS_BETA 플래그와 무관하게 운영자 인증
          용도로만 사용되며, 일반 사용자 회원가입은 제공하지 않습니다.
        </p>

        <p className="text-small text-[color:var(--ink-60)] pt-8 border-t border-[color:var(--ink-12)]">
          <Link href="/" className="underline">홈으로 돌아가기</Link>
        </p>
      </section>
    </main>
  );
}
