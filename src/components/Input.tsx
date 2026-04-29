import type { ComponentProps } from "react";

type InputProps = Omit<ComponentProps<"input">, "className"> & {
  className?: string;
};

export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={`h-[56px] w-full rounded-none border border-[color:var(--ink-20)] bg-white px-4 text-[16px] text-black placeholder:text-[color:var(--ink-40)] focus:outline focus:outline-2 focus:outline-black focus:outline-offset-2 ${className}`}
      {...rest}
    />
  );
}
