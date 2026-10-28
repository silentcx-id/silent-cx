"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Payout shopper. Database menghitung nominal, memeriksa satu shopper per transfer, dan memberi tahu shopper.
const PATHS = ["/admin", "/shopper"];
const BUCKET = "payout-proofs";
const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

async function admin() {
  const viewer = await requireRole("admin", "/admin/payouts");
  return { viewer, supabase: await createClient() };
}

// Bukti disimpan di folder milik shopper, supaya database bisa memastikan bukti itu untuk shopper yang benar.
export async function preparePayoutProof(raw: unknown) {
  await admin();
  return run(
    z.object({ shopperId: z.uuid(), type: z.string(), size: z.number().int().positive().max(5 * 1024 * 1024, "File bukti maksimal 5 MB.") }),
    raw,
    async ({ shopperId, type }) => {
      const ext = PROOF_TYPES[type];
      if (!ext) throw new Error("Bukti harus berupa foto (JPG, PNG, WEBP) atau PDF.");
      const path = `${shopperId}/${Date.now()}.${ext}`;
      const { token } = checkData(await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path));
      return { path, token };
    },
  );
}

// Pastikan file bukti benar-benar sudah terunggah ke folder shopper.
async function assertUploaded(path: string) {
  const [folder, name, extra] = path.split("/");
  if (!folder || !name || extra !== undefined) throw new Error("File bukti tidak valid.");
  const files = checkData(await createAdminClient().storage.from(BUCKET).list(folder, { search: name }));
  if (!files.some((f) => f.name === name)) throw new Error("File bukti belum terunggah. Coba unggah lagi.");
}

const path = z.string().min(1).max(300);

export async function recordPayout(raw: unknown) {
  const { supabase } = await admin();
  return run(
    z.object({ taskIds: z.array(z.uuid()).min(1, "Pilih minimal satu tugas.").max(50), path, note: z.string().trim().max(500) }),
    raw,
    async ({ taskIds, path, note }) => {
      await assertUploaded(path);
      return checkData<string>(await supabase.rpc("admin_record_payout", { p_tasks: taskIds, p_proof: path, p_note: note || null }));
    },
    PATHS,
  );
}

export async function replacePayoutProof(raw: unknown) {
  const { supabase } = await admin();
  return run(
    z.object({ payoutId: z.uuid(), path, note: z.string().trim().min(1, "Tulis alasan penggantian bukti.").max(500) }),
    raw,
    async ({ payoutId, path, note }) => {
      await assertUploaded(path);
      check(await supabase.rpc("admin_replace_payout_proof", { p_payout: payoutId, p_proof: path, p_note: note }));
    },
    PATHS,
  );
}

// Tautan sementara untuk membuka bukti transfer.
export async function payoutProofUrl(raw: unknown) {
  const { supabase } = await admin();
  return run(z.object({ payoutId: z.uuid() }), raw, async ({ payoutId }) => {
    const po = checkData<{ proof_path: string }>(await supabase.from("payouts").select("proof_path").eq("id", payoutId).maybeSingle());
    return checkData(await createAdminClient().storage.from(BUCKET).createSignedUrl(po.proof_path, 600)).signedUrl;
  });
}

// Kontak person admin yang dihubungi shopper kalau ada masalah pembayaran.
export async function saveAdminContact(raw: unknown) {
  const { viewer, supabase } = await admin();
  return run(
    z.object({
      name: z.string().trim().min(2, "Isi nama kontak person.").max(80),
      whatsapp: z.string().trim().regex(/^\+?[0-9]{8,15}$/, "Nomor WhatsApp harus 8 sampai 15 angka."),
    }),
    raw,
    async (value) => {
      check(await supabase.from("app_settings").upsert({ key: "admin_contact", value, updated_by: viewer.id }));
    },
    PATHS,
  );
}
