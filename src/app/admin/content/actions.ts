"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { requireRole } from "@/lib/session";
import { LANDING_ICONS } from "@/lib/landing-icons";
import { SECTION_KEYS } from "@/lib/site-content";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// CMS halaman publik: draf disimpan dulu, dilihat lewat pratinjau, lalu diterbitkan.
const PATHS = ["/admin/content", "/pratinjau"];
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const text = (max: number) => z.object({ id: z.string().trim().max(max), en: z.string().trim().max(max) });
// Gambar hanya boleh dari Storage SilentCX sendiri (hasil unggahan di editor) atau gambar bawaan di /landing/.
const image = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || v.startsWith(`${SUPABASE_URL}/storage/v1/object/public/site-assets/`) || /^\/landing\/[a-z0-9-]+\.(svg|png|jpg|webp)$/.test(v), "Gambar harus diunggah lewat editor.");
// Media sosial: nama akun (@silentcx) atau alamat lengkap https://.
const social = (name: string) =>
  z
    .string()
    .trim()
    .max(200)
    .regex(/^(@?[\w.-]{1,60}|https:\/\/\S+)?$/, `${name}: isi nama akun (misalnya @silentcx) atau alamat lengkap yang diawali https://.`);
const icon = z.union([z.literal(""), z.enum(Object.keys(LANDING_ICONS) as [keyof typeof LANDING_ICONS, ...(keyof typeof LANDING_ICONS)[]])]);
const item = z.object({ title: text(160), body: text(800), meta: text(120), icon, image }).refine((x) => x.title.id.length > 0, "Setiap butir daftar wajib punya judul (Bahasa Indonesia).");

const section = z.object({
  visible: z.boolean(),
  eyebrow: text(120),
  title: text(160).refine((t) => t.id.length > 0, "Setiap bagian wajib punya judul (Bahasa Indonesia)."),
  lede: text(600),
  cta: text(60),
  cta2: text(60),
  image,
  items: z.array(item).max(20, "Maksimal 20 butir per daftar."),
});

const contentSchema = z.object({
  order: z
    .array(z.enum(SECTION_KEYS))
    .length(SECTION_KEYS.length)
    .refine((o) => new Set(o).size === SECTION_KEYS.length, "Urutan bagian tidak valid."),
  sections: z.object(Object.fromEntries(SECTION_KEYS.map((k) => [k, section])) as Record<(typeof SECTION_KEYS)[number], typeof section>),
  site: z.object({
    whatsapp: z.string().trim().regex(/^(\+?\d{8,15})?$/, "Nomor WhatsApp harus 8 sampai 15 angka, boleh diawali +."),
    email: z.union([z.literal(""), z.email("Format email tidak valid.")]),
    instagram: social("Instagram"),
    address: z.string().trim().max(300, "Alamat maksimal 300 karakter."),
    phone: z.string().trim().regex(/^(\+?[\d\s()-]{6,20})?$/, "Nomor telepon hanya boleh berisi angka, spasi, tanda +, -, dan kurung."),
    website: z
      .string()
      .trim()
      .max(200)
      .regex(/^((https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?)?$/i, "Alamat situs web tidak valid, contoh: silentcx.id"),
    tiktok: social("TikTok"),
    facebook: social("Facebook"),
    linkedin: social("LinkedIn"),
    youtube: social("YouTube"),
    x: social("X"),
    seoTitle: text(70).refine((t) => t.id.length > 0, "Judul untuk Google wajib diisi."),
    seoDescription: text(170),
    authHeadline: text(120),
  }),
});

async function saveDraft(content: z.infer<typeof contentSchema>) {
  const supabase = await createClient();
  check(await supabase.rpc("admin_save_site_draft", { p_draft: content }));
  return supabase;
}

export async function saveSiteDraft(raw: unknown) {
  await requireRole("admin", "/admin/content");
  return run(contentSchema, raw, async (content) => void (await saveDraft(content)), PATHS);
}

// Menyimpan draf terakhir lalu menerbitkannya, supaya yang terbit sama persis dengan yang terlihat di editor.
export async function publishSite(raw: unknown) {
  await requireRole("admin", "/admin/content");
  const res = await run(
    contentSchema,
    raw,
    async (content) => {
      const supabase = await saveDraft(content);
      check(await supabase.rpc("admin_publish_site"));
    },
    PATHS,
  );
  // Landing page dan panel halaman masuk/daftar ikut diperbarui.
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function discardSiteDraft() {
  await requireRole("admin", "/admin/content");
  return run(z.object({}), {}, async () => {
    const supabase = await createClient();
    check(await supabase.rpc("admin_discard_site_draft"));
  }, PATHS);
}

// Tautan unggah sekali pakai untuk gambar halaman publik; file langsung dikirim browser ke Storage.
export async function prepareSiteImage(raw: unknown) {
  await requireRole("admin", "/admin/content");
  return run(
    z.object({ type: z.string(), size: z.number().int().positive().max(2 * 1024 * 1024, "Gambar maksimal 2 MB.") }),
    raw,
    async ({ type }) => {
      const ext = IMAGE_TYPES[type];
      if (!ext) throw new Error("Gambar harus JPG, PNG, atau WEBP.");
      const path = `site/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const admin = createAdminClient();
      const { token } = checkData(await admin.storage.from("site-assets").createSignedUploadUrl(path));
      const publicUrl = admin.storage.from("site-assets").getPublicUrl(path).data.publicUrl;
      return { path, token, publicUrl };
    },
  );
}
