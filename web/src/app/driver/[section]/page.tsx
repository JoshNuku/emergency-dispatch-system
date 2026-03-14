import { notFound } from "next/navigation";

import { DashboardApp } from "@/components/dashboard-app";
import type { DashboardSectionRoute } from "@/types/frontend";

const driverSections: DashboardSectionRoute[] = ["map", "incidents", "workflow", "vehicles", "telemetry", "realtime"];

type DriverSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function DriverSectionPage({ params }: DriverSectionPageProps) {
  const { section } = await params;

  if (!driverSections.includes(section as DashboardSectionRoute)) {
    notFound();
  }

  return <DashboardApp workspace="driver" section={section as DashboardSectionRoute} />;
}