"use client";

import type { InputHTMLAttributes } from "react";

import { cn } from "@/components/v2/ui/cn";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg border border-line bg-background px-3.5 text-[13px] text-foreground outline-none transition placeholder:text-muted/70 focus:border-line-strong focus:ring-2 focus:ring-accent/25",
        className,
      )}
      {...rest}
    />
  );
}

