"use client";

import { AppShell } from "@/components/v2/app-shell";
import { StationsPage } from "@/components/v2/stations-page";

export default function AdminStationsRoute() {
  return (
    <AppShell workspace="admin">
      <StationsPage />
    </AppShell>
  );
}

