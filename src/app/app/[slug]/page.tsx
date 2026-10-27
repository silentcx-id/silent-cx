import { comingSoonPage } from "@/lib/area";

export default async function ClientMenuPage({ params }: PageProps<"/app/[slug]">) {
  return comingSoonPage("client", (await params).slug);
}
