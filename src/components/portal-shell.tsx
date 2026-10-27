import { logout } from "@/app/(auth)/actions";
import { Logo } from "./logo";
import { PortalNav } from "./portal-nav";
import { PrefsSwitch } from "./prefs-switch";
import { dict, type Lang } from "@/lib/i18n";
import type { Theme } from "@/lib/prefs";
import { ROLE_HOME } from "@/lib/roles";
import type { Viewer } from "@/lib/session";

// Kerangka semua dashboard: pita kuning-hitam, menu role, identitas akun, dan pilihan bahasa/tema.
export function PortalShell({ viewer, lang, theme, children }: { viewer: Viewer; lang: Lang; theme: Theme; children: React.ReactNode }) {
  const t = dict(lang);
  const locked = viewer.role === "shopper" && viewer.status !== "active";
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="tape" aria-hidden="true" />
      <div className="mx-auto grid w-full max-w-7xl flex-1 md:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="grid content-start gap-5 border-b border-line px-4 py-4 md:sticky md:top-0 md:h-[calc(100dvh-10px)] md:border-b-0 md:border-r md:px-4 md:py-6">
          <div className="flex items-center justify-between gap-3">
            <Logo href={ROLE_HOME[viewer.role]} />
            <span className="chip md:hidden">{t.roles[viewer.role]}</span>
          </div>
          <PortalNav role={viewer.role} lang={lang} locked={locked} />
          <div className="hidden gap-3 border-t border-line pt-4 md:mt-auto md:grid">
            <div className="grid gap-0.5 text-sm">
              <span className="truncate font-semibold">{viewer.fullName}</span>
              <span className="truncate text-muted">{viewer.email}</span>
              <span className="chip mt-1 w-fit">{t.roles[viewer.role]}</span>
            </div>
          </div>
        </aside>
        <div className="grid min-w-0 content-start">
          <header className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-8">
            <PrefsSwitch lang={lang} theme={theme} />
            <form action={logout}>
              <button className="btn btn-sm">{t.common.logout}</button>
            </form>
          </header>
          <main className="grid min-w-0 content-start gap-8 px-4 pb-16 pt-2 sm:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

// Halaman menu yang baru dibangun di fase berikutnya.
export function ComingSoon({ title, phase, lang }: { title: string; phase: number; lang: Lang }) {
  return (
    <section className="card grid max-w-xl gap-3 p-6">
      <span className="chip w-fit">{dict(lang).common.comingIn(phase)}</span>
      <h1 className="text-2xl font-extrabold">{title}</h1>
    </section>
  );
}
