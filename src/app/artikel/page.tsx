import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard, ArticleShell } from "@/components/article-view";
import { getCategories, getLiveArticles } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Artikel",
  description: "Promo, panduan, dan wawasan pengalaman pelanggan dari SilentCX.",
  alternates: { canonical: "/artikel" },
};

export default async function ArticlesPage() {
  const [articles, categories] = await Promise.all([getLiveArticles(), getCategories()]);
  const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const used = categories.filter((c) => articles.some((a) => a.category === c.slug));
  return (
    <ArticleShell>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(30px,5vw,48px)] font-extrabold leading-tight">Artikel SilentCX</h1>
        <p className="text-muted">Promo, panduan, dan wawasan untuk meningkatkan pengalaman pelanggan di outlet Anda.</p>
      </section>
      {used.length > 0 && (
        <nav aria-label="Kategori" className="flex flex-wrap gap-2">
          <span className="chip border-accent text-mark">Semua</span>
          {used.map((c) => (
            <Link key={c.slug} href={`/artikel/${c.slug}`} className="chip hover:border-accent hover:text-fg">
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {articles.length === 0 ? (
        <p className="card p-6 text-muted">Belum ada artikel. Kembali lagi nanti.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} a={{ ...a, categoryName: names[a.category] ?? a.category }} />
          ))}
        </ul>
      )}
    </ArticleShell>
  );
}
