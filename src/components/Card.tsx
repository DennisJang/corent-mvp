import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "md" | "lg";
  border?: "thin" | "base" | "strong" | "dashed";
  radius?: "none" | "small";
};

const paddingClass: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  md: "p-6",
  lg: "p-8",
};

const borderClass: Record<NonNullable<CardProps["border"]>, string> = {
  thin: "border border-[color:var(--ink-12)]",
  base: "border border-[color:var(--ink-20)]",
  strong: "border border-black",
  dashed: "border border-dashed border-[color:var(--line-dashed)]",
};

const radiusClass: Record<NonNullable<CardProps["radius"]>, string> = {
  none: "rounded-none",
  small: "rounded-[8px]",
};

export function Card({
  children,
  className = "",
  padding = "md",
  border = "thin",
  radius = "none",
}: CardProps) {
  return (
    <div
      className={`bg-white ${borderClass[border]} ${paddingClass[padding]} ${radiusClass[radius]} ${className}`}
    >
      {children}
    </div>
  );
}
