import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  surface?: "white" | "air";
  padding?: "md" | "lg";
};

export function Card({
  children,
  className = "",
  surface = "white",
  padding = "md",
}: CardProps) {
  const surfaceClass =
    surface === "white"
      ? "bg-white"
      : "bg-[color:var(--color-air)]";
  const paddingClass = padding === "lg" ? "p-8" : "p-6";
  return (
    <div
      className={`rounded-[20px] border border-[color:var(--border-subtle)] ${surfaceClass} ${paddingClass} ${className}`}
    >
      {children}
    </div>
  );
}
