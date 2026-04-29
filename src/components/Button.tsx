import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const baseStyles =
  "inline-flex items-center justify-center rounded-full font-medium transition-colors focus:outline-none focus-visible:shadow-[0_0_0_4px_rgba(43,89,195,0.14)] disabled:opacity-50 disabled:pointer-events-none";

const sizeStyles: Record<Size, string> = {
  md: "h-[52px] px-6 text-[16px]",
  lg: "h-[56px] px-6 text-[16px]",
};

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-white text-[color:var(--color-ink)] border border-[color:var(--border-subtle)] hover:border-[color:var(--border-strong)]",
  ghost:
    "bg-transparent text-[color:var(--color-primary)] hover:bg-[color:var(--tint-primary-soft)]",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentProps<"button">, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "primary", size = "lg", className = "", children } = props;
  const classes = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }

  const { ...rest } = props as ButtonAsButton;
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
