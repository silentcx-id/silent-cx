"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adminMarkChatRead, adminSetChatStatus, saveChatSettings } from "@/app/chat-actions";
import { ChatConversation, mergeMessages, useChatRealtime } from "@/components/chat-conversation";
import { toast } from "@/components/toaster";
import { DAY_NAMES, type ChatMessage, type ChatSettings } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";

type Thread = { id: string; user_id: string; status: "open" | "closed"; admin_unread: number };
type Person = { name: string; email: string; phone: string | null; role: string };

// Percakapan terpilih: pesan baru masuk langsung, dan ditandai dibaca selama panel terbuka.
export function AdminChatPanel({
  thread,
  person,
  initialMessages,
  adminNames,
  backHref,
}: {
  thread: Thread;
  person: Person;
  initialMessages: ChatMessage[];
  adminNames: Record<string, string>;
  backHref: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(thread.status);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (thread.admin_unread > 0) adminMarkChatRead(thread.id).then(() => router.refresh());
  }, [thread.id, thread.admin_unread, router]);

  useChatRealtime(`admin-chat:${thread.id}`, { thread: thread.id }, {
    message: (m) => {
      setMessages((l) => mergeMessages(l, [m]));
      if (!m.from_admin && document.visibilityState === "visible") adminMarkChatRead(thread.id);
    },
  });

  async function toggle() {
    setBusy(true);
    const next = status === "open" ? "closed" : "open";
    const res = await adminSetChatStatus({ thread: thread.id, status: next });
    setBusy(false);
    if (!res.ok) return toast("error", res.error);
    setStatus(next);
    toast("ok", next === "closed" ? "Percakapan ditandai selesai. Akan terbuka lagi kalau pengguna mengirim pesan." : "Percakapan dibuka lagi.");
    router.refresh();
  }

  return (
    <section className="card flex h-[min(78dvh,760px)] min-w-0 flex-col overflow-hidden" aria-label={`Percakapan dengan ${person.name}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref} className="btn btn-sm px-2.5 lg:hidden" aria-label="Kembali ke daftar percakapan">
            ←
          </Link>
          <span className="grid min-w-0">
            <span className="truncate font-extrabold">{person.name}</span>
            <span className="truncate text-xs text-muted">
              {person.role} · {person.email}
              {person.phone && <span className="font-mono"> · {person.phone}</span>}
            </span>
          </span>
        </div>
        <span className="flex flex-wrap gap-2">
          <Link href={`/admin/accounts/${thread.user_id}`} className="btn btn-sm">
            Detail akun
          </Link>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={toggle}>
            {status === "open" ? "Tandai selesai" : "Buka lagi"}
          </button>
        </span>
      </header>
      <ChatConversation mode="admin" threadId={thread.id} messages={messages} onMessages={setMessages} adminNames={adminNames} placeholder="Balas sebagai Sisca…" className="flex-1" />
    </section>
  );
}

// Daftar percakapan diperbarui saat ada pesan atau percakapan baru (dibatasi sekali per 1,5 detik).
export function ChatListRefresher() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    const refresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, 1500);
    };
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (stopped) return;
      channel = supabase.channel("admin-chat-list").on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, refresh).subscribe();
    })();
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}

// Jam kerja Sisca dan pesan otomatis di luar jam kerja.
export function ChatSettingsForm({ initial }: { initial: ChatSettings }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <details className="card w-full max-w-md p-0 [&[open]>summary]:border-b [&[open]>summary]:border-line">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Jam kerja dan pesan otomatis ▾</summary>
      <form
        className="grid gap-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await saveChatSettings(s);
          setBusy(false);
          if (!res.ok) return toast("error", res.error);
          toast("ok", "Jam kerja Sisca disimpan.");
          router.refresh();
        }}
      >
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Hari kerja</legend>
          <div className="flex flex-wrap gap-2">
            {DAY_NAMES.map((name, i) => {
              const d = i + 1;
              const on = s.days.includes(d);
              return (
                <label key={d} className={`chip cursor-pointer ${on ? "border-accent text-mark" : ""}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => setS({ ...s, days: on ? s.days.filter((x) => x !== d) : [...s.days, d] })} />
                  {name}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">
            Mulai (WIB)
            <input type="time" className="min-h-10 rounded-lg border border-line bg-raise px-3" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Selesai (WIB)
            <input type="time" className="min-h-10 rounded-lg border border-line bg-raise px-3" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-semibold">
          Pesan otomatis di luar jam kerja
          <textarea className="min-h-24 rounded-lg border border-line bg-raise px-3 py-2 text-sm font-normal" maxLength={500} value={s.away_message} onChange={(e) => setS({ ...s, away_message: e.target.value })} />
          <span className="text-xs font-normal text-muted">Dikirim sekali saat pengguna menulis di luar jam kerja, sampai admin membalas.</span>
        </label>
        <button className="btn btn-sm btn-primary w-fit" disabled={busy}>
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </form>
    </details>
  );
}
