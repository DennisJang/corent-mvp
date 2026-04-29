import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const baseStyles =
  "inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2 disabled:opacity-40 disabled:pointer-events-none";

const sizeStyles: Record<Size, string> = {
  md: "h-[48px] px-6 text-[16px]",
  lg: "h-[56px] px-6 text-[16px]",
};

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-black text-white border border-black rounded-full hover:bg-[color:var(--ink-80)]",
  secondary:
    "bg-white text-black border border-[color:var(--ink-20)] rounded-full hover:border-black",
  ghost:
    "bg-transparent text-black underline-offset-4 hover:underline rounded-none",
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
