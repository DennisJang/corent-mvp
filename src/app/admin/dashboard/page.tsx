// Founder admin dashboard v0. Server component. Read-only aggregate tiles.
// Auth: requires a Supabase session (read via @supabase/ssr) whose email
// is in FOUNDER_ADMIN_EMAIL_ALLOWLIST. The allowlist is the only
// authorization signal; user_metadata.role and any client-supplied flag
// are ignored. Missing session, missing email, or non-allowlisted email
// all return 404 (not 401) to avoid disclosing the admin surface.
//
// Phase 1.5: Supabase Auth must be configured externally before this
// page is reachable — the magic-link redirect URL needs to point at
// `/admin/auth/callback`. Until that is configured, every visit still
// 404s, which is the documented fail-closed default.

import { notFound } from "next/navigation";
import { requireFounderSession } from "@/server/admin/auth";
import { readDashboardSummary } from "@/server/admin/dashboard-data";

export const runtime = "nodejs";
export const preferredRegion = ["icn1"];
export const dynamic = "force-dynamic";

export default async function FounderAdminDashboardPage() {
  const session = await requireFounderSession();
  if (!session) notFound();

  const summary = await readDashboardSummary();

  if (!summary) {
    return (
      <main className="container-main py-16">
        <header className="border-b border-black pb-4 mb-12">
          <span className="text-caption">Admin / Phase 1</span>
        </header>
        <section className="border border-dashed border-[color:var(--line-dashed)] p-12">
          <h1 className="text-h2">대시보드를 불러올 수 없어요.</h1>
          <p className="text-body text-[color:var(--ink-60)] mt-4 max-w-[480px]">
            Supabase 환경 변수가 설정되어 있지 않습니다. 운영 환경에서
            <code className="px-1">SUPABASE_URL</code>과
            <code className="px-1">SUPABASE_SERVICE_ROLE_KEY</code>가
            서버 전용으로 설정되어 있는지 확인해주세요.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="container-main py-16">
      <header className="border-b border-black pb-4 mb-12 flex items-baseline justify-between">
        <span className="text-caption">Admin / Phase 1</span>
        <span className="text-caption text-[color:var(--ink-60)]">
          {session.email}
        </span>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 border-l border-[color:var(--ink-12)]">
        <Tile label="이벤트 (24h)" value={summary.totalEvents24h} />
        <Tile label="이벤트 (7d)" value={summary.totalEvents7d} />
        <Tile label="이벤트 (30d)" value={summary.totalEvents30d} />
        <Tile label="동의 거부 (30d)" value={summary.consentDenied30d} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-y-12 mt-16">
        <Section title="Event kind (7d)" rows={summary.byEventKind7d.map((r) => ({
          label: r.event_kind,
          count: r.count,
        }))} />
        <Section title="Category (7d)" rows={summary.byCategory7d.map((r) => ({
          label: r.category ?? "—",
          count: r.count,
        }))} />
        <Section title="Region coarse (7d)" rows={summary.byRegionCoarse7d.map((r) => ({
          label: r.region_coarse ?? "—",
          count: r.count,
        }))} />
      </section>

      <section className="mt-16 border-t border-[color:var(--ink-12)] pt-6">
        <span className="text-caption text-[color:var(--ink-60)]">
          Sanitizer rejections (24h): {summary.rejections24h}
        </span>
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-b border-t border-[color:var(--ink-12)] -ml-px -mt-px px-6 py-8 flex flex-col gap-2">
      <span className="text-caption text-[color:var(--ink-60)]">{label}</span>
      <span className="text-h2 tabular-nums">{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}

function Section({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  return (
    <div className="md:pr-6">
      <h3 className="text-title border-b border-black pb-3 mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-small text-[color:var(--ink-60)]">데이터가 없어요.</p>
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
