"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { check, checkData, run } from "@/lib/action";
import { fromWibInput } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const PATHS = ["/admin/articles", "/artikel"];
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const slug = (max: number, what: string) =>
  z
    .string()
    .trim()
    .min(2, `${what} wajib diisi.`)
    .max(max, `${what} maksimal ${max} karakter.`)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, `${what} hanya huruf kecil, angka, dan tanda hubung (contoh: promo-launching).`);

const articleSchema = z.object({
  id: z.uuid().optional(),
  category: slug(40, "Kategori"),
  slug: slug(100, "Alamat artikel"),
  title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(140, "Judul maksimal 140 karakter."),
  excerpt: z.string().trim().max(300, "Ringkasan maksimal 300 karakter."),
  body: z.string().max(60000, "Isi artikel terlalu panjang."),
  cover: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || v.startsWith(`${SUPABASE_URL}/storage/v1/object/public/site-assets/`), "Sampul harus diunggah lewat editor."),
  seo_title: z.string().trim().max(70, "Judul Google maksimal 70 karakter."),
  seo_description: z.string().trim().max(170, "Deskripsi Google maksimal 170 karakter."),
  cta_label: z.string().trim().max(60, "Teks tombol maksimal 60 karakter."),
  cta_message: z.string().trim().max(500, "Pesan WhatsApp maksimal 500 karakter."),
  // draft = simpan sebagai draf; publish = terbit (published_at kosong = sekarang); keep = simpan tanpa mengubah status.
  mode: z.enum(["draft", "publish", "keep"]),
  published_at: z.string().default(""),
});

export async function saveArticle(raw: unknown) {
  const viewer = await requireRole("admin", "/admin/articles");
  return run(
    articleSchema,
    raw,
    async (a) => {
      const supabase = await createClient();
      const current = a.id ? (checkData(await supabase.from("articles").select("status, published_at").eq("id", a.id).single()) as { status: "draft" | "published"; published_at: string | null }) : null;
      const when = a.published_at ? fromWibInput(a.published_at) : null;
      if (a.published_at && !when) throw new Error("Tanggal terbit tidak valid.");
      const status = a.mode === "keep" ? (current?.status ?? "draft") : a.mode === "publish" ? "published" : "draft";
      const published_at = status === "published" ? (when ?? current?.published_at ?? new Date().toISOString()) : (when ?? current?.published_at ?? null);
      const row = {
        category: a.category,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        body: a.body,
        cover: a.cover,
        seo_title: a.seo_title,
        seo_description: a.seo_description,
        cta_label: a.cta_label,
        cta_message: a.cta_message,
        status,
        published_at,
      };
      const res = a.id
        ? await supabase.from("articles").update(row).eq("id", a.id).select("id").single()
        : await supabase.from("articles").insert({ ...row, author_id: viewer.id }).select("id").single();
      if (res.error && /duplicate key|articles_category_slug_key/.test(res.error.message)) throw new Error("Alamat artikel ini sudah dipakai artikel lain di kategori yang sama.");
      const saved = checkData(res);
      revalidatePath(`/artikel/${a.category}/${a.slug}`);
      return { id: saved.id as string, status };
    },
    PATHS,
  );
}

export async function deleteArticle(raw: unknown) {
  await requireRole("admin", "/admin/articles");
  return run(z.object({ id: z.uuid() }), raw, async ({ id }) => {
    const supabase = await createClient();
    const a = checkData(await supabase.from("articles").select("status").eq("id", id).single()) as { status: string };
    if (a.status === "published") throw new Error("Kembalikan artikel ke draf dulu sebelum dihapus.");
    check(await supabase.from("articles").delete().eq("id", id));
  }, PATHS);
}

export async function addCategory(raw: unknown) {
  await requireRole("admin", "/admin/articles");
  return run(
    z.object({ name: z.string().trim().min(1, "Nama kategori wajib diisi.").max(60), slug: slug(40, "Alamat kategori"), description: z.string().trim().max(300).default("") }),
    raw,
    async (c) => {
      const supabase = await createClient();
      const res = await supabase.from("article_categories").insert({ ...c, sort_order: 100 });
      if (res.error && /duplicate key/.test(res.error.message)) throw new Error("Alamat kategori ini sudah dipakai.");
      check(res);
    },
    PATHS,
  );
}

// Tautan unggah sekali pakai untuk sampul artikel.
export async function prepareArticleImage(raw: unknown) {
  await requireRole("admin", "/admin/articles");
  return run(z.object({ type: z.string(), size: z.number().int().positive().max(2 * 1024 * 1024, "Gambar maksimal 2 MB.") }), raw, async ({ type }) => {
    const ext = IMAGE_TYPES[type];
    if (!ext) throw new Error("Gambar harus JPG, PNG, atau WEBP.");
    const path = `articles/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const admin = createAdminClient();
    const { token } = checkData(await admin.storage.from("site-assets").createSignedUploadUrl(path));
    return { path, token, publicUrl: admin.storage.from("site-assets").getPublicUrl(path).data.publicUrl };
  });
}
