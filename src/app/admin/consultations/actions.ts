"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { wibInstant } from "@/lib/calendar";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Jadwal kosong dan sesi konsultasi. Database memeriksa tumpukan jadwal dan memberi tahu client.
const PATHS = ["/admin/consultations", "/app/consultation", "/admin"];
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pilih tanggal.");
const time = z.string().regex(/^([01]\d|2[0-3]):[03]0$/, "Pilih jam.");
const note = z.string().trim().max(500);

async function admin() {
  await requireRole("admin", "/admin/consultations");
  return createClient();
}

export async function addConsultationWindow(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ day, start: time, end: z.union([time, z.literal("24:00")]) }),
    raw,
    async ({ day, start, end }) => {
      const ends = end === "24:00" ? new Date(new Date(wibInstant(day)).getTime() + 86_400_000).toISOString() : wibInstant(day, end);
      return checkData<string>(await supabase.rpc("admin_add_consultation_window", { p_starts: wibInstant(day, start), p_ends: ends }));
    },
    PATHS,
  );
}

export async function deleteConsultationWindow(raw: unknown) {
  const supabase = await admin();
  return run(z.object({ id: z.uuid() }), raw, async ({ id }) => check(await supabase.rpc("admin_delete_consultation_window", { p_id: id })), PATHS);
}

export async function setConsultationLink(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id: z.uuid(), url: z.url({ protocol: /^https$/, message: "Link meeting harus diawali https://." }).max(500) }),
    raw,
    async ({ id, url }) => check(await supabase.rpc("admin_set_consultation_link", { p_id: id, p_url: url })),
    PATHS,
  );
}

export async function adminRescheduleConsultation(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id: z.uuid(), day, time, note: note.min(1, "Tulis alasan perubahan jadwal.") }),
    raw,
    async ({ id, day, time, note }) => check(await supabase.rpc("admin_reschedule_consultation", { p_id: id, p_starts: wibInstant(day, time), p_note: note })),
    PATHS,
  );
}

export async function cancelConsultation(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id: z.uuid(), note: note.min(1, "Tulis alasan pembatalan.") }),
    raw,
    async ({ id, note }) => check(await supabase.rpc("admin_cancel_consultation", { p_id: id, p_note: note })),
    PATHS,
  );
}

export async function completeConsultation(raw: unknown) {
  const supabase = await admin();
  return run(
    z.object({ id: z.uuid(), outcome: z.enum(["done", "no_show"]), summary: z.string().trim().max(4000), actionPlan: z.string().trim().max(4000) }),
    raw,
    async ({ id, outcome, summary, actionPlan }) =>
      check(await supabase.rpc("admin_complete_consultation", { p_id: id, p_outcome: outcome, p_summary: summary, p_action_plan: actionPlan })),
    PATHS,
  );
}
