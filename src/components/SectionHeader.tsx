import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  size?: "h1" | "h2" | "h3";
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  size = "h2",
}: SectionHeaderProps) {
  const alignClass = align === "center" ? "text-center items-center" : "";
  const titleClass =
    size === "h1" ? "text-h1" : size === "h3" ? "text-h3" : "text-h2";
  return (
    <div className={`flex flex-col gap-3 ${alignClass}`}>
      {eyebrow && (
        <span className="text-caption uppercase text-[color:var(--color-primary)]">
          {eyebrow}
        </span>
      )}
      <h2 className={titleClass}>{title}</h2>
      {description && (
        <p className="text-body-large text-secondary max-w-[640px]">
          {description}
        </p>
      )}
    </div>
  );
}
