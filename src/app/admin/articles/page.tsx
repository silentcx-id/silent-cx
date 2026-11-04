import type { Metadata } from "next";
import Link from "next/link";
import { CategoryForm } from "./category-form";
import { Tabs } from "@/components/tabs";
import { articlePath, getAdminArticles, getCategories, isLive } from "@/lib/articles";
import { dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Artikel" };

export default async function AdminArticlesPage({ searchParams }: PageProps<"/admin/articles">) {
  const [, params] = await Promise.all([requireRole("admin", "/admin/articles"), searchParams]);
  const [articles, categories] = await Promise.all([getAdminArticles(), getCategories()]);
  const tab = typeof params.tab === "string" && categories.some((c) => c.slug === params.tab) ? params.tab : "semua";
  const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const shown = tab === "semua" ? articles : articles.filter((a) => a.category === tab);
  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid max-w-3xl gap-2">
          <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Artikel</h1>
          <p className="text-muted">
            Artikel tampil di{" "}
            <a href="/artikel" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-fg">
              /artikel
            </a>{" "}
            dan masuk peta situs untuk Google setelah terbit.
          </p>
        </div>
        <Link href={`/admin/articles/baru${tab !== "semua" ? `?kategori=${tab}` : ""}`} className="btn btn-primary">
          + Tulis artikel
        </Link>
      </section>

      <Tabs
        base="/admin/articles"
        label="Kategori artikel"
        current={tab}
        items={[{ id: "semua", label: "Semua", count: articles.length }, ...categories.map((c) => ({ id: c.slug, label: c.name, count: articles.filter((a) => a.category === c.slug).length }))]}
      />

      {shown.length === 0 ? (
        <p className="card p-5 text-muted">Belum ada artikel di sini.</p>
      ) : (
        <ul className="grid gap-3" data-testid="admin-articles">
          {shown.map((a) => {
            const live = isLive(a);
            return (
              <li key={a.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="grid min-w-0 gap-1">
                  <Link href={`/admin/articles/${a.id}`} className="font-semibold hover:text-mark">
                    {a.title}
                  </Link>
                  <span className="truncate text-xs text-muted">
                    {names[a.category] ?? a.category} · {articlePath(a)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`chip ${live ? "border-good/60 text-good" : a.status === "published" ? "border-accent text-mark" : "text-muted"}`}>
                    {live ? "Terbit" : a.status === "published" ? `Terjadwal ${dateTime(a.published_at, "id")}` : "Draf"}
                  </span>
                  <Link href={`/admin/articles/${a.id}`} className="btn btn-sm">
                    Ubah
                  </Link>
                  <a href={articlePath(a)} target="_blank" rel="noreferrer" className="btn btn-sm">
                    {live ? "Lihat ↗" : "Pratinjau ↗"}
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <details className="card p-5">
        <summary className="cursor-pointer text-lg font-extrabold">Kategori</summary>
        <div className="mt-4 grid gap-4">
          <ul className="flex flex-wrap gap-2 text-sm">
            {categories.map((c) => (
              <li key={c.slug} className="chip">
                {c.name} · /artikel/{c.slug}
              </li>
            ))}
          </ul>
          <CategoryForm />
        </div>
      </details>
    </>
  );
}
