import { notFound } from "next/navigation";
import { comingSoonPage } from "@/lib/area";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import { menuItem } from "@/lib/roles";
import { requireRole } from "@/lib/session";

export default async function ShopperMenuPage({ params }: PageProps<"/shopper/[slug]">) {
  const { slug } = await params;
  const item = menuItem("shopper", slug);
  if (!item) notFound();
  const viewer = await requireRole("shopper", `/shopper/${slug}`);

  // Menu kerja shopper terkunci sampai lamaran disetujui.
  if (item.activeOnly && viewer.status !== "active") {
    const t = dict(await getLang()).shopper;
    return (
      <section className="card grid gap-3 p-6">
        <h1 className="text-2xl font-extrabold">{t.lockedTitle}</h1>
        <p className="text-muted">{t.lockedBody}</p>
      </section>
    );
  }
  return comingSoonPage("shopper", slug);
}
