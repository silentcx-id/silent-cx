"use client";

import Link from "next/link";
import { markNotificationsRead } from "@/app/notification-actions";
import { StatusText, useAction } from "./use-action";
import { dateTime } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { notificationLink, notificationText, type Notification } from "@/lib/notification-text";

// Daftar lengkap notifikasi di halaman Notifikasi.
export function NotificationList({ items, lang }: { items: Notification[]; lang: Lang }) {
  const t = dict(lang).notifications;
  const { pending, status, act } = useAction();
  const unread = items.some((n) => !n.read_at);

  if (items.length === 0) return <p className="card p-6 text-muted">{t.empty}</p>;
  return (
    <section className="grid max-w-3xl gap-3">
      {unread && (
        <button type="button" className="btn btn-sm w-fit" disabled={pending} onClick={() => act(() => markNotificationsRead())}>
          {t.markAllRead}
        </button>
      )}
      <ul className="grid gap-2">
        {items.map((n) => {
          const link = notificationLink(n, lang);
          return (
            <li key={n.id} className={`card grid gap-1 p-4 ${n.read_at ? "" : "border-accent"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {!n.read_at && <span className="chip border-accent text-mark">{t.unread}</span>}
                {n.kind === "task.offered" && n.detail.urgent && <span className="chip border-accent text-mark">{t.taskUrgent}</span>}
                <span>{dateTime(n.created_at, lang)}</span>
              </div>
              <p>{notificationText(n, lang)}</p>
              {link && (
                <Link href={link.href} className="w-fit text-sm font-semibold text-mark underline underline-offset-4">
                  {link.label} →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <StatusText status={status} />
    </section>
  );
}
