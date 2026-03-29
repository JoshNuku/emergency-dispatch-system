"use client";

import { AppShell } from "@/components/v2/app-shell";
import { AdminOverviewPage } from "@/components/v2/admin-overview-page";

export default function AdminPage() {
  return (
    <AppShell workspace="admin">
      <AdminOverviewPage />
    </AppShell>
  );
}