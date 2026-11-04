import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type ArticleCategory = { slug: string; name: string; description: string; sort_order: number };
export type Article = {
  id: string;
  category: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover: string;
  seo_title: string;
  seo_description: string;
  cta_label: string;
  cta_message: string;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const articlePath = (a: Pick<Article, "category" | "slug">) => `/artikel/${a.category}/${a.slug}`;
// Terbit = status terbit dan tanggal terbitnya sudah lewat; terbit di masa depan = terjadwal.
export const isLive = (a: Pick<Article, "status" | "published_at">, now = Date.now()) => a.status === "published" && !!a.published_at && new Date(a.published_at).getTime() <= now;

export const getCategories = cache(async (): Promise<ArticleCategory[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("article_categories").select("*").order("sort_order").order("name");
  return (data ?? []) as ArticleCategory[];
});

// Artikel yang sudah terbit (RLS: publik hanya melihat yang terbit; admin melihat semua, jadi disaring lagi di sini).
export const getLiveArticles = cache(async (category?: string): Promise<Article[]> => {
  const supabase = await createClient();
  let q = supabase.from("articles").select("*").eq("status", "published").lte("published_at", new Date().toISOString()).order("published_at", { ascending: false });
  if (category) q = q.eq("category", category);
  const { data } = await q;
  return (data ?? []) as Article[];
});

// Satu artikel; admin juga bisa membuka draf atau artikel terjadwal untuk pratinjau.
export const getArticle = cache(async (category: string, slug: string): Promise<Article | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("articles").select("*").eq("category", category).eq("slug", slug).maybeSingle();
  return (data as Article | null) ?? null;
});

export async function getAdminArticles(): Promise<Article[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("articles").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as Article[];
}

export async function getAdminArticle(id: string): Promise<Article | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("articles").select("*").eq("id", id).maybeSingle();
  return (data as Article | null) ?? null;
}
