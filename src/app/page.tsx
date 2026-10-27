import Link from "next/link";
import { Logo } from "@/components/logo";
import { PrefsSwitch } from "@/components/prefs-switch";
import { displayPrice, getCatalog, promoActive } from "@/lib/catalog";
import { rupiah } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { getLang, getTheme } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Landing page: teks tetap, paket diambil langsung dari katalog. CMS untuk teks dan gambar dibangun di Fase 6.
export default async function Home() {
  const [lang, theme, viewer] = await Promise.all([getLang(), getTheme(), getViewer()]);
  const t = dict(lang);
  const packages = isSupabaseConfigured ? (await getCatalog()).packages.filter((p) => p.active && p.prices.length > 0) : [];
  // Paket yang dipilih di landing terbawa ke halaman Pilih paket, termasuk lewat pendaftaran.
  const choose = (key: string) => {
    const target = `/app/paket?paket=${key}`;
    return viewer?.role === "client" ? target : `/register?next=${encodeURIComponent(target)}`;
  };
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex flex-wrap items-center gap-3">
          <PrefsSwitch lang={lang} theme={theme} />
          <Link href={viewer ? ROLE_HOME[viewer.role] : "/login"} className="btn btn-sm">
            {viewer ? viewer.fullName : t.common.login}
          </Link>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-16 px-4 pb-20 pt-10 sm:px-6 md:pt-20">
        <section className="grid max-w-3xl gap-6">
          <span className="eyebrow">{t.brand.tagline}</span>
          <h1 className="text-[clamp(40px,7vw,76px)] font-extrabold leading-[0.95] tracking-tight">{t.landing.title}</h1>
          <p className="max-w-[60ch] text-lg text-muted">{t.landing.lede}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn btn-primary">
              {t.landing.ctaClient}
            </Link>
            <Link href="/become-shopper" className="btn">
              {t.landing.ctaShopper}
            </Link>
          </div>
        </section>

        <section className="grid gap-6" aria-labelledby="cara-kerja">
          <h2 id="cara-kerja" className="text-2xl font-extrabold">
            {t.landing.stepsTitle}
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {t.landing.steps.map((s, i) => (
              <li key={s.title} className="card grid content-start gap-3 p-5">
                <span className="grid size-10 place-items-center rounded-full bg-accent font-display text-lg font-extrabold text-accent-ink">{i + 1}</span>
                <h3 className="text-lg font-extrabold">{s.title}</h3>
                <p className="text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
        {packages.length > 0 && (
          <section className="grid gap-6" aria-labelledby="paket">
            <div className="grid gap-2">
              <h2 id="paket" className="text-2xl font-extrabold">
                {t.orders.checkoutTitle}
              </h2>
              <p className="text-muted">{t.orders.checkoutLede}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {packages.map((p) => {
                const from = p.prices[0];
                return (
                  <li key={p.key} className={`card grid content-start gap-4 p-6 ${p.recommended ? "border-accent" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
                      {p.recommended && <span className="chip border-accent text-mark">{t.orders.recommended}</span>}
                    </div>
                    <p className="text-sm text-muted">{p.tagline}</p>
                    <div className="grid">
                      {promoActive(p) && <s className="text-sm text-muted tabular-nums">{rupiah(from.price)}</s>}
                      <span className="font-display text-3xl font-extrabold tabular-nums">
                        {rupiah(displayPrice(from.price, p))}
                        {promoActive(p) && <span className="ml-2 align-middle text-sm text-mark">−{p.promo_pct}%</span>}
                      </span>
                      <span className="text-xs text-muted">
                        {p.prices.length > 1 ? `${t.orders.from} ` : ""}
                        {t.orders.perOutlets(from.outlets)} · {t.orders.totalNote}
                      </span>
                    </div>
                    <ul className="grid gap-1.5 text-sm">
                      {p.features.slice(0, 8).map((f) => (
                        <li key={f} className="flex gap-2">
                          <span className="text-mark">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link href={choose(p.key)} className={`btn mt-auto ${p.recommended ? "btn-primary" : ""}`}>
                      {t.client.choosePackage} →
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <span>© 2026 SilentCX</span>
          <span>{t.brand.tagline}</span>
        </div>
      </footer>
    </div>
  );
}
