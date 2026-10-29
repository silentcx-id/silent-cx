"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markNotificationRead, markNotificationsRead, refreshNotifications } from "@/app/notification-actions";
import { Icon } from "./icon";
import { toast } from "./toaster";
import { dateTime } from "@/lib/format";
import { dict, type Lang } from "@/lib/i18n";
import { notificationLink, notificationText, type Notification } from "@/lib/notification-text";
import { createClient } from "@/lib/supabase/client";

const LIMIT = 10;
type Center = { items: Notification[]; unread: number };

// Lonceng notifikasi di header semua role. Notifikasi baru masuk real time lewat Supabase Realtime;
// saat tab dibuka lagi isinya diambil ulang, untuk berjaga kalau sambungan sempat putus.
export function NotificationBell({ userId, lang, initial, allHref }: { userId: string; lang: Lang; initial: Center; allHref: string }) {
  const t = dict(lang).notifications;
  const router = useRouter();
  const [center, setCenter] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [open, setOpen] = useState(false);
  // Di HP panel selebar layar, tepat di bawah lonceng.
  const [top, setTop] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // Penandaan dibaca yang belum selesai di server; pindah halaman menunggunya supaya status baca tidak kembali.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  // Data baru dari server (misalnya setelah halaman disegarkan) menggantikan isi lonceng.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCenter(initial);
  }

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    const sync = async () => {
      const res = await refreshNotifications().catch(() => null);
      if (res?.ok && res.data) setCenter(res.data);
    };
    (async () => {
      // Token sesi dipasang dulu; tanpa itu Realtime menganggap pengunjung anonim dan RLS menolak langganan.
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (stopped) return;
      channel = supabase
        .channel(`notifications:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
          const n = payload.new as Notification;
          setCenter((c) => (c.items.some((x) => x.id === n.id) ? c : { items: [n, ...c.items].slice(0, LIMIT), unread: c.unread + 1 }));
          toast("ok", notificationText(n, lang));
          // Halaman yang sedang dibuka ikut diperbarui (misalnya antrian kerja admin).
          router.refresh();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") sync();
        });
    })();
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, lang, router]);

  // Panel tertutup saat klik di luar atau menekan Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const readOne = (n: Notification) => {
    if (n.read_at) return;
    setCenter((c) => ({ items: c.items.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)), unread: Math.max(c.unread - 1, 0) }));
    saving.current = Promise.all([saving.current, markNotificationRead(n.id).catch(() => null)]);
  };
  const readAll = () => {
    const now = new Date().toISOString();
    setCenter((c) => ({ items: c.items.map((x) => ({ ...x, read_at: x.read_at ?? now })), unread: 0 }));
    saving.current = Promise.all([saving.current, markNotificationsRead().catch(() => null)]);
  };
  // Klik biasa pada tautan di panel: tunggu penandaan selesai, baru pindah halaman. Ctrl/klik tengah tetap bawaan browser.
  const go = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setOpen(false);
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    saving.current.then(() => router.push(href));
  };

  const badge = center.unread > 99 ? "99+" : String(center.unread);
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className="btn btn-sm relative px-2.5"
        aria-label={center.unread ? t.bellUnread(center.unread) : t.bell}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          setTop(e.currentTarget.getBoundingClientRect().bottom + 8);
          setOpen((o) => !o);
        }}
      >
        <Icon name="bell" />
        {center.unread > 0 && (
          <span data-testid="bell-count" className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold leading-5 text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t.bell}
          style={{ "--panel-top": `${top}px` } as React.CSSProperties}
          className="fixed inset-x-3 top-(--panel-top) z-50 grid overflow-hidden rounded-xl border border-line bg-surface shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[400px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="font-bold">{t.bell}</span>
            {center.unread > 0 && (
              <button type="button" className="text-sm font-semibold text-mark underline underline-offset-4" onClick={readAll}>
                {t.markAllRead}
              </button>
            )}
          </div>
          {center.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">{t.empty}</p>
          ) : (
            <ul className="grid max-h-[min(65vh,480px)] overflow-y-auto">
              {center.items.map((n) => {
                const link = notificationLink(n, lang);
                const body = (
                  <>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-accent"}`} aria-hidden="true" />
                    <span className="grid gap-1">
                      <span className={n.read_at ? "text-muted" : "text-fg"}>{notificationText(n, lang)}</span>
                      <span className="text-xs text-muted">
                        {dateTime(n.created_at, lang)}
                        {!n.read_at && <span className="sr-only"> · {t.unread}</span>}
                      </span>
                    </span>
                  </>
                );
                const cls = "flex w-full gap-3 border-b border-line px-4 py-3 text-left text-sm hover:bg-raise";
                return (
                  <li key={n.id}>
                    {link ? (
                      <Link
                        href={link.href}
                        className={cls}
                        onClick={(e) => {
                          readOne(n);
                          go(e, link.href);
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button type="button" className={cls} onClick={() => readOne(n)}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={allHref} className="px-4 py-3 text-center text-sm font-semibold text-mark hover:bg-raise" onClick={(e) => go(e, allHref)}>
            {t.seeAll} →
          </Link>
        </div>
      )}
    </div>
  );
}
