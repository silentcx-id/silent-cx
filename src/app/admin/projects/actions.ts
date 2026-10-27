"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/admin", "/app"];
const note = z.string().trim().max(500).optional();

export async function reviewOrder(raw: unknown) {
  await requireRole("admin", "/admin/projects");
  return run(
    z.object({ projectId: z.uuid(), approve: z.boolean(), note, prices: z.record(z.uuid(), z.coerce.number().int().min(0)).default({}) }),
    raw,
    async ({ projectId, approve, note, prices }) => {
      const supabase = await createClient();
      check(await supabase.rpc("admin_review_order", { p_project: projectId, p_approve: approve, p_note: note ?? null, p_prices: prices }));
    },
    PATHS,
  );
}

export async function verifyPayment(raw: unknown) {
  await requireRole("admin", "/admin/projects");
  return run(
    z.object({ invoiceId: z.uuid(), approve: z.boolean(), note }),
    raw,
    async ({ invoiceId, approve, note }) => {
      const supabase = await createClient();
      check(await supabase.rpc("admin_verify_payment", { p_invoice: invoiceId, p_approve: approve, p_note: note ?? null }));
    },
    PATHS,
  );
}

export async function cancelOrder(raw: unknown) {
  await requireRole("admin", "/admin/projects");
  return run(
    z.object({ projectId: z.uuid(), note: z.string().trim().min(1, "Alasan wajib diisi.").max(500) }),
    raw,
    async ({ projectId, note }) => {
      const supabase = await createClient();
      check(await supabase.rpc("admin_cancel_order", { p_project: projectId, p_note: note }));
    },
    PATHS,
  );
}

// Tautan sementara (10 menit) untuk melihat file bukti bayar yang tersimpan privat.
export async function proofLink(raw: unknown) {
  await requireRole("admin", "/admin/projects");
  return run(z.object({ proofId: z.uuid() }), raw, async ({ proofId }) => {
    const supabase = await createClient();
    const proof = checkData<{ file_path: string }>(await supabase.from("payment_proofs").select("file_path").eq("id", proofId).maybeSingle());
    const { signedUrl } = checkData(await createAdminClient().storage.from("payment-proofs").createSignedUrl(proof.file_path, 600));
    return signedUrl;
  });
}
