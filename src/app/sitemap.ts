import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { appOrigin } from "@/lib/app-origin";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { freshFetch } from "@/lib/supabase/fresh-fetch";

// Peta situs untuk mesin pencari: halaman publik dan artikel yang sudah terbit (dibaca sebagai pengunjung anonim).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await appOrigin();
  const pages: MetadataRoute.Sitemap = [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/artikel`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/become-shopper`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${origin}/syarat`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/privasi`, changeFrequency: "yearly", priority: 0.2 },
  ];
  if (!isSupabaseConfigured) return pages;
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { fetch: freshFetch } });
  const [{ data: cats }, { data: articles }] = await Promise.all([
    anon.from("article_categories").select("slug"),
    anon.from("articles").select("category, slug, updated_at").eq("status", "published").lte("published_at", new Date().toISOString()),
  ]);
  const used = new Set((articles ?? []).map((a) => a.category as string));
  return [
    ...pages,
    ...(cats ?? []).filter((c) => used.has(c.slug as string)).map((c) => ({ url: `${origin}/artikel/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...(articles ?? []).map((a) => ({ url: `${origin}/artikel/${a.category}/${a.slug}`, lastModified: a.updated_at as string, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
