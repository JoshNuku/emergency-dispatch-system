"use client";

import type { ReactNode } from "react";

import { cn } from "@/components/v2/ui/cn";

export function Card(props: {
  className?: string;
  children: ReactNode;
}) {
  const { className, children } = props;
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-panel backdrop-blur-[1px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader(props: {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  right?: ReactNode;
}) {
  const { className, title, description, right } = props;
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-6 py-5", className)}>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold leading-tight text-foreground">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-[12px] leading-relaxed text-muted">
            {description}
          </div>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function CardBody(props: { className?: string; children: ReactNode }) {
  const { className, children } = props;
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
}

