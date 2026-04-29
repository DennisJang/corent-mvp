import type { ComponentProps } from "react";

type InputProps = Omit<ComponentProps<"input">, "className"> & {
  className?: string;
};

export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={`h-[52px] w-full rounded-[12px] border border-[color:var(--border-subtle)] bg-white px-4 text-[16px] text-[color:var(--color-ink)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--color-primary)] focus-visible:shadow-[0_0_0_4px_rgba(43,89,195,0.14)] ${className}`}
      {...rest}
    />
  );
}
