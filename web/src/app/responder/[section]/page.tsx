import { redirect } from "next/navigation";

type ResponderSectionPageProps = {
  params: Promise<{
    section: string;
  }>;
};

export default async function ResponderSectionPage({ params }: ResponderSectionPageProps) {
  const { section } = await params;

  if (section === "assignment") redirect("/responder");
  redirect("/responder");
}
