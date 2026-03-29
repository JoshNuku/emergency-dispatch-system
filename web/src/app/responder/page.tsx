"use client";

import { AppShell } from "@/components/v2/app-shell";
import { ResponderOverviewPage } from "@/components/v2/responder-overview-page";

export default function ResponderPage() {
  return (
    <AppShell workspace="responder">
      <ResponderOverviewPage />
    </AppShell>
  );
}
