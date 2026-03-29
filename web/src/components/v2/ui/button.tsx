"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/components/v2/ui/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    leftIcon?: ReactNode;
  }
>(function Button(
  { className, variant = "secondary", size = "md", leftIcon, children, ...rest },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg border text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:opacity-50 disabled:pointer-events-none";
  const sizes = size === "sm" ? "h-8 px-3" : "h-9 px-3.5";
  const variants: Record<Variant, string> = {
    primary:
      "border-transparent bg-foreground text-background hover:opacity-90",
    secondary:
      "border-line bg-panel-strong text-foreground hover:border-line-strong",
    ghost:
      "border-transparent bg-transparent text-muted hover:bg-nav-hover hover:text-foreground",
    danger: "border-danger/20 bg-danger/10 text-danger hover:border-danger/30",
  };

  return (
    <button ref={ref} className={cn(base, sizes, variants[variant], className)} {...rest}>
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      {children}
    </button>
  );
});

