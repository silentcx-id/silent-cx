"use server";

import { z } from "zod";
import { check, run } from "@/lib/action";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Menandai semua notifikasi pengguna yang sedang masuk sebagai sudah dibaca (shopper maupun client).
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
    ["/shopper", "/app"],
  );
}
