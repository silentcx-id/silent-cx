"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { CHAT_IMAGE_TYPES, MESSAGE_COLUMNS, THREAD_COLUMNS, type ChatMessage, type ChatThread } from "@/lib/chat";
import { getViewer, requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "chat-attachments";
const HISTORY = 200;

const body = z.string().max(2000, "Pesan maksimal 2.000 karakter.");
const attachment = z.string().max(300).nullable().default(null);
const upload = z.object({ type: z.string(), size: z.number().int().positive().max(5 * 1024 * 1024, "Foto maksimal 5 MB.") });

async function signedUpload(folder: string, type: string) {
  const ext = CHAT_IMAGE_TYPES[type];
  if (!ext) throw new Error("Lampiran harus berupa foto (JPG, PNG, atau WEBP).");
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { token } = checkData(await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path));
  return { path, token };
}

// Percakapan pengguna yang sedang masuk (client atau shopper) beserta pesan terakhirnya.
export async function loadMyChat() {
  const viewer = await getViewer();
  return run(z.undefined(), undefined, async () => {
    if (!viewer || viewer.role === "admin") throw new Error("Silakan masuk sebagai client atau shopper.");
    const supabase = await createClient();
    const thread = check(await supabase.from("chat_threads").select(THREAD_COLUMNS).eq("user_id", viewer.id).maybeSingle()) as ChatThread | null;
    if (!thread) return { thread: null, messages: [] as ChatMessage[] };
    const rows = check(await supabase.from("chat_messages").select(MESSAGE_COLUMNS).eq("thread_id", thread.id).order("id", { ascending: false }).limit(HISTORY));
    return { thread, messages: ((rows ?? []) as ChatMessage[]).reverse() };
  });
}

export async function sendChat(raw: unknown) {
  const viewer = await getViewer();
  return run(z.object({ body, attachment }), raw, async (m) => {
    if (!viewer) throw new Error("Silakan masuk dulu.");
    const supabase = await createClient();
    return checkData(await supabase.rpc("chat_send", { p_body: m.body, p_attachment: m.attachment })) as number;
  });
}

export async function markChatRead() {
  const viewer = await getViewer();
  return run(z.undefined(), undefined, async () => {
    if (!viewer) return;
    check(await (await createClient()).rpc("chat_mark_read"));
  });
}

// Foto disimpan di folder milik pengguna; database menolak lampiran di luar folder itu.
export async function prepareChatUpload(raw: unknown) {
  const viewer = await getViewer();
  return run(upload, raw, async ({ type }) => {
    if (!viewer || viewer.role === "admin") throw new Error("Silakan masuk dulu.");
    return signedUpload(viewer.id, type);
  });
}

// Tautan sementara untuk foto di percakapan. Hanya foto dari pesan yang boleh dibaca peminta (dicek RLS).
export async function chatAttachmentUrls(raw: unknown) {
  const viewer = await getViewer();
  return run(z.array(z.string().max(300)).max(100), raw, async (paths) => {
    if (!viewer || !paths.length) return {} as Record<string, string>;
    const supabase = await createClient();
    const rows = check(await supabase.from("chat_messages").select("attachment_path").in("attachment_path", paths)) ?? [];
    const allowed = [...new Set(rows.map((r) => r.attachment_path as string))];
    if (!allowed.length) return {} as Record<string, string>;
    const signed = checkData(await createAdminClient().storage.from(BUCKET).createSignedUrls(allowed, 3600));
    return Object.fromEntries(signed.filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl]));
  });
}

// ---------------------------------------------------------------------------
// Admin

export async function loadThreadMessages(raw: unknown) {
  await requireRole("admin", "/admin/chat");
  return run(z.uuid(), raw, async (thread) => {
    const supabase = await createClient();
    const rows = check(await supabase.from("chat_messages").select(MESSAGE_COLUMNS).eq("thread_id", thread).order("id", { ascending: false }).limit(HISTORY));
    return ((rows ?? []) as ChatMessage[]).reverse();
  });
}

export async function adminSendChat(raw: unknown) {
  await requireRole("admin", "/admin/chat");
  return run(
    z.object({ thread: z.uuid(), body, attachment }),
    raw,
    async (m) => checkData(await (await createClient()).rpc("admin_chat_send", { p_thread: m.thread, p_body: m.body, p_attachment: m.attachment })) as number,
    ["/admin"],
  );
}

export async function adminMarkChatRead(raw: unknown) {
  await requireRole("admin", "/admin/chat");
  return run(z.uuid(), raw, async (thread) => {
    check(await (await createClient()).rpc("admin_chat_mark_read", { p_thread: thread }));
  });
}

export async function adminSetChatStatus(raw: unknown) {
  await requireRole("admin", "/admin/chat");
  return run(
    z.object({ thread: z.uuid(), status: z.enum(["open", "closed"]) }),
    raw,
    async ({ thread, status }) => {
      check(await (await createClient()).rpc("admin_chat_set_status", { p_thread: thread, p_status: status }));
    },
    ["/admin/chat"],
  );
}

export async function prepareAdminChatUpload(raw: unknown) {
  await requireRole("admin", "/admin/chat");
  return run(upload.extend({ thread: z.uuid() }), raw, async ({ thread, type }) => signedUpload(`admin/${thread}`, type));
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam harus berformat JJ:MM.");

export async function saveChatSettings(raw: unknown) {
  const viewer = await requireRole("admin", "/admin/chat");
  return run(
    z
      .object({
        days: z.array(z.number().int().min(1).max(7)).min(1, "Pilih minimal satu hari kerja."),
        start: time,
        end: time,
        away_message: z.string().trim().min(10, "Pesan di luar jam kerja minimal 10 karakter.").max(500),
      })
      .refine((s) => s.end > s.start, "Jam selesai harus setelah jam mulai."),
    raw,
    async (value) => {
      check(await (await createClient()).from("app_settings").upsert({ key: "chat", value: { ...value, days: [...new Set(value.days)].sort() }, updated_by: viewer.id }));
    },
    ["/admin/chat"],
  );
}
