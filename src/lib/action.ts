import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

// Menjalankan aksi server: validasi input dengan zod, ubah error database menjadi pesan yang bisa dibaca,
// lalu segarkan halaman yang terdampak.
export async function run<S extends z.ZodType, T>(
  schema: S,
  raw: unknown,
  fn: (input: z.infer<S>) => Promise<T>,
  revalidate: string[] = [],
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message && !issue.message.startsWith("Invalid") ? issue.message : "Data yang diisi belum lengkap atau tidak valid." };
  }
  try {
    const data = await fn(parsed.data);
    for (const path of revalidate) revalidatePath(path, "layout");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

// Pesan dari fungsi database sudah berbahasa Indonesia; error teknis lain diringkas.
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
  if (/fetch failed|network|ECONN|timeout/i.test(message)) return "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.";
  if (/duplicate key/i.test(message)) return "Data yang sama sudah ada.";
  if (/violates check constraint .*promo/i.test(message)) return "Promo wajib punya persentase, tanggal mulai, dan tanggal selesai yang benar.";
  if (/violates check constraint|invalid input/i.test(message)) return "Ada isian yang tidak valid. Periksa kembali.";
  if (/row-level security|permission denied/i.test(message)) return "Anda tidak punya akses untuk aksi ini.";
  return message;
}

// Melempar error Supabase supaya ditangkap run().
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// Seperti check(), untuk query yang wajib mengembalikan data.
export function checkData<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  if (res.data == null) throw new Error("Data tidak ditemukan.");
  return res.data;
}
