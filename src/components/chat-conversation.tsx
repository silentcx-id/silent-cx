"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { adminSendChat, chatAttachmentUrls, prepareAdminChatUpload, prepareChatUpload, sendChat } from "@/app/chat-actions";
import { toast } from "./toaster";
import { SISCA, type ChatMessage } from "@/lib/chat";
import { shrinkImage } from "@/lib/shrink-image";
import { createClient } from "@/lib/supabase/client";

const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const day = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });

// Pesan baru dari Realtime atau dari pengiriman sendiri digabung tanpa dobel, urut id.
export function mergeMessages(list: ChatMessage[], more: ChatMessage[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of more) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function SiscaAvatar({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto kecil statis di /public
    <img src={SISCA.avatar} alt="" width={size} height={size} className="shrink-0 rounded-full border border-accent/60 object-cover" style={{ width: size, height: size }} />
  );
}

// Daftar pesan dan kotak tulis, dipakai panel chat pengguna dan inbox admin.
// mode "user": pesan pengguna di kanan, Sisca di kiri. mode "admin": kebalikannya, dengan nama admin yang membalas.
export function ChatConversation({
  mode,
  threadId,
  messages,
  onMessages,
  readAt,
  adminNames = {},
  placeholder = "Tulis pesan…",
  className = "",
}: {
  mode: "user" | "admin";
  threadId: string | null;
  messages: ChatMessage[];
  onMessages: (next: (list: ChatMessage[]) => ChatMessage[]) => void;
  // Kapan admin terakhir membaca (untuk tanda "Dibaca" di sisi pengguna).
  readAt?: string | null;
  adminNames?: Record<string, string>;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const mine = (m: ChatMessage) => (mode === "user" ? !m.from_admin : m.from_admin);

  // Selalu gulir ke pesan terbaru.
  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  // Tautan sementara untuk foto yang belum punya tautan.
  const missing = messages.map((m) => m.attachment_path).filter((p): p is string => Boolean(p) && !urls[p!]);
  const missingKey = missing.join("|");
  useEffect(() => {
    if (!missingKey) return;
    let stop = false;
    chatAttachmentUrls(missingKey.split("|")).then((res) => {
      if (!stop && res.ok && res.data) setUrls((u) => ({ ...u, ...(res.data as Record<string, string>) }));
    });
    return () => {
      stop = true;
    };
  }, [missingKey]);

  async function send(attachment: string | null = null) {
    const body = attachment ? "" : text.trim();
    if (!body && !attachment) return;
    setSending(true);
    const res = mode === "admin" && threadId ? await adminSendChat({ thread: threadId, body, attachment }) : await sendChat({ body, attachment });
    setSending(false);
    if (!res.ok) {
      toast("error", res.error);
      return;
    }
    if (!attachment) setText("");
    // Pesan sendiri langsung tampil; salinan dari Realtime nanti digabung tanpa dobel.
    if (res.data)
      onMessages((l) =>
        mergeMessages(l, [
          { id: res.data!, thread_id: threadId ?? "", sender_id: null, from_admin: mode === "admin", auto: false, body, attachment_path: attachment, created_at: new Date().toISOString() },
        ]),
      );
    input.current?.focus();
  }

  async function attach(f: File) {
    setSending(true);
    try {
      const shrunk = await shrinkImage(f, 1600);
      const prep = mode === "admin" && threadId ? await prepareAdminChatUpload({ thread: threadId, type: shrunk.type, size: shrunk.size }) : await prepareChatUpload({ type: shrunk.type, size: shrunk.size });
      if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
      const { error } = await createClient().storage.from("chat-attachments").uploadToSignedUrl(prep.data.path, prep.data.token, shrunk, { contentType: shrunk.type });
      if (error) throw new Error(error.message);
      setSending(false);
      await send(prep.data.path);
    } catch (e) {
      setSending(false);
      toast("error", e instanceof Error ? e.message : "Foto gagal dikirim.");
    }
  }

  const lastMine = [...messages].reverse().find(mine);
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={list} className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label="Percakapan">
        {messages.length === 0 && (
          <div className="flex gap-2">
            <SiscaAvatar />
            <p className="max-w-[85%] rounded-2xl rounded-tl-sm bg-raise px-3 py-2 text-sm">
              {mode === "user" ? "Halo, saya Sisca dari SilentCX. Ada yang bisa saya bantu seputar pesanan, kunjungan, atau laporan?" : "Belum ada pesan."}
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || day.format(new Date(prev.created_at)) !== day.format(new Date(m.created_at));
          const own = mine(m);
          const who = m.from_admin ? (m.auto ? "Balasan otomatis" : mode === "admin" && m.sender_id ? `Sisca · ${adminNames[m.sender_id] ?? "admin"}` : SISCA.name) : null;
          return (
            <div key={m.id} className="grid gap-2">
              {newDay && <p className="my-1 text-center text-xs text-muted">{day.format(new Date(m.created_at))}</p>}
              <div className={`flex items-end gap-2 ${own ? "justify-end" : ""}`}>
                {m.from_admin && !own && <SiscaAvatar size={28} />}
                <div className={`grid max-w-[85%] gap-1 ${own ? "justify-items-end" : ""}`}>
                  {who && (mode === "admin" || !own) && <span className="px-1 text-[11px] font-semibold text-muted">{who}</span>}
                  <div className={`grid gap-2 rounded-2xl px-3 py-2 text-sm ${own ? "rounded-br-sm bg-accent text-accent-ink" : "rounded-bl-sm bg-raise"} ${m.auto ? "border border-dashed border-line" : ""}`}>
                    {m.attachment_path &&
                      (urls[m.attachment_path] ? (
                        <a href={urls[m.attachment_path]} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- foto privat lewat tautan sementara */}
                          <img src={urls[m.attachment_path]} alt="Foto di percakapan" className="max-h-60 rounded-lg object-contain" />
                        </a>
                      ) : (
                        <span className="text-xs opacity-80">Memuat foto…</span>
                      ))}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  </div>
                  <span className="px-1 text-[11px] tabular-nums text-muted">
                    {time.format(new Date(m.created_at))}
                    {mode === "user" && own && m.id === lastMine?.id && readAt && new Date(readAt) >= new Date(m.created_at) ? " · Dibaca" : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) attach(f);
          }}
        />
        <button type="button" className="btn btn-sm shrink-0 px-2.5" aria-label="Kirim foto" title="Kirim foto" disabled={sending} onClick={() => file.current?.click()}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          </svg>
        </button>
        <label className="sr-only" htmlFor={`chat-input-${mode}`}>
          Pesan
        </label>
        <textarea
          id={`chat-input-${mode}`}
          ref={input}
          rows={1}
          maxLength={2000}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-raise px-3 py-2 text-sm [field-sizing:content] focus:border-accent focus:outline-none"
        />
        <button className="btn btn-sm btn-primary shrink-0" disabled={sending || !text.trim()}>
          {sending ? "…" : "Kirim"}
        </button>
      </form>
    </div>
  );
}

// Langganan Realtime: pesan baru (sesuai aturan baca di database) dan perubahan percakapan.
export function useChatRealtime(channelName: string, filter: { thread?: string; user?: string }, on: { message: (m: ChatMessage) => void; thread?: (t: Record<string, unknown>) => void }) {
  const handlers = useRef(on);
  useEffect(() => {
    handlers.current = on;
  });
  const { thread, user } = filter;
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (stopped) return;
      channel = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", ...(thread ? { filter: `thread_id=eq.${thread}` } : {}) }, (payload) =>
          handlers.current.message(payload.new as ChatMessage),
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads", ...(user ? { filter: `user_id=eq.${user}` } : thread ? { filter: `id=eq.${thread}` } : {}) }, (payload) =>
          handlers.current.thread?.(payload.new as Record<string, unknown>),
        )
        .subscribe();
    })();
    return () => {
      stopped = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [channelName, thread, user]);
}
