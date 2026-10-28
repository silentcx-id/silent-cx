"use client";

import Link from "next/link";
import { markNotificationsRead } from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { date, dateTime } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import type { Notification } from "@/lib/shopper";

// Notifikasi di aplikasi. Teks disusun dari jenis notifikasi supaya mengikuti bahasa pengguna.
export function NotificationList({ items, lang }: { items: Notification[]; lang: Lang }) {
  const t = dict(lang).notifications;
  const { pending, status, act } = useAction();
  const unread = items.some((n) => !n.read_at);

  const text = (n: Notification) => {
    if (n.kind === "application.approved") return t.approved;
    if (n.kind === "application.rejected") {
      const again = n.detail.reapply_at ? ` ${t.reapplyAt(date(n.detail.reapply_at, lang))}` : "";
      return `${t.rejected(n.detail.note ?? "—")}${again}`;
    }
    const code = n.detail.code ?? "";
    if (n.kind === "task.offered") return t.taskOffered(code, n.detail.city ?? "—", n.detail.respond_by ? dateTime(n.detail.respond_by, lang) : "—");
    if (n.kind === "task.withdrawn") return t.taskWithdrawn(code);
    if (n.kind === "task.cancelled") return t.taskCancelled(code, n.detail.note ?? "—");
    return n.kind;
  };
  // Tawaran yang masih bisa dibuka langsung dari notifikasi.
  const link = (n: Notification) => (n.kind === "task.offered" && n.detail.task ? `/shopper/assignments/${n.detail.task}` : null);

  return (
    <section className="grid gap-3" aria-labelledby="notif-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="notif-title" className="eyebrow">
          {t.title}
        </h2>
        {unread && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => markNotificationsRead())}>
            {t.markRead}
          </button>
        )}
      </div>
      <ul className="grid gap-2">
        {items.map((n) => (
          <li key={n.id} className={`card grid gap-1 p-4 ${n.read_at ? "" : "border-accent"}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {!n.read_at && <span className="chip border-accent text-mark">{t.unread}</span>}
              {n.kind === "task.offered" && n.detail.urgent && <span className="chip border-accent text-mark">{t.taskUrgent}</span>}
              <span>{dateTime(n.created_at, lang)}</span>
            </div>
            <p>{text(n)}</p>
            {link(n) && (
              <Link href={link(n)!} className="w-fit text-sm font-semibold text-mark underline underline-offset-4">
                {t.openTask} →
              </Link>
            )}
          </li>
        ))}
      </ul>
      <StatusText status={status} />
    </section>
  );
}
