"use client";

import { useEffect, useState } from "react";
import { discardSiteDraft, prepareSiteImage, publishSite, saveSiteDraft } from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import { shrinkImage } from "@/lib/shrink-image";
import { LANDING_ICONS, type LandingIcon } from "@/lib/landing-icons";
import { SOCIALS } from "@/lib/site-links";
import {
  LEGAL_KEYS,
  LEGAL_PATH,
  legalPlaceholders,
  SAMPLE_MARK,
  SAMPLE_SITE,
  SECTION_META,
  type Item,
  type LegalDoc,
  type LegalKey,
  type Section,
  type SectionKey,
  type SiteContent,
  type SiteInfo,
  type Text,
} from "@/lib/site-content";
import { createClient } from "@/lib/supabase/client";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const blank: Text = { id: "", en: "" };
const newItem = (): Item => ({ title: blank, body: blank, meta: blank, icon: "", image: "" });
// Testimoni contoh bawaan masih dipakai kalau ada nama yang bertanda "(contoh)".
const hasSampleTestimonials = (c: SiteContent) => c.sections.testimonials.items.some((x) => x.title.id.includes(SAMPLE_MARK));
const SITE_LABEL: Record<keyof typeof SAMPLE_SITE, string> = {
  whatsapp: "WhatsApp",
  phone: "telepon",
  email: "email",
  website: "situs web",
  address: "alamat",
  ...(Object.fromEntries(SOCIALS.map((s) => [s.key, s.label])) as Record<(typeof SOCIALS)[number]["key"], string>),
};
// Isian Info situs yang masih sama dengan kontak contoh bawaan.
const sampleSiteFields = (c: SiteContent) => (Object.keys(SAMPLE_SITE) as (keyof typeof SAMPLE_SITE)[]).filter((k) => c.site[k] === SAMPLE_SITE[k]).map((k) => SITE_LABEL[k]);

// Editor CMS: semua perubahan tersimpan di layar sampai admin menekan Simpan draf, Pratinjau, atau Terbitkan.
export function ContentEditor({ initial, unpublished, hasPublished }: { initial: SiteContent; unpublished: boolean; hasPublished: boolean }) {
  const { pending, status, act } = useAction();
  const [c, setC] = useState(initial);
  const [tab, setTab] = useState<"sections" | "site" | "legal">("sections");
  const dirty = JSON.stringify(c) !== JSON.stringify(initial);

  // Mengingatkan sebelum meninggalkan halaman kalau ada perubahan yang belum disimpan.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setSection = (k: SectionKey, s: Section) => setC({ ...c, sections: { ...c.sections, [k]: s } });
  const move = (i: number, d: -1 | 1) => {
    const order = [...c.order];
    [order[i], order[i + d]] = [order[i + d], order[i]];
    setC({ ...c, order });
  };

  return (
    <div className="grid gap-6">
      <section className="card sticky top-2 z-20 grid gap-3 p-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm">
          {dirty ? (
            <span className="font-semibold text-warn">Ada perubahan yang belum disimpan.</span>
          ) : unpublished ? (
            <span className="font-semibold text-mark">Draf tersimpan, belum diterbitkan.</span>
          ) : (
            <span className="text-good">Draf sama dengan yang tampil ke pengunjung.</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={pending || !dirty} onClick={() => act(() => saveSiteDraft(c), "Draf tersimpan.")}>
            Simpan draf
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            onClick={() => act(() => saveSiteDraft(c), undefined, () => window.open("/pratinjau", "_blank", "noopener"))}
          >
            Simpan &amp; pratinjau ↗
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={pending || (!dirty && !unpublished)}
            onClick={() => {
              if (window.confirm("Terbitkan perubahan ini? Pengunjung langsung melihat versi baru.")) act(() => publishSite(c), "Konten diterbitkan.");
            }}
          >
            Terbitkan
          </button>
          {hasPublished && (unpublished || dirty) && (
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Buang semua perubahan dan kembali ke versi yang sedang tampil?")) act(() => discardSiteDraft(), "Draf dikembalikan ke versi terbit.", () => window.location.reload());
              }}
            >
              Buang draf
            </button>
          )}
        </div>
        <div className="sm:basis-full">
          <StatusText status={status} />
        </div>
      </section>

      {hasSampleTestimonials(c) && (
        <p role="note" className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">
          <strong>Testimoni masih berisi contoh fiktif.</strong> Ganti dengan testimoni asli dari client (dengan izin mereka) sebelum situs dibuka untuk umum,
          atau sembunyikan bagian Testimoni.
        </p>
      )}
      {sampleSiteFields(c).length > 0 && (
        <p role="note" className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">
          <strong>Kontak di footer masih contoh:</strong> {sampleSiteFields(c).join(", ")}. Ganti dengan kontak asli di tab Info situs, atau kosongkan supaya tidak
          ditampilkan.
        </p>
      )}

      {legalPlaceholders(c).length > 0 && (
        <p role="note" className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">
          <strong>Kebijakan Privasi dan Syarat & Ketentuan masih draf.</strong> Lengkapi isian bertanda kurung siku di tab Halaman hukum:{" "}
          {legalPlaceholders(c).join(", ")}. Mintalah peninjauan penasihat hukum sebelum situs dibuka untuk umum.
        </p>
      )}

      <nav aria-label="Bagian editor" className="flex gap-1 overflow-x-auto border-b border-line">
        {(
          [
            ["sections", "Bagian halaman"],
            ["site", "Info situs"],
            ["legal", "Halaman hukum"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition ${tab === id ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "sections" && (
        <ol className="grid gap-3">
          {c.order.map((k, i) => (
            <li key={k}>
              <SectionCard
                k={k}
                section={c.sections[k]}
                onChange={(s) => setSection(k, s)}
                onUp={i > 0 ? () => move(i, -1) : undefined}
                onDown={i < c.order.length - 1 ? () => move(i, 1) : undefined}
                position={i + 1}
              />
            </li>
          ))}
        </ol>
      )}

      {tab === "site" && <SiteForm site={c.site} onChange={(site) => setC({ ...c, site })} />}

      {tab === "legal" &&
        LEGAL_KEYS.map((k) => <LegalForm key={k} k={k} doc={c.legal[k]} onChange={(doc) => setC({ ...c, legal: { ...c.legal, [k]: doc } })} />)}
    </div>
  );
}

function SectionCard({ k, section: s, onChange, onUp, onDown, position }: { k: SectionKey; section: Section; onChange: (s: Section) => void; onUp?: () => void; onDown?: () => void; position: number }) {
  const meta = SECTION_META[k];
  const set = (field: keyof Section) => (v: Text) => onChange({ ...s, [field]: v });
  return (
    <details className={`card group ${s.visible ? "" : "opacity-70"}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
        <span className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-full border border-line font-mono text-xs">{position}</span>
          <span className="grid">
            <span className="font-extrabold">{meta.label}</span>
            <span className="text-xs text-muted">{s.title.id || "—"}</span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2" onClick={(e) => e.preventDefault()}>
          <button type="button" className="btn btn-sm" aria-label={`Naikkan ${meta.label}`} disabled={!onUp} onClick={onUp}>
            ↑
          </button>
          <button type="button" className="btn btn-sm" aria-label={`Turunkan ${meta.label}`} disabled={!onDown} onClick={onDown}>
            ↓
          </button>
          <button type="button" className={`btn btn-sm ${s.visible ? "" : "border-warn/60 text-warn"}`} onClick={() => onChange({ ...s, visible: !s.visible })}>
            {s.visible ? "Tampil" : "Disembunyikan"}
          </button>
        </span>
      </summary>
      <div className="grid gap-4 border-t border-line p-4">
        <p className="text-sm text-muted">{meta.hint}</p>
        {meta.eyebrow && <Bilingual label="Teks kecil di atas judul" value={s.eyebrow} onChange={set("eyebrow")} max={120} />}
        <Bilingual label="Judul" value={s.title} onChange={set("title")} max={160} required />
        {meta.lede && <Bilingual label="Pengantar" value={s.lede} onChange={set("lede")} max={600} long />}
        {meta.cta && <Bilingual label={meta.cta} value={s.cta} onChange={set("cta")} max={60} />}
        {meta.cta2 && <Bilingual label={meta.cta2} value={s.cta2} onChange={set("cta2")} max={60} />}
        {meta.image && <ImageField label="Gambar (opsional)" value={s.image} onChange={(image) => onChange({ ...s, image })} />}
        {meta.items && <ItemsEditor meta={meta.items} items={s.items} onChange={(items) => onChange({ ...s, items })} />}
      </div>
    </details>
  );
}

// Satu isian dalam dua bahasa. Versi Inggris yang kosong tampil sebagai versi Indonesia.
function Bilingual({ label, value, onChange, max, long, required }: { label: string; value: Text; onChange: (v: Text) => void; max: number; long?: boolean; required?: boolean }) {
  const Field = long ? "textarea" : "input";
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-semibold">
        {label}
        {required && <span className="text-bad"> *</span>}
      </legend>
      <div className="grid gap-2 md:grid-cols-2">
        {(["id", "en"] as const).map((lang) => (
          <label key={lang} className="grid gap-1 text-xs text-muted">
            {lang === "id" ? "Indonesia" : "Inggris (opsional)"}
            <Field
              className={`${input} ${long ? "min-h-20" : ""} text-fg`}
              value={value[lang]}
              maxLength={max}
              placeholder={lang === "en" ? value.id : undefined}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [lang]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ItemsEditor({ meta, items, onChange }: { meta: NonNullable<(typeof SECTION_META)[SectionKey]["items"]>; items: Item[]; onChange: (items: Item[]) => void }) {
  const update = (i: number, next: Item) => onChange(items.map((x, j) => (j === i ? next : x)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="grid gap-3">
      <span className="text-sm font-semibold">Daftar {meta.label.toLowerCase()}</span>
      <ol className="grid gap-3">
        {items.map((x, i) => (
          <li key={i} className="grid gap-3 rounded-xl border border-dashed border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                {meta.label} {i + 1}
              </span>
              <span className="flex gap-2">
                <button type="button" className="btn btn-sm" aria-label="Naikkan" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="btn btn-sm" aria-label="Turunkan" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  Hapus
                </button>
              </span>
            </div>
            {meta.icon && <IconPicker value={x.icon} onChange={(icon) => update(i, { ...x, icon })} />}
            {meta.image && <ImageField label="Gambar" value={x.image} onChange={(image) => update(i, { ...x, image })} />}
            <Bilingual label={meta.title} value={x.title} onChange={(title) => update(i, { ...x, title })} max={160} required />
            {meta.meta && <Bilingual label={meta.meta} value={x.meta} onChange={(v) => update(i, { ...x, meta: v })} max={120} />}
            <Bilingual label={meta.body} value={x.body} onChange={(body) => update(i, { ...x, body })} max={800} long />
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-sm w-fit" disabled={items.length >= 20} onClick={() => onChange([...items, newItem()])}>
        + Tambah {meta.label.toLowerCase()}
      </button>
    </div>
  );
}

// Ikon kartu dari daftar ikon landing page, dengan contoh tampilannya.
function IconPicker({ value, onChange }: { value: LandingIcon | ""; onChange: (icon: LandingIcon | "") => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      Ikon
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
          {value && (
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={LANDING_ICONS[value].d} />
            </svg>
          )}
        </span>
        <select className={`${input} max-w-xs font-normal`} value={value} onChange={(e) => onChange(e.target.value as LandingIcon | "")}>
          <option value="">Tanpa ikon</option>
          {(Object.keys(LANDING_ICONS) as LandingIcon[]).map((k) => (
            <option key={k} value={k}>
              {LANDING_ICONS[k].label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

// Unggah gambar ke Storage publik lewat tautan sekali pakai; alamatnya tersimpan di draf.
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const { status, setStatus } = useAction();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setStatus(null);
    setUploading(true);
    try {
      const shrunk = await shrinkImage(file);
      const prep = await prepareSiteImage({ type: shrunk.type, size: shrunk.size });
      if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
      const { error } = await createClient().storage.from("site-assets").uploadToSignedUrl(prep.data.path, prep.data.token, shrunk, { contentType: shrunk.type });
      if (error) throw new Error(error.message);
      onChange(prep.data.publicUrl);
      setStatus({ tone: "ok", text: "Gambar diunggah. Simpan draf supaya tersimpan." });
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Unggahan gagal." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {value && (
        <div className="h-40 w-64 overflow-hidden rounded-xl border border-line bg-raise">
          {/* eslint-disable-next-line @next/next/no-img-element -- gambar dari Supabase Storage milik admin atau gambar bawaan */}
          <img src={value} alt="Pratinjau gambar" className="size-full object-contain" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn btn-sm cursor-pointer">
          {uploading ? "Mengunggah…" : value ? "Ganti gambar" : "Unggah gambar"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {value && (
          <button type="button" className="btn btn-sm" onClick={() => onChange("")}>
            Hapus gambar
          </button>
        )}
        <span className="text-xs text-muted">JPG, PNG, atau WEBP, maksimal 2 MB.</span>
      </div>
      <StatusText status={status} />
    </div>
  );
}

function SiteForm({ site, onChange }: { site: SiteInfo; onChange: (s: SiteInfo) => void }) {
  const set = (k: Exclude<keyof SiteInfo, "seoTitle" | "seoDescription" | "authHeadline">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...site, [k]: e.target.value });
  return (
    <section className="card grid gap-5 p-5">
      <h2 className="text-lg font-extrabold">Kontak</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-sm font-semibold">
          Nomor WhatsApp bisnis
          <input className={input} inputMode="tel" value={site.whatsapp} maxLength={16} placeholder="081234567890" onChange={set("whatsapp")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Telepon kantor
          <input className={input} inputMode="tel" value={site.phone} maxLength={20} placeholder="(021) 1234 5678" onChange={set("phone")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Email bisnis
          <input className={input} type="email" value={site.email} maxLength={120} placeholder="halo@silentcx.com" onChange={set("email")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Situs web
          <input className={input} value={site.website} maxLength={200} placeholder="silentcx.com" onChange={set("website")} />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        Alamat kantor
        <textarea className={`${input} min-h-20`} value={site.address} maxLength={300} placeholder="Nama jalan, nomor, kota, kode pos" onChange={set("address")} />
      </label>
      <h2 className="text-lg font-extrabold">Media sosial</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SOCIALS.map((s) => (
          <label key={s.key} className="grid gap-1 text-sm font-semibold">
            {s.label}
            <input className={input} value={site[s.key]} maxLength={200} placeholder={s.placeholder} onChange={set(s.key)} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">
        Media sosial boleh diisi nama akun (misalnya @silentcx) atau alamat lengkap yang diawali https://. Isian yang dikosongkan tidak ditampilkan di landing page.
      </p>
      <h2 className="text-lg font-extrabold">Halaman</h2>
      <Bilingual label="Judul halaman di Google" value={site.seoTitle} onChange={(seoTitle) => onChange({ ...site, seoTitle })} max={70} required />
      <Bilingual label="Deskripsi halaman di Google" value={site.seoDescription} onChange={(seoDescription) => onChange({ ...site, seoDescription })} max={170} long />
      <Bilingual label="Judul di halaman masuk dan daftar" value={site.authHeadline} onChange={(authHeadline) => onChange({ ...site, authHeadline })} max={120} />
    </section>
  );
}

// Satu halaman hukum. Mengubah tanggal "Terakhir diperbarui" berarti versi baru: pendaftar berikutnya menyetujui versi ini.
function LegalForm({ k, doc, onChange }: { k: LegalKey; doc: LegalDoc; onChange: (d: LegalDoc) => void }) {
  return (
    <section className="card grid gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">{doc.title.id || k}</h2>
        <a href={LEGAL_PATH[k]} target="_blank" rel="noreferrer" className="text-sm font-semibold text-mark underline underline-offset-4">
          Lihat versi terbit ↗
        </a>
      </div>
      <Bilingual label="Judul" value={doc.title} onChange={(title) => onChange({ ...doc, title })} max={120} required />
      <label className="grid gap-1 text-sm font-semibold sm:max-w-xs">
        Terakhir diperbarui
        <input className={input} type="date" value={doc.updated} onChange={(e) => onChange({ ...doc, updated: e.target.value })} />
        <span className="text-xs font-normal text-muted">Ganti tanggal ini setiap kali isinya berubah. Tanggal ini dicatat sebagai versi yang disetujui pendaftar.</span>
      </label>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-semibold">
          Isi<span className="text-bad"> *</span>
        </legend>
        <p className="text-xs text-muted">Baris diawali &quot;## &quot; menjadi subjudul, baris diawali &quot;- &quot; menjadi butir daftar, dan baris kosong memisahkan paragraf.</p>
        <div className="grid gap-2 lg:grid-cols-2">
          {(["id", "en"] as const).map((lang) => (
            <label key={lang} className="grid gap-1 text-xs text-muted">
              {lang === "id" ? "Indonesia" : "Inggris (opsional)"}
              <textarea
                className={`${input} min-h-[28rem] font-mono text-fg`}
                value={doc.body[lang]}
                maxLength={40000}
                onChange={(e) => onChange({ ...doc, body: { ...doc.body, [lang]: e.target.value } })}
              />
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
