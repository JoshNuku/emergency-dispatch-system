"use client";

import { dashboardStore, useDashboardStore } from "@/store/dashboard-store";
import { Button } from "@/components/v2/ui/button";
import { Card, CardBody, CardHeader } from "@/components/v2/ui/card";

export function SettingsPage() {
  const { theme } = useDashboardStore();
  const setStore = dashboardStore.setState;

  return (
    <div>
      <div className="mx-auto max-w-240 space-y-4">
        <Card>
          <CardHeader
            title="Settings"
            description="Personal preferences and local device options."
          />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  Theme
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  Switch between light and dark mode.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setStore((c) => ({
                    theme: c.theme === "dark" ? "light" : "dark",
                  }))
                }
              >
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-foreground">
                  Reset local state
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  Clears UI preferences and cached session data from this browser.
                </p>
              </div>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  dashboardStore.reset();
                  window.localStorage.clear();
                  window.location.reload();
                }}
              >
                Reset
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

