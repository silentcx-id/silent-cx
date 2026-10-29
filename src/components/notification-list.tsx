"use client";

import Link from "next/link";
import { markNotificationsRead } from "@/app/notification-actions";
import { StatusText, useAction } from "./use-action";
import { date, dateTime, rupiah } from "@/lib/format";
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
    if (n.kind === "task.approved") return t.taskApproved(code);
    if (n.kind === "task.revision") return t.taskRevision(code, n.detail.note ?? "—", n.detail.due ? dateTime(n.detail.due, lang) : "—");
    if (n.kind === "task.rejected") return t.taskRejected(code, n.detail.note ?? "—");
    if (n.kind === "report.published") return t.reportPublished(code);
    if (n.kind === "payout.paid") return t.payoutPaid(code, rupiah(n.detail.total ?? 0));
    if (n.kind === "payout.need_bank") return t.payoutNeedBank(code);
    if (n.kind === "payout.proof_replaced") return t.payoutProofReplaced(code, n.detail.note ?? "—");
    if (n.kind === "consultation.link") return t.consultationLink(code, n.detail.starts_at ? dateTime(n.detail.starts_at, lang) : "—");
    if (n.kind === "consultation.rescheduled") return t.consultationRescheduled(code, n.detail.starts_at ? dateTime(n.detail.starts_at, lang) : "—", n.detail.note ?? "—");
    if (n.kind === "consultation.cancelled") return t.consultationCancelled(code, n.detail.note ?? "—");
    if (n.kind === "consultation.done") return t.consultationDone(code);
    if (n.kind === "consultation.no_show") return t.consultationNoShow(code);
    if (n.kind === "consultation.credited") return t.consultationCredited(Number(n.detail.count ?? 0));
    return n.kind;
  };
  // Notifikasi yang bisa dibuka langsung ke halaman terkait.
  const link = (n: Notification): { href: string; label: string } | null => {
    if (["task.offered", "task.revision", "task.approved", "task.rejected"].includes(n.kind) && n.detail.task) return { href: `/shopper/assignments/${n.detail.task}`, label: t.openTask };
    if (n.kind === "report.published" && n.detail.project) return { href: `/app/reports/${n.detail.project}`, label: t.openReport };
    if (n.kind === "payout.paid" || n.kind === "payout.proof_replaced") return { href: "/shopper/payments", label: t.openPayments };
    if (n.kind === "payout.need_bank") return { href: "/shopper/profile", label: t.openProfile };
    if (n.kind.startsWith("consultation.")) return { href: n.detail.consultation ? `/app/consultation/${n.detail.consultation}` : "/app/consultation", label: t.openConsultation };
    return null;
  };

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
              <Link href={link(n)!.href} className="w-fit text-sm font-semibold text-mark underline underline-offset-4">
                {link(n)!.label} →
              </Link>
            )}
          </li>
        ))}
      </ul>
      <StatusText status={status} />
    </section>
  );
}
