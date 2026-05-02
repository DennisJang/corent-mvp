// Slice A PR 5C — closed-alpha CoRent user sign-in entry page.
//
// This page is intentionally minimal. It posts to `/auth/sign-in`,
// which:
//   - validates the email shape,
//   - asks Supabase to send a magic link if the user is provisioned,
//   - returns the same generic response either way.
//
// The page never reveals whether an email is provisioned. There is
// no founder allowlist on this surface — closed-alpha capability is
// row-presence in `seller_profiles` / `borrower_profiles`, granted
// manually by the founder per
// `docs/corent_closed_alpha_provisioning_workflow.md`. Login does
// NOT decide seller / renter role.
//
// No client JS is required: the form posts as
// `application/x-www-form-urlencoded` and the response renders as
// JSON. This page is not linked from any visible navigation while
// the runtime stays on the local-only chat intake demo path.

import type { Metadata } from "next";
import Link from "next/link";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — CoRent",
  // Closed-alpha: keep this page out of indexes until the broader
  // CoRent surface is approved for public sign-up.
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ e?: string; sent?: string; next?: string }>;

export default async function CoRentLoginPage({
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
        <span className="text-caption">CoRent / Sign-in</span>
      </header>

      <section className="flex flex-col gap-6">
        <h1 className="text-h2">CoRent 로그인</h1>
        <p className="text-body text-[color:var(--ink-80)]">
          닫힌 베타에 참여 중이라면 매직 링크로 로그인할 수 있습니다.
          입력하신 주소가 등록되어 있으면 Supabase가 일회성 로그인 링크를
          이메일로 보냅니다. 등록되지 않은 주소도 동일한 응답이 표시됩니다.
        </p>
        <p className="text-small text-[color:var(--ink-60)]">
          로그인은 사용자 신원 확인용입니다. 판매자 자격(셀러 권한)은
          로그인만으로는 부여되지 않으며, 운영자가 별도로 승인합니다.
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
          <button
            type="submit"
            className="border border-black px-4 py-2 text-body bg-black text-white"
          >
            로그인 링크 받기
          </button>
        </form>

        <p className="text-small text-[color:var(--ink-60)] pt-8 border-t border-[color:var(--ink-12)]">
          <Link href="/" className="underline">홈으로 돌아가기</Link>
        </p>
      </section>
    </main>
  );
}
