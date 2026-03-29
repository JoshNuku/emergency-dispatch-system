"use client";

import { AppShell } from "@/components/v2/app-shell";
import { AnalyticsPage } from "@/components/v2/analytics-page";

export default function OperationsAnalyticsPage() {
  return (
    <AppShell workspace="operations">
      <AnalyticsPage />
    </AppShell>
  );
}

