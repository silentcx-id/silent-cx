import { comingSoonPage } from "@/lib/area";

export default async function CsMenuPage({ params }: PageProps<"/cs/[slug]">) {
  return comingSoonPage("cs", (await params).slug);
}
