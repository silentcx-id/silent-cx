import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleEditor, type EditorArticle } from "../article-editor";
import { appOrigin } from "@/lib/app-origin";
import { getAdminArticle, getCategories } from "@/lib/articles";
import { requireRole } from "@/lib/session";
import { getPublishedContent } from "@/lib/site";

export const metadata: Metadata = { title: "Tulis artikel" };

// /admin/articles/baru = artikel baru; selain itu id artikel.
export default async function ArticleEditPage({ params, searchParams }: PageProps<"/admin/articles/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await requireRole("admin", `/admin/articles/${id}`);
  const isNew = id === "baru";
  if (!isNew && !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [categories, content, origin, found] = await Promise.all([getCategories(), getPublishedContent(), appOrigin(), isNew ? null : getAdminArticle(id)]);
  if (!isNew && !found) notFound();
  const wanted = typeof query.kategori === "string" && categories.some((c) => c.slug === query.kategori) ? query.kategori : (categories[0]?.slug ?? "promo");
  const article: EditorArticle = found ?? {
    category: wanted,
    slug: "",
    title: "",
    excerpt: "",
    body: "",
    cover: "",
    seo_title: "",
    seo_description: "",
    cta_label: "",
    cta_message: "",
    status: "draft",
    published_at: null,
  };
  return (
    <>
      <section className="grid gap-2">
        <Link href="/admin/articles" className="w-fit text-sm text-muted hover:text-fg">
          ← Semua artikel
        </Link>
        <h1 className="text-[clamp(26px,4vw,36px)] font-extrabold leading-tight">{found ? "Ubah artikel" : "Artikel baru"}</h1>
      </section>
      <ArticleEditor key={found?.id ?? "baru"} article={article} categories={categories} origin={origin} hasWhatsapp={Boolean(content.site.whatsapp.trim())} />
    </>
  );
}
