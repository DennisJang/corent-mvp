import Link from "next/link";
import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  width?: "main" | "dashboard";
};

export function PageShell({ children, width = "main" }: PageShellProps) {
  return (
    <div className="min-h-screen flex flex-col surface-air">
      <SiteHeader width={width} />
      <main className="flex-1">{children}</main>
      <SiteFooter width={width} />
    </div>
  );
}

function SiteHeader({ width }: { width: "main" | "dashboard" }) {
  const container =
    width === "dashboard" ? "container-dashboard" : "container-main";
  return (
    <header className="border-b border-[color:var(--border-subtle)] bg-white/80 backdrop-blur-sm">
      <div
        className={`${container} flex items-center justify-between h-[64px]`}
      >
        <Link
          href="/"
          className="flex items-center gap-2 focus-ring rounded-full"
        >
          <span className="inline-block w-[10px] h-[10px] rounded-full bg-[color:var(--color-primary)]" />
          <span className="text-[18px] font-bold tracking-tight">CoRent</span>
          <span className="text-caption text-tertiary ml-2">Seoul beta</span>
        </Link>
        <nav className="flex items-center gap-6 text-[14px] font-medium">
          <Link
            href="/search"
            className="text-secondary hover:text-[color:var(--color-ink)]"
          >
            빌리기
          </Link>
          <Link
            href="/sell"
            className="text-secondary hover:text-[color:var(--color-ink)]"
          >
            등록하기
          </Link>
          <Link
            href="/dashboard"
            className="text-secondary hover:text-[color:var(--color-ink)]"
          >
            내 대시보드
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({ width }: { width: "main" | "dashboard" }) {
  const container =
    width === "dashboard" ? "container-dashboard" : "container-main";
  return (
    <footer className="border-t border-[color:var(--border-subtle)] bg-white">
      <div
        className={`${container} py-12 flex flex-col gap-4 md:flex-row md:items-center md:justify-between`}
      >
        <div className="flex flex-col gap-1">
          <span className="text-[16px] font-bold tracking-tight">CoRent</span>
          <span className="text-body-small text-secondary">
            사기 전에, 며칠만 살아보기. · Seoul beta
          </span>
        </div>
        <div className="flex gap-6 text-body-small text-secondary">
          <span>안전 보증</span>
          <span>이용 약관</span>
          <span>도움말</span>
        </div>
      </div>
    </footer>
  );
}
