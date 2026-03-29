"use client";

import { AppShell } from "@/components/v2/app-shell";
import { FleetPage } from "@/components/v2/fleet-page";

export default function OperationsFleetPage() {
  return (
    <AppShell workspace="operations">
      <FleetPage />
    </AppShell>
  );
}

