import Link from "next/link";
import { AutoCarousel } from "./auto-carousel";
import { Logo } from "./logo";
import { PrefsSwitch } from "./prefs-switch";
import { displayPrice, promoActive, type Package } from "@/lib/catalog-types";
import { waLink } from "@/lib/field";
import { rupiah } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { LANDING_ICONS, type LandingIcon } from "@/lib/landing-icons";
import { pick, type Section, type SectionKey, type SiteContent } from "@/lib/site-content";
import { socialHref, SOCIALS, websiteHref, websiteLabel } from "@/lib/site-links";

type Props = { content: SiteContent; packages: Package[]; lang: Lang; banner?: React.ReactNode };

const h2 = "text-[clamp(28px,3.8vw,42px)] font-extrabold leading-[1.08] tracking-tight";
const NAV: SectionKey[] = ["steps", "audited", "sample", "packages", "faq", "contact"];
const shadow = "shadow-[0_10px_30px_-18px_rgba(6,8,12,0.35)]";

// Landing page dari dokumen konten (CMS). Dipakai halaman utama (versi terbit) dan pratinjau admin (draf).
// Bagian tampil sesuai urutan dan status tampil yang diatur admin; paket diambil dari Katalog.
// Hanya untuk pengunjung yang belum masuk; yang sudah masuk diarahkan ke dashboard.
export function Landing({ content, packages, lang, banner }: Props) {
  const t = dict(lang);
  const L = t.landing;
  const { site } = content;
  const p = (x: Parameters<typeof pick>[0]) => pick(x, lang);
  const visible = content.order.filter((k) => content.sections[k].visible);
  // Paket yang dipilih di landing terbawa ke halaman Pilih paket setelah mendaftar.
  const choose = (key: string) => `/register?next=${encodeURIComponent(`/app/paket?paket=${key}`)}`;
  const wa = site.whatsapp.trim() ? waLink(site.whatsapp, lang === "en" ? "Hello SilentCX, I'd like to ask about mystery shopping." : "Halo SilentCX, saya ingin bertanya tentang mystery shopping.") : "";
  const instagram = socialHref("instagram", site.instagram);
  const hasContact = Boolean(wa || site.email || instagram);
  // Footer: alamat, telepon, WhatsApp, email, situs web, dan media sosial yang diisi admin.
  const website = websiteHref(site.website);
  const socials = SOCIALS.map((s) => ({ ...s, href: socialHref(s.key, site[s.key]) })).filter((s) => s.href);
  const footerContact = Boolean(site.address.trim() || site.phone.trim() || wa || site.email || website);
  // Bagian yang benar-benar tampil: Kontak butuh info kontak, Paket butuh paket aktif.
  const shown = visible.filter((k) => (k !== "contact" || hasContact) && (k !== "packages" || packages.length > 0));
  const nav = NAV.filter((k) => shown.includes(k));
  // Warna latar selang-seling hitam dan putih mengikuti urutan bagian yang tampil, mulai dari hero hitam.
  const isDark = (k: SectionKey) => shown.indexOf(k) % 2 === 0;
  const carouselLabels = (n: number) => ({ prev: L.prev, next: L.next, goTo: Array.from({ length: n }, (_, i) => L.goTo(i + 1)) });

  const head = (s: Section, id: string, center = false) => (
    <div className={`grid max-w-3xl gap-3 ${center ? "mx-auto text-center" : ""}`}>
      {p(s.eyebrow) && <span className="eyebrow">{p(s.eyebrow)}</span>}
      <h2 id={`${id}-title`} className={h2}>
        {p(s.title)}
      </h2>
      {p(s.lede) && <p className="text-lg text-muted">{p(s.lede)}</p>}
    </div>
  );

  const render: Record<SectionKey, (s: Section) => React.ReactNode> = {
    hero: (s) => (
      <div className="grid items-center gap-10 py-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:py-10">
        <div className="relative z-10 grid gap-6">
          {p(s.eyebrow) && <span className="eyebrow text-mark">{p(s.eyebrow)}</span>}
          <h1 className="text-[clamp(38px,6.2vw,68px)] font-extrabold uppercase leading-[0.98] tracking-tight">{p(s.title)}</h1>
          {p(s.lede) && <p className="max-w-[56ch] text-lg text-muted">{p(s.lede)}</p>}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/register" className="btn btn-primary px-7 text-base uppercase tracking-wide">
              {p(s.cta)}
            </Link>
            <Link href="/become-shopper" className="font-semibold underline decoration-accent decoration-2 underline-offset-8 hover:text-mark">
              {p(s.cta2)} →
            </Link>
          </div>
        </div>
        {s.image && (
          // eslint-disable-next-line @next/next/no-img-element -- ilustrasi bawaan (SVG) atau gambar unggahan admin di Supabase Storage
          <img src={s.image} alt="" className="relative z-10 mx-auto w-full max-w-[620px]" />
        )}
      </div>
    ),
    problems: (s) => (
      <>
        {head(s, "problems", true)}
        <ul className="grid gap-5 md:grid-cols-3">
          {s.items.map((x, i) => (
            <li key={i} className={`card grid content-start gap-3 p-6 ${shadow}`}>
              <IconTile icon={x.icon} />
              <h3 className="text-lg font-extrabold">{p(x.title)}</h3>
              <p className="text-muted">{p(x.body)}</p>
            </li>
          ))}
        </ul>
      </>
    ),
    steps: (s) => (
      <>
        {head(s, "steps", true)}
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {s.items.map((x, i) => (
            <li key={i} className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-6">
              <span className="font-display text-5xl font-extrabold leading-none text-accent">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-lg font-extrabold">{p(x.title)}</h3>
              <p className="text-muted">{p(x.body)}</p>
            </li>
          ))}
        </ol>
      </>
    ),
    audited: (s) => (
      <>
        {head(s, "audited", true)}
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {s.items.map((x, i) => (
            <li key={i} className={`card flex gap-4 p-5 ${shadow}`}>
              <IconTile icon={x.icon} />
              <span className="grid content-start gap-1">
                <span className="font-extrabold">{p(x.title)}</span>
                <span className="text-sm text-muted">{p(x.body)}</span>
              </span>
            </li>
          ))}
        </ul>
      </>
    ),
    why: (s) => (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        {head(s, "why")}
        <ul className="grid gap-8 sm:grid-cols-2">
          {s.items.map((x, i) => (
            <li key={i} className="flex gap-4">
              <IconTile icon={x.icon} outline />
              <span className="grid content-start gap-1">
                <span className="text-lg font-extrabold">{p(x.title)}</span>
                <span className="text-muted">{p(x.body)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    ),
    sample: (s) => (
      <>
        <div className="flex flex-wrap items-end justify-between gap-6">
          {head(s, "sample")}
          <a href="/contoh-laporan" target="_blank" rel="noreferrer" className="btn btn-primary">
            {p(s.cta)} ↗
          </a>
        </div>
        {s.items.length > 0 && (
          <AutoCarousel label={p(s.title)} itemClass="w-[88%] sm:w-[calc((100%-20px)/2)]" labels={carouselLabels(s.items.length)}>
            {s.items.map((x, i) => (
              <figure key={i} className="grid gap-3">
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_40px_-24px_rgba(6,8,12,0.45)]">
                  {x.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- gambar contoh bawaan (SVG) atau unggahan admin
                    <img src={x.image} alt={p(x.title)} loading="lazy" className="aspect-[3/2] w-full object-cover" />
                  ) : (
                    <div className="aspect-[3/2] w-full bg-raise" />
                  )}
                </div>
                <figcaption className="grid gap-0.5">
                  <span className="font-extrabold">{p(x.title)}</span>
                  {p(x.body) && <span className="text-sm text-muted">{p(x.body)}</span>}
                </figcaption>
              </figure>
            ))}
          </AutoCarousel>
        )}
      </>
    ),
    packages: (s) =>
      packages.length > 0 && (
        <>
          {head(s, "packages", true)}
          <ul className="grid gap-5 pt-4 md:grid-cols-3 md:items-center">
            {packages.map((pkg) => {
              const from = pkg.prices[0];
              return (
                <li
                  key={pkg.key}
                  className={`card relative grid content-start gap-5 p-6 ${pkg.recommended ? "border-2 border-accent shadow-[0_24px_50px_-28px_rgba(229,169,60,0.8)] md:py-10" : shadow}`}
                >
                  {pkg.recommended && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-ink">{L.popular}</span>
                  )}
                  <div className="grid gap-1 text-center">
                    <h3 className="font-display text-2xl font-extrabold">{pkg.name.replace(/^SilentCX\s+/, "")}</h3>
                    <p className="text-sm text-muted">{pkg.tagline}</p>
                  </div>
                  <div className="grid justify-items-center border-y border-line py-4">
                    {promoActive(pkg) && <s className="text-sm text-muted tabular-nums">{rupiah(from.price)}</s>}
                    <span className="font-display text-4xl font-extrabold tabular-nums">
                      {rupiah(displayPrice(from.price, pkg))}
                      {promoActive(pkg) && <span className="ml-2 align-middle text-sm text-mark">−{pkg.promo_pct}%</span>}
                    </span>
                    <span className="text-center text-xs text-muted">
                      {pkg.prices.length > 1 ? `${t.orders.from} ` : ""}
                      {t.orders.perOutlets(from.outlets)} · {t.orders.totalNote}
                    </span>
                  </div>
                  <ul className="grid gap-2 text-sm">
                    {pkg.features.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden="true" className="font-bold text-mark">
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={choose(pkg.key)} className="btn btn-primary mt-auto w-full">
                    {t.client.choosePackage}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ),
    testimonials: (s) => (
      <>
        {head(s, "testimonials", true)}
        {s.items.length > 0 && (
          <AutoCarousel label={p(s.title)} itemClass="w-[88%] sm:w-[calc((100%-20px)/2)] lg:w-[calc((100%-40px)/3)]" labels={carouselLabels(s.items.length)}>
            {s.items.map((x, i) => (
              <figure key={i} className="grid h-full content-between gap-6 rounded-2xl border border-line bg-raise p-6">
                <blockquote className="grid gap-3">
                  <span aria-hidden="true" className="font-display text-6xl font-extrabold leading-[0.6] text-accent">
                    “
                  </span>
                  <p className="text-lg leading-relaxed">{p(x.body)}</p>
                </blockquote>
                <figcaption className="flex items-center gap-3">
                  <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-accent font-display text-lg font-extrabold text-accent-ink">
                    {p(x.title).trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="grid">
                    <span className="font-extrabold">{p(x.title)}</span>
                    {p(x.meta) && <span className="text-sm text-muted">{p(x.meta)}</span>}
                  </span>
                </figcaption>
              </figure>
            ))}
          </AutoCarousel>
        )}
      </>
    ),
    faq: (s) => (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        {head(s, "faq")}
        <div className="grid gap-3">
          {s.items.map((x, i) => (
            <details key={i} className="card group p-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold">
                {p(x.title)}
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-[70ch] text-muted">{p(x.body)}</p>
            </details>
          ))}
        </div>
      </div>
    ),
    shopper: (s) => (
      <div className={`grid items-center gap-10 rounded-3xl border border-accent bg-surface p-6 sm:p-10 ${s.image ? "md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]" : ""}`}>
        <div className="grid gap-6">
          {head(s, "shopper")}
          {s.items.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-3">
              {s.items.map((x, i) => (
                <li key={i} className="grid content-start gap-2">
                  <IconTile icon={x.icon} small />
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
        {s.image && (
          // eslint-disable-next-line @next/next/no-img-element -- gambar unggahan admin di Supabase Storage
          <img src={s.image} alt="" className="aspect-[4/3] w-full rounded-2xl border border-line object-cover" />
        )}
      </div>
    ),
    contact: (s) =>
      hasContact && (
        <div className="flex flex-wrap items-end justify-between gap-6">
          {head(s, "contact")}
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
        </div>
      ),
    // Di urutan hitam, ajakan penutup tampil sebagai kotak emas supaya tidak menyatu dengan footer.
    cta: (s) => {
      const gold = isDark("cta");
      return (
        <div className={`flex flex-wrap items-center justify-between gap-6 rounded-3xl px-6 py-10 sm:px-10 ${gold ? "bg-accent text-accent-ink" : "border border-line bg-raise"}`}>
          <div className="grid max-w-2xl gap-2">
            <h2 id="cta-title" className="text-[clamp(24px,3.2vw,36px)] font-extrabold leading-tight tracking-tight">
              {p(s.title)}
            </h2>
            {p(s.lede) && <p className={gold ? "text-accent-ink/75" : "text-muted"}>{p(s.lede)}</p>}
          </div>
          <Link href="/register" className={`btn px-8 text-base ${gold ? "border-accent-ink bg-accent-ink text-accent hover:opacity-90" : "btn-primary"}`}>
            {p(s.cta)} →
          </Link>
        </div>
      );
    },
  };

  const navLinks = nav.map((k) => (
    <a key={k} href={`#${k}`} className="text-sm font-medium text-muted transition hover:text-fg">
      {L.nav[k as keyof typeof L.nav]}
    </a>
  ));

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <div className="tape" aria-hidden="true" />
      {banner}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo height={34} />
          <nav aria-label={L.menu} className="ml-6 hidden items-center gap-6 lg:flex">
            {navLinks}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block">
              <PrefsSwitch lang={lang} />
            </span>
            <Link href="/login" className="btn btn-sm">
              {t.common.login}
            </Link>
            <Link href="/register" className="btn btn-sm btn-primary">
              {L.signup}
            </Link>
            <details className="lg:hidden">
              <summary className="btn btn-sm list-none px-2.5" aria-label={L.menu}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </summary>
              <div className="absolute inset-x-4 top-full mt-2 grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:left-auto sm:w-72">
                <nav aria-label={L.menu} className="grid gap-3">
                  {navLinks}
                </nav>
                <span className="sm:hidden">
                  <PrefsSwitch lang={lang} />
                </span>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {shown.map((k) => {
          const dark = isDark(k);
          return (
            <section
              key={k}
              id={k}
              aria-labelledby={k === "hero" ? undefined : `${k}-title`}
              data-theme={dark ? "dark" : "light"}
              className={`relative scroll-mt-16 overflow-hidden text-fg ${dark ? "bg-bg" : "bg-surface"}`}
            >
              {k === "hero" && <HeroBackdrop />}
              <div className={`relative mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 ${k === "hero" ? "py-12 md:py-16" : "py-16 md:py-24"}`}>{render[k](content.sections[k])}</div>
            </section>
          );
        })}
      </main>

      <footer className="border-t border-line bg-bg">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
          <div className="grid content-start gap-4">
            <Logo height={38} />
            <p className="max-w-[34ch] text-sm text-muted">{t.brand.tagline}</p>
            {socials.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={L.social}>
                {socials.map((s) => (
                  <li key={s.key}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={s.label}
                      title={s.label}
                      className="grid size-10 place-items-center rounded-full bg-accent text-accent-ink transition hover:bg-mark"
                    >
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={s.d} />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FooterList title={L.quickLinks}>
            {nav.map((k) => (
              <a key={k} href={`#${k}`} className="hover:text-fg">
                {L.nav[k as keyof typeof L.nav]}
              </a>
            ))}
          </FooterList>
          <FooterList title={L.forShoppers}>
            <Link href="/become-shopper" className="hover:text-fg">
              {L.ctaShopper}
            </Link>
            <Link href="/login" className="hover:text-fg">
              {t.common.login}
            </Link>
          </FooterList>
          {footerContact && (
            <FooterList title={L.follow}>
              {site.address.trim() && <address className="whitespace-pre-line not-italic">{site.address.trim()}</address>}
              {site.phone.trim() && (
                <a href={`tel:${site.phone.replace(/[^\d+]/g, "")}`} className="hover:text-fg">
                  {L.phone}: {site.phone.trim()}
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noreferrer" className="hover:text-fg">
                  WhatsApp: {site.whatsapp.trim()}
                </a>
              )}
              {site.email && (
                <a href={`mailto:${site.email}`} className="break-all hover:text-fg">
                  {site.email}
                </a>
              )}
              {website && (
                <a href={website} target="_blank" rel="noreferrer" className="break-all hover:text-fg">
                  {websiteLabel(site.website)}
                </a>
              )}
            </FooterList>
          )}
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-xs text-muted sm:px-6">
            <p>
              © {new Date().getFullYear()} SilentCX. {L.rights}
            </p>
            <nav aria-label={t.legal.terms} className="flex flex-wrap gap-x-5 gap-y-1">
              <Link href="/syarat" className="hover:text-fg">
                {pick(content.legal.terms.title, lang)}
              </Link>
              <Link href="/privasi" className="hover:text-fg">
                {pick(content.legal.privacy.title, lang)}
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

function IconTile({ icon, outline, small }: { icon: LandingIcon | ""; outline?: boolean; small?: boolean }) {
  if (!icon) return null;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl ${small ? "size-10" : "size-12"} ${outline ? "border border-accent/50 bg-accent/10 text-accent" : "bg-accent text-accent-ink"}`}
    >
      <svg viewBox="0 0 24 24" className={small ? "size-5" : "size-6"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={LANDING_ICONS[icon].d} />
      </svg>
    </span>
  );
}

function FooterList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-3">
      <h3 className="text-sm font-extrabold">{title}</h3>
      <div className="grid gap-2 text-sm text-muted">{children}</div>
    </div>
  );
}

// Bidang miring emas di latar hero, senada dengan pita kuning-hitam SilentCX.
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--fg)_1px,transparent_1px),linear-gradient(90deg,var(--fg)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute -right-20 -top-1/4 h-[150%] w-40 rotate-[28deg] bg-gradient-to-b from-accent/70 to-accent/10" />
      <div className="absolute -top-1/3 right-56 h-[170%] w-14 rotate-[28deg] bg-gradient-to-b from-accent/35 to-transparent" />
    </div>
  );
}
