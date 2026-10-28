"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Keputusan QC. Database memeriksa status, batas revisi, alasan, dan keputusan fee, lalu memberi tahu shopper.
const PATHS = ["/admin", "/shopper", "/app"];
const id = z.uuid();
const note = z.string().trim().max(500);

async function admin() {
  await requireRole("admin", "/admin/qc");
  return createClient();
}

export async function approveVisit(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id, excess: z.boolean(), note }),
    raw,
    async ({ taskId, excess, note }) => {
      check(await supabase.rpc("admin_qc_approve", { p_task: taskId, p_excess: excess, p_note: note || null }));
    },
    PATHS,
  );
}

export async function requestRevision(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id, items: z.array(z.string().min(1).max(60)).min(1, "Tandai minimal satu pertanyaan yang perlu direvisi.").max(100), note: note.min(1, "Tulis catatan revisi untuk shopper.") }),
    raw,
    async ({ taskId, items, note }) => {
      check(await supabase.rpc("admin_qc_revision", { p_task: taskId, p_items: items, p_note: note }));
    },
    PATHS,
  );
}

export async function rejectVisit(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id, fee: z.enum(["reimburse_only", "none"]), note: note.min(1, "Alasan wajib diisi."), reopen: z.boolean() }),
    raw,
    async ({ taskId, fee, note, reopen }) => checkData<string | null>(await supabase.rpc("admin_qc_reject", { p_task: taskId, p_fee: fee, p_note: note, p_reopen: reopen })),
    PATHS,
  );
}

// Mencatat follow up revisi dan mengembalikan nomor WhatsApp shopper.
export async function recordRevisionFollowup(raw: unknown) {
  const supabase = await admin();
  return run(z.object({ taskId: id }), raw, async ({ taskId }) => checkData<string>(await supabase.rpc("admin_record_revision_followup", { p_task: taskId })), ["/admin"]);
}
