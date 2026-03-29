"use client";

import type { ReactNode } from "react";

import { cn } from "@/components/v2/ui/cn";
import { Button } from "@/components/v2/ui/button";
import { XIcon } from "@/components/v2/icons";
import { useDashboardStore } from "@/store/dashboard-store";

type ModalSize = "sm" | "md" | "lg" | "xl";

export function Modal(props: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
   footer?: ReactNode;
   size?: ModalSize;
}) {
  const {
    open,
    onClose,
    title,
    description,
    children,
    className,
    footer,
    size = "md",
  } = props;

  const { isPickingLocation } = useDashboardStore();

  if (!open) return null;

  const widthClass =
    size === "sm"
      ? "lg:max-w-md"
      : size === "md"
      ? "lg:max-w-xl"
      : size === "lg"
      ? "lg:max-w-2xl"
      : "lg:max-w-4xl";

  return (
    <div
      className={cn(
        "modal-backdrop fixed inset-0 z-[9000] flex items-end justify-center backdrop-blur-[2px] lg:items-stretch lg:justify-end",
        // When user is picking a location from the map, allow pointer events
        // to pass through the backdrop so the underlying map can receive clicks.
        isPickingLocation ? "pointer-events-none" : "",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={cn(
          // Ensure the modal surface remains interactive even when the
          // backdrop has pointer-events disabled.
          "modal-surface relative w-full max-w-none max-h-[92vh] rounded-t-2xl border border-line border-b-0 pointer-events-auto lg:h-full lg:max-h-none lg:rounded-none lg:border-b lg:border-l lg:border-r-0 lg:border-t-0",
          widthClass,
          className,
        )}
      >
        <div className="flex h-full max-h-[92vh] flex-col p-4 sm:p-5 lg:max-h-none lg:p-6">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line lg:hidden" />
          <div className="flex items-start justify-between gap-4 pr-9">
            <div>
              {title ? (
                <div className="text-[14px] font-semibold text-foreground">
                  {title}
                </div>
              ) : null}
              {description ? (
                <div className="mt-1 text-[12px] text-muted">
                  {description}
                </div>
              ) : null}
            </div>
            <div className="absolute right-4 top-4 z-20">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="h-9 w-9 p-0 rounded-md border border-line bg-panel-strong text-muted hover:text-foreground hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent lg:h-10 lg:w-10"
                aria-label="Close"
              >
                <XIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="scrollbar-hidden mt-4 flex-1 overflow-y-auto pr-0 lg:mt-5 lg:pr-1">
            {children}
          </div>

          {footer ? (
            <div className="sticky bottom-0 mt-4 border-t border-line bg-panel/95 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:mt-5 lg:pt-4 lg:pb-0">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

