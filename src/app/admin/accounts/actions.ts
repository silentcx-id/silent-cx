"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const input = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "rejected", "suspended"]),
  note: z.string().max(500).optional(),
});

// Perubahan status lewat fungsi database, yang memeriksa admin, transisi yang sah, alasan, dan mencatat log.
export async function setAccountStatus(raw: unknown): Promise<ActionResult> {
  await requireRole("admin", "/admin/accounts");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Data tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_account_status", {
    p_user: parsed.data.userId,
    p_status: parsed.data.status,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
