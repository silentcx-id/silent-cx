"use client";

import { useEffect, useRef, useState } from "react";
import { loadMyChat, markChatRead } from "@/app/chat-actions";
import { ChatConversation, mergeMessages, SiscaAvatar, useChatRealtime } from "./chat-conversation";
import { SISCA, type ChatMessage } from "@/lib/chat";

// Tombol live chat Sisca di pojok kanan bawah dashboard client dan shopper. ?chat=1 di alamat membukanya
// (dipakai tautan notifikasi "Sisca membalas pesan Anda").
export function ChatWidget({ userId, initialUnread, hours }: { userId: string; initialUnread: number; hours: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const openRef = useRef(open);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    openRef.current = open;
  });

  async function show() {
    setOpen(true);
    const res = await loadMyChat();
    if (res.ok && res.data) {
      setMessages((l) => mergeMessages(l, res.data!.messages));
      setThreadId(res.data.thread?.id ?? null);
      setReadAt(res.data.thread?.admin_read_at ?? null);
    }
    setLoaded(true);
    setUnread(0);
    markChatRead();
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("chat") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- membuka panel dari tautan notifikasi sekali saat halaman dimuat
      show();
      const url = new URL(window.location.href);
      url.searchParams.delete("chat");
      window.history.replaceState(null, "", url);
    }
  }, []);

  useChatRealtime(`chat:${userId}`, { user: userId }, {
    message: (m) => {
      setMessages((l) => mergeMessages(l, [m]));
      setThreadId(m.thread_id);
      if (m.from_admin && !m.auto) {
        if (openRef.current && document.visibilityState === "visible") markChatRead();
        else setUnread((n) => n + 1);
      }
    },
    thread: (t) => {
      if (typeof t.admin_read_at === "string") setReadAt(t.admin_read_at);
      if (typeof t.id === "string") setThreadId(t.id);
    },
  });

  // Esc menutup panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={`Live chat dengan ${SISCA.name}`}
          className="fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col overflow-hidden border-line bg-surface shadow-2xl sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-2xl sm:border"
        >
          <header className="flex items-center gap-3 border-b border-line bg-bg px-4 py-3" data-theme="dark">
            <SiscaAvatar size={40} />
            <span className="grid min-w-0 flex-1">
              <span className="font-extrabold">{SISCA.name}</span>
              <span className="truncate text-[11px] text-mark">{SISCA.tagline}</span>
            </span>
            <button type="button" className="btn btn-sm px-2.5" aria-label="Tutup live chat" onClick={() => setOpen(false)}>
              ✕
            </button>
          </header>
          <p className="border-b border-line bg-raise px-4 py-2 text-xs text-muted">Jam kerja: {hours}. Di luar jam kerja, pesan dibalas pada jam kerja berikutnya.</p>
          {loaded ? (
            <ChatConversation mode="user" threadId={threadId} messages={messages} onMessages={setMessages} readAt={readAt} className="flex-1" />
          ) : (
            <p className="flex-1 p-6 text-sm text-muted">Memuat percakapan…</p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-expanded={open}
        aria-label={unread ? `Live chat dengan ${SISCA.name}, ${unread} pesan baru` : `Live chat dengan ${SISCA.name}`}
        className={`fixed bottom-5 right-5 z-50 items-center gap-2 rounded-full border border-accent bg-bg p-1 pr-4 text-sm font-bold text-fg shadow-[0_12px_30px_-10px_rgba(229,169,60,0.7)] transition hover:-translate-y-0.5 sm:bottom-6 sm:right-6 ${open ? "hidden sm:flex" : "flex"}`}
        data-theme="dark"
      >
        <span className="relative">
          <SiscaAvatar size={44} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold text-white tabular-nums">{unread}</span>
          )}
        </span>
        {open ? "Tutup" : "Chat Sisca"}
      </button>
    </>
  );
}
