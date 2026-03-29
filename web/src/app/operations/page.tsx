"use client";

import { AppShell } from "@/components/v2/app-shell";
import { OverviewPage } from "@/components/v2/overview-page";

export default function OperationsPage() {
  return (
    <AppShell workspace="operations">
      <OverviewPage />
    </AppShell>
  );
}
