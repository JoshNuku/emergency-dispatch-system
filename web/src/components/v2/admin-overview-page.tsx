"use client";

import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import { titleCase } from "@/lib/normalizers";
import { Button } from "@/components/v2/ui/button";

function Panel(props: { title: string; description: string; children?: React.ReactNode }) {
  const { title, description, children } = props;
  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="border-b border-line px-6 py-5">
        <h1 className="text-[14px] font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-[12px] text-muted">{description}</p>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

export function AdminOverviewPage() {
  const { state, theme } = useDashboardStore();
  const setStore = dashboardStore.setState;

  const profile = state.profile;

  return (
    <div className="space-y-4">
      <Panel
        title="Admin Console"
        description="Manage users, stations, and application settings."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-background px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Signed in as
            </p>
            <p className="mt-2 text-[13px] font-semibold text-foreground">
              {profile?.name ?? "Unknown"}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {titleCase(profile?.role ?? "")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStore({ openModal: "user-manage" })}
            className="rounded-xl border border-line bg-background px-4 py-3 text-left transition hover:border-line-strong"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Users
            </p>
            <p className="mt-2 text-[13px] font-semibold text-foreground">
              Manage accounts
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Register users and roles
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStore({ openModal: "station-manage" })}
            className="rounded-xl border border-line bg-background px-4 py-3 text-left transition hover:border-line-strong"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Stations
            </p>
            <p className="mt-2 text-[13px] font-semibold text-foreground">
              Manage stations
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Availability and capacity
            </p>
          </button>
        </div>
      </Panel>

      <Panel
        title="Settings"
        description="Workspace preferences and local environment controls."
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-background px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Theme
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Switch between dark and light mode for this browser.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setStore((c) => ({
                    theme: c.theme === "dark" ? "light" : "dark",
                  }))
                }
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-background px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Local reset
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Clears cached session tokens and UI state on this device.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => {
                  dashboardStore.reset();
                  window.localStorage.clear();
                  window.location.reload();
                }}
              >
                Reset local state
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

