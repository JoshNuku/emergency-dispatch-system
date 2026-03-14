import { notFound } from "next/navigation";

import { DashboardApp } from "@/components/dashboard-app";
import type { DashboardSectionRoute } from "@/types/frontend";

const operationsSections: DashboardSectionRoute[] = ["map", "incidents", "intake", "vehicles", "telemetry", "realtime"];

type OperationsSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function OperationsSectionPage({ params }: OperationsSectionPageProps) {
  const { section } = await params;

  if (!operationsSections.includes(section as DashboardSectionRoute)) {
    notFound();
  }

  return <DashboardApp workspace="operations" section={section as DashboardSectionRoute} />;
}