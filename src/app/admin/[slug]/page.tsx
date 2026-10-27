import { comingSoonPage } from "@/lib/area";

export default async function AdminMenuPage({ params }: PageProps<"/admin/[slug]">) {
  return comingSoonPage("admin", (await params).slug);
}
