import type { ReactNode } from "react";

type Variant = "filled" | "outline" | "dashed" | "selected";

type BadgeProps = {
  children: ReactNode;
  variant?: Variant;
  className?: string;
};

const variantStyles: Record<Variant, string> = {
  filled: "bg-black text-white border border-black",
  outline: "bg-white text-black border border-[color:var(--ink-20)]",
  dashed:
    "bg-white text-black border border-dashed border-[color:var(--line-dashed)]",
  selected: "bg-white text-black border border-black",
};

export function Badge({
  children,
  variant = "outline",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center min-h-7 px-3 rounded-full text-[11px] font-medium tracking-[0.04em] uppercase ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
