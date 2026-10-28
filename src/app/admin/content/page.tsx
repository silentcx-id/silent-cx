import type { Metadata } from "next";
import { ContentEditor } from "./editor";
import { dateTime } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { getAdminContent } from "@/lib/site";

export const metadata: Metadata = { title: "Konten" };

// CMS landing page dan panel halaman masuk/daftar. Teks di dalam dashboard tetap dari sistem.
export default async function ContentPage() {
  await requireRole("admin", "/admin/content");
  const { content, unpublished, publishedAt } = await getAdminContent();
  return (
    <>
      <section className="grid max-w-3xl gap-2">
        <h1 className="text-[clamp(28px,4vw,40px)] font-extrabold leading-tight">Konten halaman publik</h1>
        <p className="text-muted">
          Atur teks, gambar, urutan, dan bagian yang tampil di landing page. Perubahan disimpan sebagai draf; lihat dulu lewat pratinjau, lalu terbitkan.{" "}
          {publishedAt ? `Terakhir terbit ${dateTime(publishedAt, "id")}.` : "Belum pernah terbit; pengunjung melihat isi bawaan."}
        </p>
      </section>
      <ContentEditor initial={content} unpublished={unpublished} hasPublished={Boolean(publishedAt)} />
    </>
  );
}
