"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { deleteArticle, prepareArticleImage, saveArticle } from "./actions";
import { ArticleBody } from "@/components/article-view";
import { StatusText, useAction } from "@/components/use-action";
import { plainText } from "@/lib/article-blocks";
import { toWibInput } from "@/lib/format";
import { shrinkImage } from "@/lib/shrink-image";
import { createClient } from "@/lib/supabase/client";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";

export type EditorArticle = {
  id?: string;
  category: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover: string;
  seo_title: string;
  seo_description: string;
  cta_label: string;
  cta_message: string;
  status: "draft" | "published";
  published_at: string | null;
};

// Judul → alamat artikel: huruf kecil, angka, tanda hubung.
export const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");

const TOOLS: { label: string; title: string; wrap: [string, string]; line?: boolean }[] = [
  { label: "H2", title: "Subjudul", wrap: ["## ", ""], line: true },
  { label: "H3", title: "Sub-subjudul", wrap: ["### ", ""], line: true },
  { label: "B", title: "Tebal", wrap: ["**", "**"] },
  { label: "• Daftar", title: "Butir daftar", wrap: ["- ", ""], line: true },
  { label: "1. Langkah", title: "Langkah bernomor", wrap: ["1. ", ""], line: true },
  { label: "Tautan", title: "Tautan", wrap: ["[", "](https://)"] },
];

function Counter({ value, max }: { value: string; max: number }) {
  return <span className={`text-xs font-normal tabular-nums ${value.length > max ? "text-bad" : "text-muted"}`}>{value.length}/{max}</span>;
}

export function ArticleEditor({ article, categories, origin, hasWhatsapp }: { article: EditorArticle; categories: { slug: string; name: string }[]; origin: string; hasWhatsapp: boolean }) {
  const router = useRouter();
  const { pending, status, setStatus, act } = useAction();
  const [a, setA] = useState(article);
  const [slugTouched, setSlugTouched] = useState(Boolean(article.id));
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [when, setWhen] = useState(toWibInput(article.published_at));
  const [uploading, setUploading] = useState(false);
  // Waktu saat editor dibuka, untuk membedakan terbit dan terjadwal.
  const [now] = useState(() => Date.now());
  const body = useRef<HTMLTextAreaElement>(null);

  const set = <K extends keyof EditorArticle>(k: K, v: EditorArticle[K]) => setA((x) => ({ ...x, [k]: v }));
  const live = a.status === "published" && a.published_at && new Date(a.published_at).getTime() <= now;
  const scheduled = a.status === "published" && !live;
  const seoTitle = a.seo_title || a.title;
  const seoDesc = a.seo_description || a.excerpt || plainText(a.body);
  const path = `/artikel/${a.category}/${a.slug || "alamat-artikel"}`;

  function tool(t: (typeof TOOLS)[number]) {
    const el = body.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const lineStart = t.line ? value.lastIndexOf("\n", s - 1) + 1 : s;
    const selected = value.slice(t.line ? lineStart : s, e) || (t.line ? "" : t.title.toLowerCase());
    const next = value.slice(0, t.line ? lineStart : s) + t.wrap[0] + selected + t.wrap[1] + value.slice(e);
    set("body", next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (t.line ? lineStart : s) + t.wrap[0].length + selected.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function upload(file: File) {
    setStatus(null);
    setUploading(true);
    try {
      const shrunk = await shrinkImage(file, 1600);
      const prep = await prepareArticleImage({ type: shrunk.type, size: shrunk.size });
      if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
      const { error } = await createClient().storage.from("site-assets").uploadToSignedUrl(prep.data.path, prep.data.token, shrunk, { contentType: shrunk.type });
      if (error) throw new Error(error.message);
      set("cover", prep.data.publicUrl);
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Unggahan gagal." });
    } finally {
      setUploading(false);
    }
  }

  function save(mode: "draft" | "publish") {
    const done = mode === "publish" ? (when && new Date(`${when}:00+07:00`).getTime() > Date.now() ? "Artikel dijadwalkan terbit." : "Artikel diterbitkan.") : mode === "draft" ? "Artikel disimpan sebagai draf." : "Perubahan disimpan.";
    act(
      () => saveArticle({ ...a, id: a.id, mode, published_at: when }),
      done,
      (data) => {
        if (!data) return;
        const publishedAt = mode === "draft" ? a.published_at : when ? new Date(`${when}:00+07:00`).toISOString() : (a.published_at ?? new Date().toISOString());
        setA((x) => ({ ...x, id: data.id, status: data.status as EditorArticle["status"], published_at: data.status === "published" ? publishedAt : x.published_at }));
        if (!a.id) router.replace(`/admin/articles/${data.id}`);
      },
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)] xl:items-start">
      <div className="grid gap-5">
        <section className="card grid gap-4 p-5">
          <label className={label}>
            <span className="flex justify-between">
              Judul <Counter value={a.title} max={140} />
            </span>
            <input
              id="article-title"
              className={`${input} text-base`}
              value={a.title}
              maxLength={140}
              placeholder="Promo Launching SilentCX: Hemat 50%"
              onChange={(e) => {
                set("title", e.target.value);
                if (!slugTouched) set("slug", toSlug(e.target.value));
              }}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
            <label className={label}>
              Kategori
              <select className={input} value={a.category} onChange={(e) => set("category", e.target.value)}>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Alamat artikel
              <span className="flex min-w-0 items-center rounded-lg border border-line bg-raise text-sm">
                <span className="truncate pl-3 text-muted">/artikel/{a.category}/</span>
                <input
                  id="article-slug"
                  className="min-h-10 min-w-0 flex-1 bg-transparent py-2 pr-3 font-normal outline-none"
                  value={a.slug}
                  maxLength={100}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }}
                />
              </span>
            </label>
          </div>
          <label className={label}>
            <span className="flex justify-between">
              Ringkasan (tampil di daftar artikel) <Counter value={a.excerpt} max={300} />
            </span>
            <textarea className={`${input} min-h-20`} value={a.excerpt} maxLength={300} onChange={(e) => set("excerpt", e.target.value)} />
          </label>
          <div className="grid gap-2">
            <span className="text-sm font-semibold">Gambar sampul (opsional)</span>
            {a.cover && (
              // eslint-disable-next-line @next/next/no-img-element -- sampul dari Supabase Storage
              <img src={a.cover} alt="Sampul" className="aspect-[16/9] w-full max-w-md rounded-xl border border-line object-cover" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-sm cursor-pointer">
                {uploading ? "Mengunggah…" : a.cover ? "Ganti sampul" : "Unggah sampul"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {a.cover && (
                <button type="button" className="btn btn-sm" onClick={() => set("cover", "")}>
                  Hapus sampul
                </button>
              )}
              <span className="text-xs text-muted">Rasio 16:9, maksimal 2 MB.</span>
            </div>
          </div>
        </section>

        <section className="card grid gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Isi artikel" className="flex gap-1">
              {(["write", "preview"] as const).map((x) => (
                <button key={x} type="button" role="tab" aria-selected={tab === x} className={`rounded-lg px-3 py-1.5 text-sm ${tab === x ? "bg-raise font-semibold" : "text-muted hover:text-fg"}`} onClick={() => setTab(x)}>
                  {x === "write" ? "Tulis" : "Pratinjau"}
                </button>
              ))}
            </div>
            {tab === "write" && (
              <div className="flex flex-wrap gap-1">
                {TOOLS.map((t) => (
                  <button key={t.label} type="button" title={t.title} className="rounded-md border border-line px-2 py-1 text-xs hover:border-accent" onClick={() => tool(t)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tab === "write" ? (
            <>
              <textarea
                ref={body}
                id="article-body"
                className={`${input} min-h-[420px] font-mono leading-relaxed`}
                value={a.body}
                onChange={(e) => set("body", e.target.value)}
                placeholder={"Paragraf pembuka...\n\n## Subjudul\n- Butir daftar\n1. Langkah pertama\n**teks tebal** dan [tautan](/artikel)"}
              />
              <p className="text-xs text-muted">
                Format: <code>## </code> subjudul, <code>### </code> sub-subjudul, <code>- </code> butir, <code>1. </code> langkah, <code>**tebal**</code>, <code>[teks](https://…)</code> atau <code>[teks](/artikel/…)</code>. Baris kosong = paragraf baru.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-line bg-bg p-5">
              <h1 className="mb-4 text-3xl font-extrabold leading-tight">{a.title || "Judul artikel"}</h1>
              <ArticleBody body={a.body || "Belum ada isi."} />
            </div>
          )}
        </section>
      </div>

      <aside className="grid gap-5 xl:sticky xl:top-6">
        <section className="card grid gap-3 p-5">
          <h2 className="flex items-center justify-between text-lg font-extrabold">
            Status
            <span className={`chip ${live ? "border-good/60 text-good" : scheduled ? "border-accent text-mark" : "text-muted"}`} data-testid="article-status">
              {live ? "Terbit" : scheduled ? "Terjadwal" : "Draf"}
            </span>
          </h2>
          <label className={label}>
            Tanggal terbit (WIB)
            <input type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
            <span className="text-xs font-normal text-muted">Kosongkan untuk terbit sekarang. Tanggal di masa depan = terjadwal, artikel muncul otomatis.</span>
          </label>
          <StatusText status={status} />
          <div className="grid gap-2">
            {a.status === "published" ? (
              <>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save("publish")}>
                  {pending ? "Menyimpan…" : "Simpan perubahan"}
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => save("draft")}>
                  Kembalikan ke draf
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => save("publish")}>
                  {pending ? "Menyimpan…" : when && new Date(`${when}:00+07:00`).getTime() > now ? "Jadwalkan terbit" : "Terbitkan"}
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => save("draft")}>
                  Simpan draf
                </button>
              </>
            )}
            {a.id && (
              <a className="btn btn-sm" href={path} target="_blank" rel="noreferrer">
                {live ? "Lihat di situs ↗" : "Pratinjau di situs ↗"}
              </a>
            )}
            {a.id && a.status === "draft" && (
              <button
                type="button"
                className="btn btn-sm text-bad"
                disabled={pending}
                onClick={() => {
                  if (confirm("Hapus artikel ini? Tidak bisa dikembalikan.")) act(() => deleteArticle({ id: a.id }), "Artikel dihapus.", () => router.replace("/admin/articles"));
                }}
              >
                Hapus artikel
              </button>
            )}
          </div>
        </section>

        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">Tampilan di Google</h2>
          <div className="grid gap-0.5 rounded-xl bg-white p-4 text-left" aria-label="Pratinjau hasil pencarian Google">
            <span className="truncate text-xs text-[#4d5156]">
              {origin.replace(/^https?:\/\//, "")}
              {path}
            </span>
            <span className="line-clamp-1 text-lg text-[#1a0dab]">{seoTitle || "Judul artikel"}</span>
            <span className="line-clamp-2 text-sm text-[#4d5156]">{seoDesc || "Deskripsi artikel."}</span>
          </div>
          <label className={label}>
            <span className="flex justify-between">
              Judul untuk Google <Counter value={a.seo_title} max={70} />
            </span>
            <input className={input} value={a.seo_title} maxLength={70} placeholder={a.title} onChange={(e) => set("seo_title", e.target.value)} />
          </label>
          <label className={label}>
            <span className="flex justify-between">
              Deskripsi untuk Google <Counter value={a.seo_description} max={170} />
            </span>
            <textarea className={`${input} min-h-20`} value={a.seo_description} maxLength={170} placeholder="Kosong = memakai ringkasan" onChange={(e) => set("seo_description", e.target.value)} />
          </label>
        </section>

        <section className="card grid gap-3 p-5">
          <h2 className="text-lg font-extrabold">Tombol WhatsApp</h2>
          <p className="text-xs text-muted">
            Opsional. Tampil di akhir artikel dan membuka WhatsApp bisnis SilentCX dengan pesan yang sudah terisi.
            {!hasWhatsapp && " Nomor WhatsApp bisnis belum diisi di Konten → Kontak, jadi tombol belum tampil."}
          </p>
          <label className={label}>
            Teks tombol
            <input className={input} value={a.cta_label} maxLength={60} placeholder="Minta voucher via WhatsApp" onChange={(e) => set("cta_label", e.target.value)} />
          </label>
          <label className={label}>
            Pesan awal di WhatsApp
            <textarea className={`${input} min-h-20`} value={a.cta_message} maxLength={500} placeholder="Halo SilentCX, saya ingin…" onChange={(e) => set("cta_message", e.target.value)} />
          </label>
        </section>
      </aside>
    </div>
  );
}
