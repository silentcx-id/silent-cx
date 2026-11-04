"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const input = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended"]),
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

const decision = z.object({
  applicationId: z.uuid(),
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

// Menyetujui atau menolak lamaran shopper. Database memeriksa admin, status lamaran, dan alasan,
// lalu mengubah status akun, mencatat log, dan mengirim notifikasi ke pelamar.
export async function decideApplication(raw: unknown): Promise<ActionResult> {
  await requireRole("admin", "/admin/accounts");
  const parsed = decision.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Data tidak valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decide_application", {
    p_application: parsed.data.applicationId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const csInput = z.object({
  fullName: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter."),
  email: z.email("Email tidak valid.").transform((v) => v.trim().toLowerCase()),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => /^\+?[0-9]{8,15}$/.test(v), "Nomor HP 8 sampai 15 angka."),
});

// Membuat akun CS (Putaran 16). Akun langsung aktif dengan password sementara yang ditampilkan sekali ke admin;
// CS menggantinya setelah masuk lewat menu Akun saya.
export async function createCsAccount(raw: unknown): Promise<{ ok: true; data: { email: string; password: string } } | { ok: false; error: string }> {
  await requireRole("admin", "/admin/accounts");
  const parsed = csInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Data tidak valid." };
  const { fullName, email, phone } = parsed.data;
  const password = `${randomBytes(12).toString("base64url")}a7`;
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
    app_metadata: { provisioned_role: "cs" },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return { ok: false, error: "Email ini sudah terdaftar. Pakai email lain untuk akun CS." };
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/accounts");
  return { ok: true, data: { email, password } };
}
