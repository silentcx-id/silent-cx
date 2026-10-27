import Link from "next/link";
import { Logo } from "@/components/logo";
import { PrefsSwitch } from "@/components/prefs-switch";
import { dict } from "@/lib/i18n";
import { getLang, getTheme } from "@/lib/prefs";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  const t = dict(lang);
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <PrefsSwitch lang={lang} theme={theme} />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-10 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1fr_minmax(0,440px)] md:pt-14">
        <section className="hidden md:grid md:gap-4 md:pt-6">
          <span className="eyebrow">{t.brand.tagline}</span>
          <p className="max-w-[24ch] font-display text-5xl font-extrabold leading-[0.95] tracking-tight">
            {t.landing.title}
          </p>
          <Link href="/" className="mt-2 text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            ← {t.common.back}
          </Link>
        </section>
        <div className="card rise grid gap-6 p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
