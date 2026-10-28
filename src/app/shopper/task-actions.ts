"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import type { ShopperTaskDetail } from "@/lib/field";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Tugas lapangan shopper. Database memeriksa pemilik tugas, status, jendela waktu, dan batas foto.
const PATHS = ["/shopper", "/admin", "/app"];
const BUCKET = "audit-evidence";
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const id = z.uuid();

async function shopper() {
  const viewer = await requireRole("shopper", "/shopper/assignments");
  return { viewer, supabase: await createClient() };
}

export async function respondOffer(raw: unknown) {
  const { supabase } = await shopper();
  return run(
    z.object({ taskId: id, accept: z.boolean(), reason: z.string().trim().max(500).optional() }),
    raw,
    async ({ taskId, accept, reason }) => {
      check(await supabase.rpc("shopper_respond_offer", { p_task: taskId, p_accept: accept, p_reason: reason ?? null }));
    },
    PATHS,
  );
}

// Tautan unggah sekali pakai ke folder milik shopper dan tugas ini.
export async function prepareVisitUpload(raw: unknown) {
  const { viewer, supabase } = await shopper();
  return run(
    z.object({ taskId: id, kind: z.enum(["checkin", "receipt", "evidence"]), type: z.string(), size: z.number().int().positive().max(5 * 1024 * 1024, "Foto maksimal 5 MB.") }),
    raw,
    async ({ taskId, kind, type }) => {
      const ext = IMAGE_TYPES[type];
      if (!ext) throw new Error("Foto harus berupa JPG, PNG, atau WEBP.");
      const task = checkData<ShopperTaskDetail | null>(await supabase.rpc("shopper_task", { p_task: taskId }));
      if (!task) throw new Error("Tugas tidak ditemukan.");
      if (task.status !== (kind === "checkin" ? "accepted" : "in_progress")) throw new Error("Foto tidak bisa diunggah pada tahap ini.");
      const path = `${viewer.id}/${taskId}/${kind}-${Date.now()}.${ext}`;
      const { token } = checkData(await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path));
      return { path, token };
    },
  );
}

// Memastikan file benar-benar sudah ada di folder milik shopper dan tugas ini.
async function assertUploaded(userId: string, taskId: string, path: string) {
  const folder = `${userId}/${taskId}`;
  const name = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/`) || !name || name.includes("/")) throw new Error("File foto tidak valid.");
  const files = checkData(await createAdminClient().storage.from(BUCKET).list(folder, { search: name }));
  if (!files.some((f) => f.name === name)) throw new Error("Foto belum terunggah. Coba unggah lagi.");
}

export async function checkIn(raw: unknown) {
  const { viewer, supabase } = await shopper();
  return run(
    z.object({ taskId: id, lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000), path: z.string().min(1).max(300) }),
    raw,
    async ({ taskId, lat, lng, accuracy, path }) => {
      await assertUploaded(viewer.id, taskId, path);
      check(await supabase.rpc("shopper_check_in", { p_task: taskId, p_lat: lat, p_lng: lng, p_accuracy: accuracy, p_photo: path }));
    },
    PATHS,
  );
}

const answer = z.object({
  value: z.union([z.enum(["yes", "no"]), z.number().int().min(1).max(5), z.string().max(2000), z.null()]).optional(),
  na: z.boolean().optional(),
  note: z.string().max(1000).optional(),
});

// Draft otomatis: tidak menyegarkan halaman supaya isian di layar tidak terganggu.
export async function saveVisit(raw: unknown) {
  const { supabase } = await shopper();
  return run(
    z.object({ taskId: id, answers: z.record(z.string().max(60), answer), purchase: z.number().int().min(0).max(100_000_000).nullable(), purchaseNote: z.string().max(500) }),
    raw,
    async ({ taskId, answers, purchase, purchaseNote }) => {
      check(await supabase.rpc("shopper_save_visit", { p_task: taskId, p_answers: answers, p_purchase: purchase, p_purchase_note: purchaseNote }));
    },
  );
}

export async function addVisitPhoto(raw: unknown) {
  const { viewer, supabase } = await shopper();
  return run(
    z.object({ taskId: id, kind: z.enum(["receipt", "evidence"]), questionId: z.string().max(60).nullable(), path: z.string().min(1).max(300) }),
    raw,
    async ({ taskId, kind, questionId, path }) => {
      await assertUploaded(viewer.id, taskId, path);
      check(await supabase.rpc("shopper_add_photo", { p_task: taskId, p_kind: kind, p_question: questionId, p_path: path }));
    },
    ["/shopper"],
  );
}

export async function removeVisitPhoto(raw: unknown) {
  const { supabase } = await shopper();
  return run(
    z.object({ photoId: id }),
    raw,
    async ({ photoId }) => {
      const path = checkData<string>(await supabase.rpc("shopper_remove_photo", { p_photo: photoId }));
      await createAdminClient().storage.from(BUCKET).remove([path]);
    },
    ["/shopper"],
  );
}

export async function submitVisit(raw: unknown) {
  const { supabase } = await shopper();
  return run(
    z.object({ taskId: id }),
    raw,
    async ({ taskId }) => {
      check(await supabase.rpc("shopper_submit_visit", { p_task: taskId }));
    },
    PATHS,
  );
}
