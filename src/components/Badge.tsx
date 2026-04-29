import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "primary" | "neutral";
  className?: string;
};

export function Badge({
  children,
  tone = "primary",
  className = "",
}: BadgeProps) {
  const styles =
    tone === "primary"
      ? "bg-[color:var(--color-air)] text-[color:var(--color-primary)] border border-[color:var(--border-primary-soft)]"
      : "bg-white text-[color:var(--color-ink)] border border-[color:var(--border-subtle)]";
  return (
    <span
      className={`inline-flex items-center h-7 px-3 rounded-full text-[12px] font-medium tracking-[0.01em] ${styles} ${className}`}
    >
      {children}
    </span>
  );
}
