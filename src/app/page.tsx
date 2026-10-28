import type { Metadata } from "next";
import { Landing } from "@/components/landing";
import { getCatalog } from "@/lib/catalog";
import { getLang, getTheme } from "@/lib/prefs";
import { getViewer } from "@/lib/session";
import { getPublishedContent } from "@/lib/site";
import { pick } from "@/lib/site-content";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Judul dan deskripsi untuk Google diatur admin di Konten → Info situs.
export async function generateMetadata(): Promise<Metadata> {
  const [content, lang] = await Promise.all([getPublishedContent(), getLang()]);
  return { title: { absolute: pick(content.site.seoTitle, lang) }, description: pick(content.site.seoDescription, lang) };
}

// Landing page: isi dari versi terbit di menu Konten, paket langsung dari Katalog.
export default async function Home() {
  const [lang, theme, viewer, content] = await Promise.all([getLang(), getTheme(), getViewer(), getPublishedContent()]);
  const packages = isSupabaseConfigured ? (await getCatalog()).packages.filter((p) => p.active && p.prices.length > 0) : [];
  return <Landing content={content} packages={packages} lang={lang} theme={theme} viewer={viewer} />;
}
