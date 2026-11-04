"use server";

import { z } from "zod";
import { checkData, check, run } from "@/lib/action";
import { CHANNELS, OUTCOMES } from "@/lib/followups";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Follow-up client dipakai CS (menu Client) dan admin (tombol Konfirmasi WA di proyek). Hak akses dijaga database.
const PATHS = ["/cs", "/admin/projects", "/admin/accounts"];
const nextDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Tanggal tidak valid.")
  .transform((v) => v || null);

async function staff() {
  const viewer = await getViewer();
  if (!viewer || (viewer.role !== "admin" && viewer.role !== "cs") || viewer.status !== "active") throw new Error("Hanya admin dan CS yang bisa mencatat follow-up.");
  return createClient();
}

export async function logFollowup(raw: unknown) {
  return run(
    z.object({
      clientId: z.uuid(),
      projectId: z.uuid().nullable().default(null),
      channel: z.enum(CHANNELS as [string, ...string[]]).default("wa"),
      purpose: z.enum(["followup", "project_confirm"]).default("followup"),
      outcome: z.enum(OUTCOMES as [string, ...string[]]).default("sent"),
      note: z.string().trim().max(1000, "Catatan maksimal 1000 karakter.").default(""),
      message: z.string().trim().max(4000, "Pesan maksimal 4000 karakter.").default(""),
      next: nextDate.default(""),
    }),
    raw,
    async (f) => {
      const supabase = await staff();
      return checkData<string>(
        await supabase.rpc("log_client_followup", {
          p_client: f.clientId,
          p_project: f.projectId,
          p_channel: f.channel,
          p_purpose: f.purpose,
          p_outcome: f.outcome,
          p_note: f.note,
          p_message: f.message,
          p_next: f.next || null,
        }),
      );
    },
    PATHS,
  );
}

export async function updateFollowup(raw: unknown) {
  return run(
    z.object({
      id: z.uuid(),
      outcome: z.enum(OUTCOMES as [string, ...string[]]),
      note: z.string().trim().max(1000, "Catatan maksimal 1000 karakter.").default(""),
      next: nextDate.default(""),
    }),
    raw,
    async (f) => {
      const supabase = await staff();
      check(await supabase.rpc("update_client_followup", { p_id: f.id, p_outcome: f.outcome, p_note: f.note, p_next: f.next || null }));
    },
    PATHS,
  );
}
