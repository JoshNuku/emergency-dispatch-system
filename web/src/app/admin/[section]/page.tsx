import { redirect } from "next/navigation";

type AdminSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function AdminSectionPage({ params }: AdminSectionPageProps) {
  const { section } = await params;

  if (section === "users") redirect("/admin/users");
  if (section === "stations") redirect("/admin/stations");
  redirect("/admin");
}