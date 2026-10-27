import "server-only";
import { notFound } from "next/navigation";
import { ComingSoon, PortalShell } from "@/components/portal-shell";
import { getLang, getTheme } from "./prefs";
import { menuItem, ROLE_HOME, type Role } from "./roles";
import { requireRole } from "./session";

// Layout bersama tiap area role: memastikan role, lalu membungkus halaman dengan PortalShell.
export function areaLayout(role: Role, home: string) {
  return async function AreaLayout({ children }: { children: React.ReactNode }) {
    const [viewer, lang, theme] = await Promise.all([requireRole(role, home), getLang(), getTheme()]);
    return (
      <PortalShell viewer={viewer} lang={lang} theme={theme}>
        {children}
      </PortalShell>
    );
  };
}

// Halaman menu yang belum dibangun: tampil sebagai "Hadir di Fase N"; slug di luar menu → 404.
// Setiap halaman memeriksa role sendiri, karena layout tidak dirender ulang saat berpindah halaman.
export async function comingSoonPage(role: Role, slug: string) {
  const item = menuItem(role, slug);
  if (!item || !slug) notFound();
  await requireRole(role, `${ROLE_HOME[role]}/${slug}`);
  const lang = await getLang();
  return <ComingSoon title={item.label[lang]} phase={item.phase} lang={lang} />;
}
