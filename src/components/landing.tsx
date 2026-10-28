import Link from "next/link";
import { Logo } from "./logo";
import { PrefsSwitch } from "./prefs-switch";
import { displayPrice, promoActive, type Package } from "@/lib/catalog-types";
import { waLink } from "@/lib/field";
import { rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import type { Theme } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import type { Viewer } from "@/lib/session";
import { pick, type Section, type SectionKey, type SiteContent } from "@/lib/site-content";

type Props = { content: SiteContent; packages: Package[]; lang: Lang; theme: Theme; viewer: Viewer | null; banner?: React.ReactNode };

const h2 = "text-[clamp(26px,3.6vw,38px)] font-extrabold leading-tight tracking-tight";

// Landing page dari dokumen konten (CMS). Dipakai halaman utama (versi terbit) dan pratinjau admin (draf).
// Bagian tampil sesuai urutan dan status tampil yang diatur admin; paket diambil dari Katalog.
export function Landing({ content, packages, lang, theme, viewer, banner }: Props) {
  const t = dict(lang);
  const { site } = content;
  const p = (x: Parameters<typeof pick>[0]) => pick(x, lang);
  // Paket yang dipilih di landing terbawa ke halaman Pilih paket, termasuk lewat pendaftaran.
  const choose = (key: string) => {
    const target = `/app/paket?paket=${key}`;
    return viewer?.role === "client" ? target : `/register?next=${encodeURIComponent(target)}`;
  };
  const wa = site.whatsapp.trim() ? waLink(site.whatsapp, lang === "en" ? "Hello SilentCX, I'd like to ask about mystery shopping." : "Halo SilentCX, saya ingin bertanya tentang mystery shopping.") : "";
  const instagram = site.instagram.trim() ? (site.instagram.startsWith("http") ? site.instagram : `https://instagram.com/${site.instagram.replace(/^@/, "")}`) : "";

  const head = (s: Section, id: string) => (
    <div className="grid max-w-3xl gap-2">
      <h2 id={id} className={h2}>
        {p(s.title)}
      </h2>
      {p(s.lede) && <p className="text-lg text-muted">{p(s.lede)}</p>}
    </div>
  );

  const render: Record<SectionKey, (s: Section) => React.ReactNode> = {
    hero: (s) => (
      <section className={`grid items-center gap-10 ${s.image ? "md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`}>
        <div className="grid max-w-3xl gap-6">
          {p(s.eyebrow) && <span className="eyebrow">{p(s.eyebrow)}</span>}
          <h1 className="text-[clamp(40px,7vw,76px)] font-extrabold leading-[0.95] tracking-tight">{p(s.title)}</h1>
          {p(s.lede) && <p className="max-w-[60ch] text-lg text-muted">{p(s.lede)}</p>}
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">
              {p(s.cta)}
            </Link>
            <Link href="/become-shopper" className="btn">
              {p(s.cta2)}
            </Link>
          </div>
        </div>
        {s.image && <Picture src={s.image} className="aspect-[4/3]" />}
      </section>
    ),
    problems: (s) => (
      <section className="grid gap-6" aria-labelledby="problems">
        {head(s, "problems")}
        <ul className="grid gap-4 md:grid-cols-3">
          {s.items.map((x, i) => (
            <li key={i} className="card grid content-start gap-2 border-l-4 border-l-accent p-5">
              <h3 className="text-lg font-extrabold">{p(x.title)}</h3>
              <p className="text-muted">{p(x.body)}</p>
            </li>
          ))}
        </ul>
      </section>
    ),
    steps: (s) => (
      <section className="grid gap-6" aria-labelledby="steps">
        {head(s, "steps")}
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {s.items.map((x, i) => (
            <li key={i} className="card grid content-start gap-3 p-5">
              <span className="grid size-10 place-items-center rounded-full bg-accent font-display text-lg font-extrabold text-accent-ink">{i + 1}</span>
              <h3 className="text-lg font-extrabold">{p(x.title)}</h3>
              <p className="text-muted">{p(x.body)}</p>
            </li>
          ))}
        </ol>
      </section>
    ),
    audited: (s) => (
      <section className="grid gap-6" aria-labelledby="audited">
        {head(s, "audited")}
        <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {s.items.map((x, i) => (
            <li key={i} className="grid grid-cols-[auto_1fr] gap-3">
              <span aria-hidden="true" className="mt-0.5 font-bold text-mark">
                ✓
              </span>
              <span className="grid gap-1">
                <span className="font-extrabold">{p(x.title)}</span>
                <span className="text-sm text-muted">{p(x.body)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    ),
    packages: (s) =>
      packages.length > 0 && (
        <section className="grid gap-6" aria-labelledby="packages">
          {head(s, "packages")}
          <ul className="grid gap-4 md:grid-cols-3">
            {packages.map((pkg) => {
              const from = pkg.prices[0];
              return (
                <li key={pkg.key} className={`card grid content-start gap-4 p-6 ${pkg.recommended ? "border-accent" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-xl font-extrabold">{pkg.name}</h3>
                    {pkg.recommended && <span className="chip border-accent text-mark">{t.orders.recommended}</span>}
                  </div>
                  <p className="text-sm text-muted">{pkg.tagline}</p>
                  <div className="grid">
                    {promoActive(pkg) && <s className="text-sm text-muted tabular-nums">{rupiah(from.price)}</s>}
                    <span className="font-display text-3xl font-extrabold tabular-nums">
                      {rupiah(displayPrice(from.price, pkg))}
                      {promoActive(pkg) && <span className="ml-2 align-middle text-sm text-mark">−{pkg.promo_pct}%</span>}
                    </span>
                    <span className="text-xs text-muted">
                      {pkg.prices.length > 1 ? `${t.orders.from} ` : ""}
                      {t.orders.perOutlets(from.outlets)} · {t.orders.totalNote}
                    </span>
                  </div>
                  <ul className="grid gap-1.5 text-sm">
                    {pkg.features.slice(0, 8).map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-mark">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={choose(pkg.key)} className={`btn mt-auto ${pkg.recommended ? "btn-primary" : ""}`}>
                    {t.client.choosePackage} →
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ),
    sample: (s) => (
      <section className={`card grid items-center gap-6 p-6 sm:p-8 ${s.image ? "md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]" : ""}`} aria-labelledby="sample">
        <div className="grid gap-4">
          {head(s, "sample")}
          <a href="/contoh-laporan" target="_blank" rel="noreferrer" className="btn btn-primary w-fit">
            {p(s.cta)} ↗
          </a>
        </div>
        {s.image && <Picture src={s.image} className="aspect-[3/4] max-h-96" />}
      </section>
    ),
    why: (s) => (
      <section className="grid gap-6" aria-labelledby="why">
        {head(s, "why")}
        <ul className="grid gap-4 sm:grid-cols-2">
          {s.items.map((x, i) => (
            <li key={i} className="card grid content-start gap-2 p-5">
              <h3 className="text-lg font-extrabold">{p(x.title)}</h3>
              <p className="text-muted">{p(x.body)}</p>
            </li>
          ))}
        </ul>
      </section>
    ),
    faq: (s) => (
      <section className="grid gap-6" aria-labelledby="faq">
        {head(s, "faq")}
        <div className="grid gap-2">
          {s.items.map((x, i) => (
            <details key={i} className="card group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold">
                {p(x.title)}
                <span aria-hidden="true" className="text-mark transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[70ch] text-muted">{p(x.body)}</p>
            </details>
          ))}
        </div>
      </section>
    ),
    shopper: (s) => (
      <section className={`grid items-center gap-8 rounded-2xl border border-accent bg-accent/10 p-6 sm:p-8 ${s.image ? "md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]" : ""}`} aria-labelledby="shopper">
        <div className="grid gap-5">
          {head(s, "shopper")}
          {s.items.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-3">
              {s.items.map((x, i) => (
                <li key={i} className="grid content-start gap-1">
                  <span className="font-extrabold">{p(x.title)}</span>
                  <span className="text-sm text-muted">{p(x.body)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/become-shopper" className="btn btn-primary w-fit">
            {p(s.cta)} →
          </Link>
        </div>
        {s.image && <Picture src={s.image} className="aspect-[4/3]" />}
      </section>
    ),
    contact: (s) => (
      <section className="grid gap-5" aria-labelledby="contact">
        {head(s, "contact")}
        {(wa || site.email || instagram) && (
          <div className="flex flex-wrap gap-3">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="btn btn-primary">
                {p(s.cta)}
              </a>
            )}
            {site.email && (
              <a href={`mailto:${site.email}`} className="btn">
                {site.email}
              </a>
            )}
            {instagram && (
              <a href={instagram} target="_blank" rel="noreferrer" className="btn">
                Instagram ↗
              </a>
            )}
          </div>
        )}
      </section>
    ),
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      {banner}
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex flex-wrap items-center gap-3">
          <PrefsSwitch lang={lang} theme={theme} />
          <Link href={viewer ? ROLE_HOME[viewer.role] : "/login"} className="btn btn-sm">
            {viewer ? viewer.fullName : t.common.login}
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-20 px-4 pb-20 pt-10 sm:px-6 md:pt-20">
        {content.order
          .filter((k) => content.sections[k].visible)
          .map((k) => (
            <div key={k} id={k} className="scroll-mt-6">
              {render[k](content.sections[k])}
            </div>
          ))}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} SilentCX</span>
          <span className="flex flex-wrap gap-4">
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="hover:text-fg">
                WhatsApp
              </a>
            )}
            {site.email && (
              <a href={`mailto:${site.email}`} className="hover:text-fg">
                {site.email}
              </a>
            )}
            {instagram && (
              <a href={instagram} target="_blank" rel="noreferrer" className="hover:text-fg">
                Instagram
              </a>
            )}
          </span>
        </div>
      </footer>
    </div>
  );
}

function Picture({ src, className }: { src: string; className: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-raise ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari Supabase Storage yang diunggah admin */}
      <img src={src} alt="" className="size-full object-cover" />
    </div>
  );
}
