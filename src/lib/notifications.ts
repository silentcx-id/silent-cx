import "server-only";
import type { Notification } from "./notification-text";
import { createClient } from "./supabase/server";

export type { Notification } from "./notification-text";
export type NotificationCenter = { items: Notification[]; unread: number };

export async function getNotifications(userId: string, limit = 10): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, detail, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Notification[];
}

// Isi lonceng: notifikasi terbaru dan jumlah yang belum dibaca.
// Pengingat tagihan jatuh tempo dibuat terjadwal oleh database (pg_cron, migration 013).
export async function getNotificationCenter(userId: string): Promise<NotificationCenter> {
  const supabase = await createClient();
  const [items, { count }] = await Promise.all([
    getNotifications(userId),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  return { items, unread: count ?? 0 };
}
