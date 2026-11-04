import Link from "next/link";
import { Logo } from "./logo";
import { articleBlocks, inlineParts } from "@/lib/article-blocks";
import { date } from "@/lib/format";

// Teks dengan **tebal** dan [tautan](…); tautan keluar dibuka di tab baru.
export function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i} className="font-semibold text-fg">
            {p.text}
          </strong>
        ) : p.kind === "link" ? (
          p.href.startsWith("/") ? (
            <Link key={i} href={p.href} className="font-semibold text-mark underline underline-offset-4 hover:text-fg">
              {p.text}
            </Link>
          ) : (
            <a key={i} href={p.href} target="_blank" rel="noopener" className="font-semibold text-mark underline underline-offset-4 hover:text-fg">
              {p.text}
            </a>
          )
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="grid gap-4 text-[16px] leading-relaxed text-muted" data-testid="article-body">
      {articleBlocks(body).map((b, i) =>
        b.kind === "h2" ? (
          <h2 key={i} className="mt-6 text-2xl font-extrabold text-fg">
            {b.text}
          </h2>
        ) : b.kind === "h3" ? (
          <h3 key={i} className="mt-2 text-lg font-bold text-fg">
            {b.text}
          </h3>
        ) : b.kind === "ul" ? (
          <ul key={i} className="grid list-disc gap-2 pl-6 marker:text-mark">
            {b.items.map((x, j) => (
              <li key={j}>
                <Inline text={x} />
              </li>
            ))}
          </ul>
        ) : b.kind === "ol" ? (
          <ol key={i} className="grid list-decimal gap-2 pl-6 marker:font-semibold marker:text-mark">
            {b.items.map((x, j) => (
              <li key={j}>
                <Inline text={x} />
              </li>
            ))}
          </ol>
        ) : (
          <p key={i} className="whitespace-pre-line">
            <Inline text={b.text} />
          </p>
        ),
      )}
    </div>
  );
}

export type ArticleCardData = { category: string; categoryName: string; slug: string; title: string; excerpt: string; cover: string; published_at: string | null };

export function ArticleCard({ a }: { a: ArticleCardData }) {
  return (
    <li className="card group grid overflow-hidden" data-testid="article-card">
      <Link href={`/artikel/${a.category}/${a.slug}`} className="grid h-full content-start">
        {a.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- sampul dari Supabase Storage
          <img src={a.cover} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
        ) : (
          <span aria-hidden="true" className="grid aspect-[16/9] place-items-center bg-gradient-to-br from-accent/30 via-raise to-surface font-display text-3xl font-extrabold text-mark">
            {a.categoryName}
          </span>
        )}
        <span className="grid gap-2 p-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-mark">
            {a.categoryName} · {date(a.published_at, "id")}
          </span>
          <span className="font-display text-lg font-extrabold leading-snug group-hover:text-mark">{a.title}</span>
          {a.excerpt && <span className="line-clamp-3 text-sm text-muted">{a.excerpt}</span>}
        </span>
      </Link>
    </li>
  );
}

// Kerangka halaman artikel publik: logo, tautan artikel, dan ajakan daftar.
export function ArticleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-4 text-sm" aria-label="Artikel">
          <Link href="/artikel" className="text-muted hover:text-fg">
            Artikel
          </Link>
          <Link href="/artikel/promo" className="text-muted hover:text-fg">
            Promo
          </Link>
          <Link href="/register" className="btn btn-primary btn-sm">
            Daftar gratis
          </Link>
        </nav>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-8 px-4 pb-16 pt-4 sm:px-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6">
          <span>© {new Date().getFullYear()} SilentCX</span>
          <span className="flex gap-4">
            <Link href="/" className="hover:text-fg">
              Beranda
            </Link>
            <Link href="/syarat" className="hover:text-fg">
              Syarat & Ketentuan
            </Link>
            <Link href="/privasi" className="hover:text-fg">
              Kebijakan Privasi
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
