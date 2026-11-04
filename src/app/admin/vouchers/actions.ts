"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/admin/vouchers"];
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal mulai dan tanggal berakhir.");
// Tanggal mulai 00.00 WIB; tanggal berakhir termasuk harinya, jadi disimpan 00.00 WIB hari berikutnya.
const startOf = (d: string) => new Date(`${d}T00:00:00+07:00`).toISOString();
const endOf = (d: string) => new Date(new Date(`${d}T00:00:00+07:00`).getTime() + 86_400_000).toISOString();

const logo = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || v.startsWith(`${SUPABASE_URL}/storage/v1/object/public/site-assets/vouchers/`), "Logo harus diunggah lewat form voucher.");

const rule = z
  .object({ package: z.string().min(1), kind: z.enum(["pct", "amount"]), value: z.coerce.number().int("Potongan harus angka bulat.").positive("Isi potongan untuk setiap paket yang dipilih.") })
  .transform((r) => (r.kind === "pct" ? { package: r.package, pct: r.value } : { package: r.package, amount: r.value }));

const fields = {
  brand: z.string().trim().min(1, "Nama brand wajib diisi.").max(80, "Nama brand maksimal 80 karakter."),
  logo,
  rules: z.array(rule).min(1, "Pilih minimal satu paket dan isi potongannya."),
  starts: day,
  ends: day,
  note: z.string().trim().max(300, "Catatan maksimal 300 karakter.").default(""),
};

const createSchema = z.object({ ...fields, code: z.string().trim().max(30).default("") });
const updateSchema = z.object({ ...fields, id: z.uuid() });

export async function createVoucher(raw: unknown) {
  await requireRole("admin", "/admin/vouchers");
  return run(
    createSchema,
    raw,
    async (v) => {
      const supabase = await createClient();
      const row = checkData(
        await supabase.rpc("admin_create_voucher", {
          p_brand: v.brand,
          p_logo: v.logo,
          p_rules: v.rules,
          p_starts: startOf(v.starts),
          p_ends: endOf(v.ends),
          p_code: v.code || null,
          p_note: v.note,
        }),
      ) as { code: string };
      return { code: row.code };
    },
    PATHS,
  );
}

export async function updateVoucher(raw: unknown) {
  await requireRole("admin", "/admin/vouchers");
  return run(
    updateSchema,
    raw,
    async (v) => {
      const supabase = await createClient();
      check(
        await supabase.rpc("admin_update_voucher", {
          p_id: v.id,
          p_brand: v.brand,
          p_logo: v.logo,
          p_rules: v.rules,
          p_starts: startOf(v.starts),
          p_ends: endOf(v.ends),
          p_note: v.note,
        }),
      );
    },
    PATHS,
  );
}

export async function cancelVoucher(raw: unknown) {
  await requireRole("admin", "/admin/vouchers");
  return run(z.object({ id: z.uuid() }), raw, async ({ id }) => {
    const supabase = await createClient();
    check(await supabase.rpc("admin_cancel_voucher", { p_id: id }));
  }, PATHS);
}

// Tautan unggah sekali pakai untuk logo brand. PNG atau JPG, supaya logo juga tampil di gambar voucher.
export async function prepareVoucherLogo(raw: unknown) {
  await requireRole("admin", "/admin/vouchers");
  return run(z.object({ type: z.string(), size: z.number().int().positive().max(2 * 1024 * 1024, "Logo maksimal 2 MB.") }), raw, async ({ type }) => {
    const ext = LOGO_TYPES[type];
    if (!ext) throw new Error("Logo harus PNG atau JPG.");
    const path = `vouchers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const admin = createAdminClient();
    const { token } = checkData(await admin.storage.from("site-assets").createSignedUploadUrl(path));
    return { path, token, publicUrl: admin.storage.from("site-assets").getPublicUrl(path).data.publicUrl };
  });
}
