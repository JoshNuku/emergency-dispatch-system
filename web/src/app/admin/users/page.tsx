"use client";

import { AppShell } from "@/components/v2/app-shell";
import { UsersPage } from "@/components/v2/users-page";

export default function AdminUsersRoute() {
  return (
    <AppShell workspace="admin">
      <UsersPage />
    </AppShell>
  );
}

