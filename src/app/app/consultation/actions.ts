"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Booking, geser jadwal, dan beli sesi tambahan. Aturan jam dan jatah diperiksa di database.
const PATHS = ["/app/consultation", "/admin/consultations"];
const startsAt = z.iso.datetime({ offset: true, message: "Pilih jam sesi." });

export async function bookConsultation(raw: unknown) {
  await requireRole("client", "/app/consultation");
  return run(
    z.object({ id: z.uuid(), startsAt, topic: z.string().trim().max(1000, "Topik maksimal 1000 karakter.") }),
    raw,
    async ({ id, startsAt, topic }) => {
      const supabase = await createClient();
      check(await supabase.rpc("client_book_consultation", { p_id: id, p_starts: startsAt, p_topic: topic }));
    },
    PATHS,
  );
}

export async function rescheduleConsultation(raw: unknown) {
  await requireRole("client", "/app/consultation");
  return run(
    z.object({ id: z.uuid(), startsAt }),
    raw,
    async ({ id, startsAt }) => {
      const supabase = await createClient();
      check(await supabase.rpc("client_reschedule_consultation", { p_id: id, p_starts: startsAt }));
    },
    PATHS,
  );
}

export async function buyConsultation(raw: unknown) {
  await requireRole("client", "/app/consultation");
  return run(
    z.object({ projectId: z.uuid(), qty: z.number().int().min(1).max(20) }),
    raw,
    async ({ projectId, qty }) => {
      const supabase = await createClient();
      return checkData<string>(await supabase.rpc("client_buy_consultation", { p_project: projectId, p_qty: qty }));
    },
    [...PATHS, "/app/billing"],
  );
}
