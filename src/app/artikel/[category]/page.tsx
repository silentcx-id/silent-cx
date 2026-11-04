import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard, ArticleShell } from "@/components/article-view";
import { getCategories, getLiveArticles } from "@/lib/articles";

export async function generateMetadata({ params }: PageProps<"/artikel/[category]">): Promise<Metadata> {
  const { category } = await params;
  const cat = (await getCategories()).find((c) => c.slug === category);
  if (!cat) return { title: "Kategori tidak ditemukan" };
  return { title: `${cat.name} · Artikel`, description: cat.description || undefined, alternates: { canonical: `/artikel/${cat.slug}` } };
}

export default async function CategoryPage({ params }: PageProps<"/artikel/[category]">) {
  const { category } = await params;
  const [categories, articles] = await Promise.all([getCategories(), getLiveArticles(category)]);
  const cat = categories.find((c) => c.slug === category);
  if (!cat) notFound();
  return (
    <ArticleShell>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/artikel" className="hover:text-fg">
          Artikel
        </Link>{" "}
        / <span className="text-fg">{cat.name}</span>
      </nav>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(30px,5vw,48px)] font-extrabold leading-tight">{cat.name}</h1>
        {cat.description && <p className="text-muted">{cat.description}</p>}
      </section>
      {articles.length === 0 ? (
        <p className="card p-6 text-muted">Belum ada artikel di kategori ini.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <ArticleCard key={a.id} a={{ ...a, categoryName: cat.name }} />
          ))}
        </ul>
      )}
    </ArticleShell>
  );
}
