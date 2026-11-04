import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody, ArticleCard, ArticleShell } from "@/components/article-view";
import { appOrigin } from "@/lib/app-origin";
import { plainText } from "@/lib/article-blocks";
import { articlePath, getArticle, getCategories, getLiveArticles, isLive } from "@/lib/articles";
import { waLink } from "@/lib/field";
import { date } from "@/lib/format";
import { getViewer } from "@/lib/session";
import { getPublishedContent } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/artikel/[category]/[slug]">): Promise<Metadata> {
  const { category, slug } = await params;
  const a = await getArticle(category, slug);
  if (!a) return { title: "Artikel tidak ditemukan" };
  const description = a.seo_description || a.excerpt || plainText(a.body);
  const title = a.seo_title || a.title;
  return {
    title: { absolute: title.includes("SilentCX") ? title : `${title} · SilentCX` },
    description,
    alternates: { canonical: articlePath(a) },
    // Draf dan artikel terjadwal (pratinjau admin) tidak diindeks.
    robots: isLive(a) ? undefined : { index: false, follow: false },
    openGraph: { type: "article", title, description, publishedTime: a.published_at ?? undefined, modifiedTime: a.updated_at, images: a.cover ? [a.cover] : undefined },
    twitter: { card: a.cover ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ArticlePage({ params }: PageProps<"/artikel/[category]/[slug]">) {
  const { category, slug } = await params;
  const [a, categories, viewer, content, origin] = await Promise.all([getArticle(category, slug), getCategories(), getViewer(), getPublishedContent(), appOrigin()]);
  if (!a) notFound();
  const live = isLive(a);
  // Selain admin, hanya artikel yang sudah terbit yang bisa dibuka (RLS juga menolak).
  if (!live && viewer?.role !== "admin") notFound();
  const cat = categories.find((c) => c.slug === a.category);
  const related = (await getLiveArticles(a.category)).filter((x) => x.id !== a.id).slice(0, 3);
  const wa = a.cta_label && content.site.whatsapp.trim() ? waLink(content.site.whatsapp, a.cta_message || `Halo SilentCX, saya membaca artikel "${a.title}".`) : "";
  const url = `${origin}${articlePath(a)}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: a.seo_description || a.excerpt || plainText(a.body),
      datePublished: a.published_at,
      dateModified: a.updated_at,
      image: a.cover ? [a.cover] : undefined,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: "SilentCX", url: origin },
      publisher: { "@type": "Organization", name: "SilentCX", url: origin },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Artikel", item: `${origin}/artikel` },
        { "@type": "ListItem", position: 2, name: cat?.name ?? a.category, item: `${origin}/artikel/${a.category}` },
        { "@type": "ListItem", position: 3, name: a.title, item: url },
      ],
    },
  ];

  return (
    <ArticleShell>
      {live && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}
      {!live && (
        <p role="status" className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm" data-testid="article-preview-note">
          Pratinjau admin: artikel ini {a.status === "draft" ? "masih draf" : `terjadwal terbit ${date(a.published_at, "id")}`} dan belum bisa dibuka publik.{" "}
          <Link href={`/admin/articles/${a.id}`} className="font-semibold underline underline-offset-4">
            Ubah artikel
          </Link>
        </p>
      )}
      <article className="mx-auto grid w-full max-w-3xl gap-6">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/artikel" className="hover:text-fg">
            Artikel
          </Link>{" "}
          /{" "}
          <Link href={`/artikel/${a.category}`} className="hover:text-fg">
            {cat?.name ?? a.category}
          </Link>
        </nav>
        <header className="grid gap-3">
          <h1 className="text-[clamp(28px,5vw,44px)] font-extrabold leading-tight">{a.title}</h1>
          {a.excerpt && <p className="text-lg text-muted">{a.excerpt}</p>}
          <p className="text-sm text-muted">
            SilentCX · <time dateTime={a.published_at ?? undefined}>{date(a.published_at ?? a.created_at, "id")}</time>
          </p>
        </header>
        {a.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- sampul dari Supabase Storage
          <img src={a.cover} alt="" className="aspect-[16/9] w-full rounded-2xl border border-line object-cover" />
        )}
        <ArticleBody body={a.body} />
        {wa && (
          <section className="grid gap-3 rounded-2xl border border-accent bg-accent/10 p-5 sm:flex sm:items-center sm:justify-between" data-testid="article-cta">
            <p className="font-semibold">Tim SilentCX siap membantu lewat WhatsApp.</p>
            <a href={wa} target="_blank" rel="noopener" className="btn btn-primary w-fit">
              {a.cta_label} →
            </a>
          </section>
        )}
      </article>
      {related.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-xl font-extrabold">Artikel lain di {cat?.name ?? a.category}</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <ArticleCard key={r.id} a={{ ...r, categoryName: cat?.name ?? r.category }} />
            ))}
          </ul>
        </section>
      )}
    </ArticleShell>
  );
}
