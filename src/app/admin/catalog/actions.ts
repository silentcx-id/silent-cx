"use server";

import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { fromWibInput } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/admin", "/app", "/"];

const money = z.coerce.number().int("Harga harus bilangan bulat.").min(0, "Harga tidak boleh negatif.").max(1_000_000_000);
const key = z.string().regex(/^[a-z0-9_]{2,40}$/, "Kode hanya huruf kecil, angka, dan garis bawah (2–40 karakter).");

// Promo: tanpa promo, persen (1–90), potongan nominal Rp per unit, atau gratis 1 outlet (hanya paket). Selain tanpa
// promo, tanggal mulai dan selesai wajib. Batas potongan nominal terhadap harga dicek di skema paket/add-on.
const PROMO_KINDS = ["none", "pct", "amount", "free_outlet"] as const;
const promoInput = z.object({ promo_kind: z.enum(PROMO_KINDS), promo_value: z.string(), promo_starts_at: z.string(), promo_ends_at: z.string() });
const NO_PROMO = { promo_pct: null as number | null, promo_amount: null as number | null, promo_starts_at: null as string | null, promo_ends_at: null as string | null };

function parsePromo(p: z.infer<typeof promoInput>, ctx: z.RefinementCtx) {
  const raw = p.promo_value.replace(/[.s]/g, "");
  if (p.promo_kind === "none" || (p.promo_kind !== "free_outlet" && !raw)) return { ...NO_PROMO, free: false };
  const value = Number(raw);
  const starts = fromWibInput(p.promo_starts_at);
  const ends = fromWibInput(p.promo_ends_at);
  if (p.promo_kind === "pct" && (!Number.isInteger(value) || value < 1 || value > 90)) ctx.addIssue({ code: "custom", message: "Diskon promo 1 sampai 90 persen." });
  else if (p.promo_kind === "amount" && (!Number.isInteger(value) || value < 1)) ctx.addIssue({ code: "custom", message: "Potongan promo harus bilangan bulat rupiah, minimal Rp1." });
  else if (!starts || !ends) ctx.addIssue({ code: "custom", message: "Isi tanggal mulai dan selesai promo." });
  else if (ends <= starts) ctx.addIssue({ code: "custom", message: "Tanggal selesai promo harus setelah tanggal mulai." });
  return {
    promo_pct: p.promo_kind === "pct" ? value : null,
    promo_amount: p.promo_kind === "amount" ? value : null,
    promo_starts_at: starts,
    promo_ends_at: ends,
    free: p.promo_kind === "free_outlet",
  };
}

const packagePromo = promoInput.transform((p, ctx) => {
  const { free, ...rest } = parsePromo(p, ctx);
  return { ...rest, promo_free_outlet: free };
});

const addonPromo = promoInput.transform((p, ctx) => {
  const { free, ...rest } = parsePromo(p, ctx);
  if (free) ctx.addIssue({ code: "custom", message: "Gratis 1 outlet hanya untuk paket." });
  return rest;
});

const amountBelow = (price: number, what: string) => (p: { promo: { promo_amount: number | null } }) =>
  p.promo.promo_amount == null || p.promo.promo_amount < price || { message: `Potongan promo harus lebih kecil dari ${what} (Rp${new Intl.NumberFormat("id-ID").format(price)}).` };

const packageSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Nama paket wajib diisi.").max(80),
  tagline: z.string().trim().max(200),
  indicators: z.string().trim().max(80),
  features: z.array(z.string().trim().min(1).max(200)).max(40),
  visits: z.coerce.number().int().min(1).max(20),
  purchase_allowance: money,
  // Sama dengan batasan kolom packages.consultation_minutes.
  consultation_minutes: z.coerce.number().refine((n) => [0, 30, 45, 60, 90, 120].includes(n), "Durasi konsultasi tidak valid."),
  recommended: z.boolean(),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).max(999),
  prices: z
    .array(z.object({ outlets: z.coerce.number().int().min(1, "Jumlah outlet minimal 1.").max(50), price: money }))
    .min(1, "Paket wajib punya minimal satu harga.")
    .refine((rows) => new Set(rows.map((r) => r.outlets)).size === rows.length, "Jumlah outlet di daftar harga tidak boleh dobel."),
  promo: packagePromo,
}).superRefine((p, ctx) => {
  // Gratis 1 outlet: client membayar harga untuk satu outlet lebih sedikit, jadi paket perlu beberapa pilihan jumlah outlet.
  if (p.promo.promo_free_outlet && p.prices.length < 2) ctx.addIssue({ code: "custom", message: "Gratis 1 outlet hanya untuk paket dengan beberapa pilihan jumlah outlet." });
  // Potongan nominal mengurangi setiap harga per jumlah outlet dengan jumlah yang sama.
  const res = amountBelow(Math.min(...p.prices.map((r) => r.price)), "harga termurah paket")(p);
  if (res !== true) ctx.addIssue({ code: "custom", message: res.message });
});

export async function savePackage(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    packageSchema,
    raw,
    async ({ id, prices, promo: p, ...fields }) => {
      const supabase = await createClient();
      const savePrices = async () => {
        check(await supabase.from("package_prices").upsert(prices.map((r) => ({ package_id: id, ...r }))));
        check(await supabase.from("package_prices").delete().eq("package_id", id).not("outlets", "in", `(${prices.map((r) => r.outlets).join(",")})`));
      };
      // Gratis 1 outlet dicek database terhadap daftar harga, jadi harga disimpan dulu. Selain itu promo dulu,
      // supaya potongan nominal yang dikecilkan bersamaan dengan harga tidak ditolak.
      if (p.promo_free_outlet) await savePrices();
      check(await supabase.from("packages").update({ ...fields, ...p }).eq("id", id));
      if (!p.promo_free_outlet) await savePrices();
    },
    PATHS,
  );
}

const newPackageSchema = z.object({ key, name: z.string().trim().min(1, "Nama paket wajib diisi.").max(80), outlets: z.coerce.number().int().min(1).max(50), price: money });

// Paket baru dibuat nonaktif supaya bisa dilengkapi dulu sebelum tampil ke client.
export async function createPackage(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    newPackageSchema,
    raw,
    async ({ key, name, outlets, price }) => {
      const supabase = await createClient();
      const pkg = checkData<{ id: string }>(await supabase.from("packages").insert({ key, name, active: false, sort_order: 99 }).select("id").single());
      check(await supabase.from("package_prices").insert({ package_id: pkg.id, outlets, price }));
    },
    PATHS,
  );
}

const addonSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Nama add-on wajib diisi.").max(80),
  description: z.string().trim().max(300),
  unit: z.string().trim().max(40),
  pricing: z.enum(["fixed", "quote"]),
  price: money,
  max_qty: z.coerce.number().int().min(1).max(20),
  adds_outlets: z.boolean(),
  requires_review: z.boolean(),
  applicable_packages: z.array(key).max(20),
  active: z.boolean(),
  sort_order: z.coerce.number().int().min(0).max(999),
  promo: addonPromo,
}).superRefine((a, ctx) => {
  const res = amountBelow(a.price, "harga add-on")(a);
  if (res !== true) ctx.addIssue({ code: "custom", message: res.message });
});

export async function saveAddon(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    addonSchema,
    raw,
    async ({ id, promo: p, ...fields }) => {
      const supabase = await createClient();
      check(await supabase.from("addons").update({ ...fields, ...p }).eq("id", id));
    },
    PATHS,
  );
}

// Promo global semua add-on berharga pasti. Bentrok dengan promo per add-on dan batas harga dicek database
// (admin_set_addon_promo) supaya pesannya bisa menyebut nama add-on.
export async function saveAddonPromo(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    addonPromo,
    raw,
    async (p) => {
      const supabase = await createClient();
      check(await supabase.rpc("admin_set_addon_promo", { p_pct: p.promo_pct, p_amount: p.promo_amount, p_starts: p.promo_starts_at, p_ends: p.promo_ends_at }));
    },
    PATHS,
  );
}

const newAddonSchema = z.object({ key, name: z.string().trim().min(1, "Nama add-on wajib diisi.").max(80), price: money });

export async function createAddon(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    newAddonSchema,
    raw,
    async (fields) => {
      const supabase = await createClient();
      check(await supabase.from("addons").insert({ ...fields, active: false, sort_order: 99 }));
    },
    PATHS,
  );
}

const citySchema = z.object({ name: z.string().trim().min(2, "Nama kota minimal 2 huruf.").max(80) });

export async function addCity(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    citySchema,
    raw,
    async ({ name }) => {
      const supabase = await createClient();
      check(await supabase.from("service_cities").insert({ name }));
    },
    PATHS,
  );
}

export async function setCityActive(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    z.object({ id: z.uuid(), active: z.boolean() }),
    raw,
    async ({ id, active }) => {
      const supabase = await createClient();
      check(await supabase.from("service_cities").update({ active }).eq("id", id));
    },
    PATHS,
  );
}

export async function deleteCity(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    z.object({ id: z.uuid() }),
    raw,
    async ({ id }) => {
      const supabase = await createClient();
      check(await supabase.from("service_cities").delete().eq("id", id));
    },
    PATHS,
  );
}

// Jenis usaha: kode dibuat otomatis dari nama saat ditambahkan, lalu tidak berubah lagi.
const typeLabels = z.object({
  label_id: z.string().trim().min(2, "Nama jenis usaha minimal 2 huruf.").max(60),
  label_en: z.string().trim().max(60),
});

function typeKey(label: string) {
  const base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return base.length >= 2 ? base : `jenis_${base}`;
}

export async function addBusinessType(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    typeLabels,
    raw,
    async ({ label_id, label_en }) => {
      const supabase = await createClient();
      const { data: taken } = await supabase.from("business_types").select("key");
      const keys = new Set((taken ?? []).map((r) => r.key as string));
      let next = typeKey(label_id);
      for (let i = 2; keys.has(next); i++) next = `${typeKey(label_id)}_${i}`;
      // Jenis baru ditaruh sebelum "Lainnya".
      check(await supabase.from("business_types").insert({ key: next, label_id, label_en, sort_order: 500 }));
    },
    PATHS,
  );
}

export async function saveBusinessType(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    typeLabels.extend({ key, active: z.boolean() }),
    raw,
    async ({ key: k, ...fields }) => {
      const supabase = await createClient();
      check(await supabase.from("business_types").update(fields).eq("key", k));
    },
    PATHS,
  );
}

const paymentSchema = z.object({
  bank_name: z.string().trim().max(60),
  account_number: z.string().trim().regex(/^[0-9 -]{0,30}$/, "Nomor rekening hanya angka."),
  account_holder: z.string().trim().max(120),
  qris_url: z.string().trim().max(500).refine((v) => v === "" || v.startsWith("https://"), "Alamat gambar QRIS tidak valid."),
});

export async function savePaymentSettings(raw: unknown) {
  const viewer = await requireRole("admin", "/admin/catalog");
  return run(
    paymentSchema,
    raw,
    async (value) => {
      const supabase = await createClient();
      check(await supabase.from("app_settings").upsert({ key: "payment", value, updated_by: viewer.id }));
    },
    PATHS,
  );
}

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Tautan unggah sekali pakai untuk gambar QRIS; file langsung dikirim browser ke Storage.
export async function prepareQrisUpload(raw: unknown) {
  await requireRole("admin", "/admin/catalog");
  return run(
    z.object({ type: z.string(), size: z.number().int().positive().max(2 * 1024 * 1024, "Gambar QRIS maksimal 2 MB.") }),
    raw,
    async ({ type }) => {
      const ext = IMAGE_TYPES[type];
      if (!ext) throw new Error("Gambar QRIS harus JPG, PNG, atau WEBP.");
      const path = `payment/qris-${Date.now()}.${ext}`;
      const admin = createAdminClient();
      const { token } = checkData(await admin.storage.from("site-assets").createSignedUploadUrl(path));
      const publicUrl = admin.storage.from("site-assets").getPublicUrl(path).data.publicUrl;
      return { path, token, publicUrl };
    },
  );
}
