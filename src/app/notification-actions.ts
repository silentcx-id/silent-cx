"use server";

import { z } from "zod";
import { check, run } from "@/lib/action";
import { getNotificationCenter } from "@/lib/notifications";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

const AREAS = ["/shopper", "/app", "/admin"];

// Menandai semua notifikasi pengguna yang sedang masuk sebagai sudah dibaca (semua role).
export async function markNotificationsRead() {
  const viewer = await getViewer();
  return run(
    z.undefined(),
    undefined,
    async () => {
      if (!viewer) throw new Error("Silakan masuk dulu.");
      const supabase = await createClient();
      check(await supabase.rpc("mark_notifications_read"));
    },
    AREAS,
  );
}

// Satu notifikasi ditandai sudah dibaca saat diklik dari lonceng.
export async function markNotificationRead(id: number) {
  const viewer = await getViewer();
  return run(z.number().int().positive(), id, async (n) => {
    if (!viewer) throw new Error("Silakan masuk dulu.");
    const supabase = await createClient();
    check(await supabase.rpc("mark_notification_read", { p_id: n }));
  });
}

// Isi lonceng terbaru, dipakai saat tab dibuka kembali atau sambungan real time tersambung ulang.
export async function refreshNotifications() {
  const viewer = await getViewer();
  return run(z.undefined(), undefined, async () => {
    if (!viewer) throw new Error("Silakan masuk dulu.");
    return getNotificationCenter(viewer.id);
  });
}
