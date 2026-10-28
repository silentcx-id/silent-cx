"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Draf dan penerbitan laporan. Validasi isi, foto yang boleh dipakai, dan syarat terbit ada di database.
const PATHS = ["/admin", "/app"];

const reportSchema = z.object({
  projectId: z.uuid(),
  summary: z.string().trim().max(4000),
  findings: z
    .array(
      z.object({
        title: z.string().trim().min(3, "Judul temuan minimal 3 karakter.").max(200),
        detail: z.string().trim().max(1000),
        severity: z.enum(["critical", "major", "minor"]),
        outlet: z.string().trim().max(120).nullable(),
      }),
    )
    .max(20),
  recommendations: z.array(z.object({ text: z.string().trim().min(3, "Rekomendasi minimal 3 karakter.").max(500), priority: z.enum(["now", "soon", "later"]) })).max(20),
  photoIds: z.array(z.uuid()).max(12, "Maksimal 12 foto."),
});

export async function saveReport(raw: unknown) {
  await requireRole("admin", "/admin/reports");
  return run(
    reportSchema,
    raw,
    async ({ projectId, summary, findings, recommendations, photoIds }) => {
      const supabase = await createClient();
      check(
        await supabase.rpc("admin_save_report", { p_project: projectId, p_summary: summary, p_findings: findings, p_recommendations: recommendations, p_photo_ids: photoIds }),
      );
    },
    PATHS,
  );
}

// Menerbitkan laporan; mengembalikan id tagihan tambahan kelebihan pembelian kalau ada.
export async function publishReport(raw: unknown) {
  await requireRole("admin", "/admin/reports");
  return run(
    z.object({ projectId: z.uuid() }),
    raw,
    async ({ projectId }) => {
      const supabase = await createClient();
      return checkData<string | null>(await supabase.rpc("admin_publish_report", { p_project: projectId }));
    },
    PATHS,
  );
}
