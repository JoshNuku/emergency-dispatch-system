import { redirect } from "next/navigation";

type OperationsSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function OperationsSectionPage({
  params,
}: OperationsSectionPageProps) {
  const { section } = await params;

  // Keep old deep links working while v2 routes are explicit.
  if (section === "fleet") redirect("/operations/fleet");
  if (section === "analytics") redirect("/operations/analytics");
  redirect("/operations");
}