import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComingSoon, PortalShell } from "@/components/portal-shell";
import { dict } from "./i18n";
import { clientState, getClientProjects } from "./orders";
import { getNotificationCenter } from "./notifications";
import { getLang } from "./prefs";
import { menuItem, ROLE_HOME, type Role } from "./roles";
import { requireRole } from "./session";

// Fitur yang dibuka paket dan add-on dari proyek client yang sudah aktif.
async function clientEntitlements(clientId: string) {
  return clientState(await getClientProjects(clientId)).entitlements;
}

// Layout bersama tiap area role: memastikan role, lalu membungkus halaman dengan PortalShell.
export function areaLayout(role: Role, home: string) {
  return async function AreaLayout({ children }: { children: React.ReactNode }) {
    const [viewer, lang] = await Promise.all([requireRole(role, home), getLang()]);
    const [entitlements, notifications] = await Promise.all([
      role === "client" ? clientEntitlements(viewer.id) : undefined,
      getNotificationCenter(viewer.id),
    ]);
    return (
      <PortalShell viewer={viewer} lang={lang} entitlements={entitlements} notifications={notifications}>
        {children}
      </PortalShell>
    );
  };
}

// Halaman menu yang belum dibangun: tampil sebagai "Segera hadir"; slug di luar menu → 404.
// Setiap halaman memeriksa role sendiri, karena layout tidak dirender ulang saat berpindah halaman.
export async function comingSoonPage(role: Role, slug: string) {
  const item = menuItem(role, slug);
  if (!item || !slug) notFound();
  const viewer = await requireRole(role, `${ROLE_HOME[role]}/${slug}`);
  const lang = await getLang();
  if (item.entitlement && !(await clientEntitlements(viewer.id)).includes(item.entitlement)) {
    const t = dict(lang).orders;
    return (
      <section className="card grid gap-3 p-6">
        <h1 className="text-2xl font-extrabold">{item.label[lang]}</h1>
        <p className="font-semibold">{t.lockedFeatureTitle}</p>
        <p className="text-muted">{t.lockedFeatureBody}</p>
        <Link href="/app/paket" className="btn btn-primary w-fit">
          {dict(lang).client.choosePackage} →
        </Link>
      </section>
    );
  }
  return <ComingSoon title={item.label[lang]} lang={lang} />;
}
