"use client";

import React from "react";

type ConfirmModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmModal(props: ConfirmModalProps) {
  const {
    open,
    title = "Confirm",
    description = "Are you sure?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    loading = false,
    onConfirm,
    onCancel,
  } = props;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 z-0" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-panel p-6 z-10">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-background px-4 py-2 text-[13px] font-medium text-foreground hover:bg-panel/95"
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
