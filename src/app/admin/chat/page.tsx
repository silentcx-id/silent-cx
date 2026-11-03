import type { Metadata } from "next";
import Link from "next/link";
import { AdminChatPanel, ChatListRefresher, ChatSettingsForm } from "./chat-panel";
import { SiscaAvatar } from "@/components/chat-conversation";
import { chatHoursLabel, MESSAGE_COLUMNS, normalizeChatSettings, SISCA, THREAD_COLUMNS, type ChatMessage, type ChatThread } from "@/lib/chat";
import { dict } from "@/lib/i18n";
import { getLang } from "@/lib/prefs";
import type { Role } from "@/lib/roles";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Live chat" };

type Person = { full_name: string; email: string; phone: string | null; role: Role };
type Row = ChatThread & { profile: Person | null };

const ROLES = ["all", "client", "shopper"] as const;
const STATUSES = ["open", "closed", "all"] as const;
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
const when = (v: string) => {
  const d = new Date(v);
  return date.format(d) === date.format(new Date()) ? time.format(d) : date.format(d);
};

// Inbox live chat: daftar percakapan di kiri, percakapan terpilih di kanan. Di HP, daftar dan percakapan bergantian.
export default async function AdminChatPage({ searchParams }: PageProps<"/admin/chat">) {
  const [, lang, params] = await Promise.all([requireRole("admin", "/admin/chat"), getLang(), searchParams]);
  const t = dict(lang);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const role = ROLES.includes(one(params.role) as (typeof ROLES)[number]) ? (one(params.role) as (typeof ROLES)[number]) : "all";
  const status = STATUSES.includes(one(params.status) as (typeof STATUSES)[number]) ? (one(params.status) as (typeof STATUSES)[number]) : "open";
  const q = one(params.q).trim().slice(0, 80);
  const selected = /^[0-9a-f-]{36}$/.test(one(params.t)) ? one(params.t) : "";

  const supabase = await createClient();
  const inner = role !== "all" || q;
  let query = supabase
    .from("chat_threads")
    .select(`${THREAD_COLUMNS}, profile:profiles!chat_threads_user_id_fkey${inner ? "!inner" : ""}(full_name, email, phone, role)`)
    .order("admin_unread", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  if (role !== "all") query = query.eq("profile.role", role);
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()*]/g, " ")}%,email.ilike.%${q.replace(/[%,()*]/g, " ")}%`, { referencedTable: "profile" });
  const [{ data }, { data: settings }, { data: admins }] = await Promise.all([
    query,
    supabase.from("app_settings").select("value").eq("key", "chat").maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("role", "admin"),
  ]);
  const threads = (data ?? []) as unknown as Row[];
  const chatSettings = normalizeChatSettings(settings?.value);
  const adminNames = Object.fromEntries((admins ?? []).map((a) => [a.id as string, (a.full_name as string) || "admin"]));

  // Percakapan terpilih bisa berada di luar filter (misalnya dibuka dari notifikasi).
  let current: Row | null = threads.find((x) => x.id === selected) ?? null;
  if (selected && !current) {
    const { data: row } = await supabase.from("chat_threads").select(`${THREAD_COLUMNS}, profile:profiles!chat_threads_user_id_fkey(full_name, email, phone, role)`).eq("id", selected).maybeSingle();
    current = (row as unknown as Row | null) ?? null;
  }
  let messages: ChatMessage[] = [];
  if (current) {
    const { data: rows } = await supabase.from("chat_messages").select(MESSAGE_COLUMNS).eq("thread_id", current.id).order("id", { ascending: false }).limit(200);
    messages = ((rows ?? []) as ChatMessage[]).reverse();
  }

  const href = (patch: Record<string, string>) => {
    const qs = new URLSearchParams({ ...(role !== "all" && { role }), ...(status !== "open" && { status }), ...(q && { q }), ...(selected && { t: selected }), ...patch });
    for (const [k, v] of [...qs]) if (!v) qs.delete(k);
    return `/admin/chat${qs.size ? `?${qs}` : ""}`;
  };
  const unreadTotal = threads.filter((x) => x.admin_unread > 0).length;

  return (
    <>
      <ChatListRefresher />
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-2">
          <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Live chat</h1>
          <p className="flex items-center gap-2 text-muted">
            <SiscaAvatar size={28} />
            Semua balasan tampil sebagai {SISCA.name} ({SISCA.tagline}). Jam kerja: {chatHoursLabel(chatSettings)}.
          </p>
        </div>
        <ChatSettingsForm initial={chatSettings} />
      </section>

      <div className={`grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start`}>
        <section className={`card grid min-w-0 content-start gap-0 overflow-hidden ${current ? "hidden lg:grid" : ""}`} aria-label="Daftar percakapan">
          <form action="/admin/chat" className="grid gap-2 border-b border-line p-3">
            {selected && <input type="hidden" name="t" value={selected} />}
            <label className="sr-only" htmlFor="chat-q">
              Cari nama atau email
            </label>
            <input id="chat-q" name="q" type="search" defaultValue={q} placeholder="Cari nama atau email" className="min-h-10 rounded-lg border border-line bg-raise px-3 text-sm" />
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="chat-role">
                Jenis akun
              </label>
              <select id="chat-role" name="role" defaultValue={role} className="min-h-10 flex-1 rounded-lg border border-line bg-raise px-2 text-sm">
                <option value="all">Semua akun</option>
                <option value="client">{t.roles.client}</option>
                <option value="shopper">{t.roles.shopper}</option>
              </select>
              <label className="sr-only" htmlFor="chat-status">
                Status percakapan
              </label>
              <select id="chat-status" name="status" defaultValue={status} className="min-h-10 flex-1 rounded-lg border border-line bg-raise px-2 text-sm">
                <option value="open">Terbuka</option>
                <option value="closed">Selesai</option>
                <option value="all">Semua</option>
              </select>
              <button className="btn btn-sm">OK</button>
            </div>
          </form>
          <p className="border-b border-line px-3 py-2 text-xs text-muted">
            {threads.length} percakapan{unreadTotal ? ` · ${unreadTotal} belum dibaca` : ""}
          </p>
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-muted">{q || role !== "all" || status !== "open" ? "Tidak ada percakapan yang cocok." : "Belum ada percakapan terbuka."}</p>
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-line overflow-y-auto">
              {threads.map((x) => (
                <li key={x.id}>
                  <Link
                    href={href({ t: x.id })}
                    aria-current={x.id === current?.id ? "page" : undefined}
                    className={`grid gap-0.5 px-3 py-3 text-sm transition hover:bg-raise ${x.id === current?.id ? "bg-accent/10" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate ${x.admin_unread ? "font-extrabold" : "font-semibold"}`}>{x.profile?.full_name || x.profile?.email || "—"}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">{when(x.last_message_at)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate ${x.admin_unread ? "text-fg" : "text-muted"}`}>{x.last_message || "—"}</span>
                      {x.admin_unread > 0 && <span className="shrink-0 rounded-full bg-bad px-1.5 text-[11px] font-semibold tabular-nums text-white">{x.admin_unread}</span>}
                    </span>
                    <span className="text-[11px] text-muted">
                      {x.profile ? t.roles[x.profile.role] : "—"}
                      {x.status === "closed" ? " · selesai" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {current ? (
          <AdminChatPanel
            key={current.id}
            thread={{ id: current.id, user_id: current.user_id, status: current.status, admin_unread: current.admin_unread }}
            person={{ name: current.profile?.full_name || "—", email: current.profile?.email ?? "", phone: current.profile?.phone ?? null, role: current.profile ? t.roles[current.profile.role] : "—" }}
            initialMessages={messages}
            adminNames={adminNames}
            backHref={href({ t: "" })}
          />
        ) : (
          <section className="card hidden place-items-center gap-3 p-10 text-center text-muted lg:grid">
            <SiscaAvatar size={64} />
            <p>Pilih percakapan di kiri untuk membalas sebagai {SISCA.name}.</p>
          </section>
        )}
      </div>
    </>
  );
}
