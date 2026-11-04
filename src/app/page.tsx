import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { getCatalog, withAddonPromo } from "@/lib/catalog";
import { getLang } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { getPublishedContent } from "@/lib/site";
import { pick } from "@/lib/site-content";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Judul dan deskripsi untuk Google diatur admin di Konten → Info situs.
export async function generateMetadata(): Promise<Metadata> {
  const [content, lang] = await Promise.all([getPublishedContent(), getLang()]);
  return { title: { absolute: pick(content.site.seoTitle, lang) }, description: pick(content.site.seoDescription, lang) };
}

// Landing page untuk pengunjung yang belum masuk. Yang sudah masuk langsung ke dashboard role-nya;
// admin melihat landing lewat Pratinjau di menu Konten.
export default async function Home() {
  const viewer = await getViewer();
  if (viewer) redirect(ROLE_HOME[viewer.role]);
  const [lang, content] = await Promise.all([getLang(), getPublishedContent()]);
  const catalog = isSupabaseConfigured ? await getCatalog() : null;
  const packages = catalog ? catalog.packages.filter((p) => p.active && p.prices.length > 0) : [];
  const addons = catalog ? withAddonPromo(catalog.addons.filter((a) => a.active && a.key !== "excess_purchase"), catalog.addonPromo) : [];
  return <Landing content={content} packages={packages} addons={addons} lang={lang} />;
}
