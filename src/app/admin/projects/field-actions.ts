"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Penjadwalan tugas lapangan. Semua aturan (status, beban kerja, outlet yang sama, jendela waktu) diperiksa database.
const PATHS = ["/admin", "/shopper", "/app"];
const id = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal jendela kunjungan.");
const time = z
  .string()
  .regex(/^(\d{2}:\d{2})?$/, "Format jam HH:MM.")
  .transform((v) => v || null);
const money = z.coerce.number().int().min(0, "Nominal tidak boleh negatif.").max(100_000_000);

async function admin() {
  await requireRole("admin", "/admin/projects");
  return createClient();
}

export async function assignQuestionnaire(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ projectId: id, questionnaireId: id }),
    raw,
    async ({ projectId, questionnaireId }) => {
      check(await supabase.rpc("admin_assign_questionnaire", { p_project: projectId, p_questionnaire: questionnaireId }));
    },
    PATHS,
  );
}

const brief = z.object({
  windowStart: date,
  windowEnd: date,
  hoursStart: time,
  hoursEnd: time,
  fee: money,
  reimburse: money,
  scenario: z.string().trim().max(2000),
  purchase: z.string().trim().max(500),
});

export async function createTask(raw: unknown) {
  const supabase = await admin();
  return run(
    brief.extend({ outletId: id }),
    raw,
    async (b) => {
      check(
        await supabase.rpc("admin_create_task", {
          p_outlet: b.outletId,
          p_window_start: b.windowStart,
          p_window_end: b.windowEnd,
          p_hours_start: b.hoursStart,
          p_hours_end: b.hoursEnd,
          p_fee: b.fee,
          p_reimburse: b.reimburse,
          p_scenario: b.scenario,
          p_purchase: b.purchase,
        }),
      );
    },
    PATHS,
  );
}

export async function updateTask(raw: unknown) {
  const supabase = await admin();
  return run(
    brief.extend({ taskId: id }),
    raw,
    async (b) => {
      check(
        await supabase.rpc("admin_update_task", {
          p_task: b.taskId,
          p_window_start: b.windowStart,
          p_window_end: b.windowEnd,
          p_hours_start: b.hoursStart,
          p_hours_end: b.hoursEnd,
          p_fee: b.fee,
          p_reimburse: b.reimburse,
          p_scenario: b.scenario,
          p_purchase: b.purchase,
        }),
      );
    },
    PATHS,
  );
}

export async function offerTask(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id, shopperId: z.uuid("Pilih shopper."), hours: z.coerce.number().int().min(1, "Batas respons 1 sampai 168 jam.").max(168, "Batas respons 1 sampai 168 jam."), urgent: z.boolean() }),
    raw,
    async ({ taskId, shopperId, hours, urgent }) => {
      check(await supabase.rpc("admin_offer_task", { p_task: taskId, p_shopper: shopperId, p_hours: hours, p_urgent: urgent }));
    },
    PATHS,
  );
}

export async function withdrawOffer(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id }),
    raw,
    async ({ taskId }) => {
      check(await supabase.rpc("admin_withdraw_offer", { p_task: taskId }));
    },
    PATHS,
  );
}

// Mencatat follow up dan mengembalikan nomor WhatsApp shopper untuk membuka chat.
export async function recordFollowup(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id }),
    raw,
    async ({ taskId }) => checkData<string>(await supabase.rpc("admin_record_followup", { p_task: taskId })),
    ["/admin"],
  );
}

export async function cancelTask(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id, note: z.string().trim().min(1, "Alasan wajib diisi.").max(500) }),
    raw,
    async ({ taskId, note }) => {
      check(await supabase.rpc("admin_cancel_task", { p_task: taskId, p_note: note }));
    },
    PATHS,
  );
}

export async function checkLocation(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ taskId: id, match: z.boolean(), note: z.string().trim().max(500).optional() }),
    raw,
    async ({ taskId, match, note }) => {
      check(await supabase.rpc("admin_check_location", { p_task: taskId, p_match: match, p_note: note ?? null }));
    },
    ["/admin"],
  );
}

// Tautan sementara (10 menit) untuk melihat foto kunjungan yang tersimpan privat.
export async function visitPhotoLink(raw: unknown) {
  const supabase = await admin();
  return run(z.object({ photoId: id }), raw, async ({ photoId }) => {
    const photo = checkData<{ path: string }>(await supabase.from("visit_photos").select("path").eq("id", photoId).maybeSingle());
    const { signedUrl } = checkData(await createAdminClient().storage.from("audit-evidence").createSignedUrl(photo.path, 600));
    return signedUrl;
  });
}
