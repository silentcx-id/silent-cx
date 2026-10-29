import "server-only";
import type { Metadata } from "next";
import { NotificationList } from "@/components/notification-list";
import { dict } from "./i18n";
import { getNotifications } from "./notifications";
import { getLang } from "./prefs";
import { ROLE_HOME, type Role } from "./roles";
import { requireRole } from "./session";

export const notificationMetadata: Metadata = { title: "Notifikasi" };

// Halaman semua notifikasi, sama untuk setiap role (dibuka dari "Lihat semua" di lonceng).
export async function notificationPage(role: Role) {
  const viewer = await requireRole(role, `${ROLE_HOME[role]}/notifications`);
  const [lang, items] = await Promise.all([getLang(), getNotifications(viewer.id, 100)]);
  const t = dict(lang).notifications;
  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-3xl font-extrabold">{t.title}</h1>
        <p className="text-muted">{t.pageLede}</p>
      </section>
      <NotificationList items={items} lang={lang} />
    </>
  );
}
