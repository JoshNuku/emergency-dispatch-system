"use client";

import type { FormEvent } from "react";

import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import type { ModalView } from "@/types/frontend";

type StoreUpdate = Parameters<typeof dashboardStore.setState>[0];

export function LoginModal(props: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const { onLogin } = props;
  const { email, password, authError, loadingAction } = useDashboardStore();
  const setStore = (update: StoreUpdate) => dashboardStore.setState(update);

  const isLoggingIn = loadingAction.kind === "login";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Email
        </label>
        <input
          value={email}
          onChange={(e) => setStore({ email: e.target.value })}
          type="email"
          autoComplete="email"
          required
          className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm focus:border-zinc-700 outline-none"
          placeholder="admin@dispatch.local"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-zinc-500 uppercase">
          Password
        </label>
        <input
          value={password}
          onChange={(e) => setStore({ password: e.target.value })}
          type="password"
          autoComplete="current-password"
          required
          className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm focus:border-zinc-700 outline-none"
          placeholder="••••••••"
        />
      </div>

      {authError && (
        <p className="text-xs text-red-500 font-medium bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
          {authError}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoggingIn}
        className="w-full h-12 bg-zinc-100 text-black font-bold rounded-xl hover:bg-white transition-all disabled:opacity-50"
      >
        {isLoggingIn ? "Signing in..." : "Sign In"}
      </button>

      <button
        type="button"
        onClick={() => setStore({ openModal: null as ModalView })}
        className="w-full h-10 border border-zinc-800 hover:bg-zinc-900 text-[11px] font-bold uppercase rounded-lg transition-all"
      >
        Cancel
      </button>
    </form>
  );
}

