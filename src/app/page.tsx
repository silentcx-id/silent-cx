import Link from "next/link";
import { Logo } from "@/components/logo";
import { PrefsSwitch } from "@/components/prefs-switch";
import { dict } from "@/lib/i18n";
import { getLang, getTheme } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import { getViewer } from "@/lib/session";

// Landing page sementara. Landing lengkap dengan CMS dan katalog paket dibangun di Fase 1.
export default async function Home() {
  const [lang, theme, viewer] = await Promise.all([getLang(), getTheme(), getViewer()]);
  const t = dict(lang);
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
