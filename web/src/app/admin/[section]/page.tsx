import { notFound } from "next/navigation";

import { DashboardApp } from "@/components/dashboard-app";
import type { DashboardSectionRoute } from "@/types/frontend";

const adminSections: DashboardSectionRoute[] = ["map", "incidents", "intake", "vehicles", "telemetry", "realtime"];

type AdminSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const { section } = await params;

  if (!adminSections.includes(section as DashboardSectionRoute)) {
    notFound();
  }

  return <DashboardApp workspace="admin" section={section as DashboardSectionRoute} />;
}