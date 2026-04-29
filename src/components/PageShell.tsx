import Link from "next/link";
import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  width?: "main" | "dashboard";
};

export function PageShell({ children, width = "main" }: PageShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
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
    <header className="border-b border-black bg-white">
      <div
        className={`${container} flex items-center justify-between h-[72px]`}
      >
        <Link
          href="/"
          className="flex items-baseline gap-3 focus-ring -mx-1 px-1"
        >
          <span className="text-[18px] font-bold tracking-tight">CoRent</span>
          <span className="text-caption text-[color:var(--ink-60)]">
            Seoul beta
          </span>
        </Link>
        <nav className="flex items-center gap-8 text-[14px] font-medium">
          <Link
            href="/search"
            className="text-[color:var(--ink-60)] hover:text-black"
          >
            빌리기
          </Link>
          <Link
            href="/sell"
            className="text-[color:var(--ink-60)] hover:text-black"
          >
            등록하기
          </Link>
          <Link
            href="/dashboard"
            className="text-[color:var(--ink-60)] hover:text-black"
          >
            대시보드
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
    <footer className="border-t border-black bg-white mt-24">
      <div
        className={`${container} py-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between`}
      >
        <div className="flex flex-col gap-2">
          <span className="text-[16px] font-bold tracking-tight">CoRent</span>
          <span className="text-small text-[color:var(--ink-60)]">
            사기 전에, 며칠만 살아보기. — Seoul beta
          </span>
        </div>
        <div className="flex gap-8 text-small text-[color:var(--ink-60)]">
          <span>안전 보증</span>
          <span>이용 약관</span>
          <span>도움말</span>
        </div>
      </div>
    </footer>
  );
}
