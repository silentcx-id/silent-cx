"use client";

import { useState } from "react";
import { cancelVoucher, createVoucher, prepareVoucherLogo, updateVoucher } from "./actions";
import { toast } from "@/components/toaster";
import { StatusText, useAction } from "@/components/use-action";
import { VoucherCardView } from "@/components/voucher-card";
import { rupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { LAUNCH_DRAFT, voucherCodePreview, type VoucherDraft, type VoucherRule } from "@/lib/vouchers";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";

export type PackageOption = { key: string; name: string; minPrice: number };
type Row = { on: boolean; kind: "pct" | "amount"; value: string };

const toRows = (packages: PackageOption[], rules: VoucherRule[]) =>
  Object.fromEntries(
    packages.map((p) => {
      const r = rules.find((x) => x.package === p.key);
      return [p.key, { on: Boolean(r), kind: r?.amount ? "amount" : "pct", value: String(r?.pct ?? r?.amount ?? "") } satisfies Row];
    }),
  ) as Record<string, Row>;

// Logo diubah menjadi PNG (maks. 512 px) di browser supaya latar transparan terjaga dan tampil di gambar voucher.
async function toPng(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Logo tidak bisa diproses. Coba file PNG atau JPG lain.");
  return new File([blob], "logo.png", { type: "image/png" });
}

export function VoucherForm({ packages, initial, onDone }: { packages: PackageOption[]; initial: VoucherDraft; onDone?: () => void }) {
  const editing = Boolean(initial.id);
  const { pending, status, setStatus, act } = useAction();
  const [brand, setBrand] = useState(initial.brand);
  const [logo, setLogo] = useState(initial.logo);
  const [customCode, setCustomCode] = useState(Boolean(initial.code) && !editing);
  const [code, setCode] = useState(initial.code);
  const [rows, setRows] = useState(() => toRows(packages, initial.rules));
  const [starts, setStarts] = useState(initial.starts);
  const [ends, setEnds] = useState(initial.ends);
  const [note, setNote] = useState(initial.note);
  const [uploading, setUploading] = useState(false);

  const setRow = (key: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [key]: { ...r[key], ...patch } }));
  const num = (v: string) => Number(v.replace(/[.\s]/g, ""));
  const chosen = packages.filter((p) => rows[p.key]?.on);
  const previewRules = chosen
    .map((p): { name: string; pct?: number; amount?: number } => ({ name: p.name, ...(rows[p.key].kind === "pct" ? { pct: num(rows[p.key].value) } : { amount: num(rows[p.key].value) }) }))
    .filter((r) => (r.pct ?? r.amount ?? 0) > 0);
  const previewCode = editing ? initial.code : customCode && code.trim() ? code.trim().toUpperCase() : voucherCodePreview(brand);
  const startIso = starts ? new Date(`${starts}T00:00:00+07:00`).toISOString() : new Date().toISOString();
  const endIso = ends ? new Date(new Date(`${ends}T00:00:00+07:00`).getTime() + 86_400_000).toISOString() : startIso;

  function applyLaunch() {
    setRows(toRows(packages, LAUNCH_DRAFT.rules));
    setStarts(LAUNCH_DRAFT.starts);
    setEnds(LAUNCH_DRAFT.ends);
    toast("ok", "Aturan voucher 20% dipasang.");
  }

  async function upload(file: File) {
    setStatus(null);
    setUploading(true);
    try {
      const png = await toPng(file);
      const prep = await prepareVoucherLogo({ type: png.type, size: png.size });
      if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
      const { error } = await createClient().storage.from("site-assets").uploadToSignedUrl(prep.data.path, prep.data.token, png, { contentType: png.type });
      if (error) throw new Error(error.message);
      setLogo(prep.data.publicUrl);
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Unggahan gagal." });
    } finally {
      setUploading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const rules = chosen.map((p) => ({ package: p.key, kind: rows[p.key].kind, value: num(rows[p.key].value) }));
    const payload = { brand, logo, rules, starts, ends, note };
    if (editing) act(() => updateVoucher({ ...payload, id: initial.id }), "Voucher disimpan.", () => onDone?.());
    else
      act(
        () => createVoucher({ ...payload, code: customCode ? code : "" }),
        undefined,
        (data) => {
          toast("ok", `Voucher ${data?.code} untuk ${brand} dibuat. Kirim ke brand lewat tombol di daftar voucher.`);
          setBrand("");
          setLogo("");
          setCode("");
          setNote("");
          onDone?.();
        },
      );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:items-start">
      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>
            Nama brand
            <input className={input} id={editing ? undefined : "voucher-brand"} value={brand} maxLength={80} required placeholder="Kopi Senja" onChange={(e) => setBrand(e.target.value)} />
          </label>
          <div className="grid gap-1 text-sm">
            <span className="font-semibold">Kode voucher</span>
            {editing ? (
              <span className="min-h-10 rounded-lg border border-line bg-bg px-3 py-2 font-mono">{initial.code}</span>
            ) : customCode ? (
              <input className={`${input} font-mono uppercase`} id="voucher-code" value={code} maxLength={30} placeholder="KOPISENJA2026" onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))} />
            ) : (
              <span className="min-h-10 rounded-lg border border-dashed border-line px-3 py-2 font-mono text-muted" data-testid="code-preview">
                {voucherCodePreview(brand)}
              </span>
            )}
            {!editing && (
              <button type="button" className="w-fit text-xs text-mark underline-offset-4 hover:underline" onClick={() => setCustomCode((v) => !v)}>
                {customCode ? "Pakai kode otomatis dari nama brand" : "Isi kode sendiri"}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-semibold">Logo brand</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-16 place-items-center overflow-hidden rounded-xl border border-line bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo dari Supabase Storage */}
              {logo ? <img src={logo} alt="Logo brand" className="size-[88%] object-contain" /> : <span className="text-xs text-black/50">Logo</span>}
            </span>
            <label className="btn btn-sm cursor-pointer">
              {uploading ? "Mengunggah…" : logo ? "Ganti logo" : "Unggah logo"}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" data-testid="voucher-logo" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {logo && (
              <button type="button" className="btn btn-sm" onClick={() => setLogo("")}>
                Hapus logo
              </button>
            )}
            <span className="text-xs text-muted">PNG atau JPG, maksimal 2 MB. Logo dengan latar transparan paling rapi.</span>
          </div>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-2 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-semibold">
            Potongan per paket
            <button type="button" className="btn btn-sm" onClick={applyLaunch}>
              Pakai aturan voucher 20%
            </button>
          </legend>
          {packages.map((p) => {
            const r = rows[p.key];
            const v = num(r.value);
            const after = r.kind === "pct" ? Math.round((p.minPrice * (100 - v)) / 100) : p.minPrice - v;
            return (
              <div key={p.key} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${r.on ? "border-accent/60" : "border-line"}`}>
                <label className="flex items-center gap-3 text-sm font-semibold">
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={r.on} onChange={(e) => setRow(p.key, { on: e.target.checked })} />
                  <span className="grid">
                    {p.name}
                    <span className="text-xs font-normal text-muted">
                      Mulai {rupiah(p.minPrice)}
                      {r.on && v > 0 && after > 0 && ` → ${rupiah(after)}`}
                    </span>
                  </span>
                </label>
                {r.on && (
                  <div className="flex items-center gap-2">
                    <select className={`${input} w-auto`} aria-label={`Jenis potongan ${p.name}`} value={r.kind} onChange={(e) => setRow(p.key, { kind: e.target.value as Row["kind"] })}>
                      <option value="pct">Persen</option>
                      <option value="amount">Nominal</option>
                    </select>
                    <input
                      className={`${input} w-32 tabular-nums`}
                      aria-label={`Potongan ${p.name}`}
                      inputMode="numeric"
                      value={r.value}
                      placeholder={r.kind === "pct" ? "20" : "100000"}
                      onChange={(e) => setRow(p.key, { value: e.target.value.replace(/[^\d]/g, "") })}
                    />
                    <span className="w-6 text-sm text-muted">{r.kind === "pct" ? "%" : "Rp"}</span>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Berlaku mulai
            <input type="date" className={input} id={editing ? undefined : "voucher-starts"} value={starts} required onChange={(e) => setStarts(e.target.value)} />
          </label>
          <label className={label}>
            Berlaku sampai (termasuk hari ini)
            <input type="date" className={input} id={editing ? undefined : "voucher-ends"} value={ends} min={starts} required onChange={(e) => setEnds(e.target.value)} />
          </label>
        </div>
        <label className={label}>
          Catatan internal (opsional)
          <input className={input} value={note} maxLength={300} placeholder="Misalnya: dikirim ke Rina, owner" onChange={(e) => setNote(e.target.value)} />
        </label>
        <StatusText status={status} />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={pending || uploading}>
            {pending ? "Menyimpan…" : editing ? "Simpan perubahan" : "Buat voucher"}
          </button>
          {editing && (
            <button type="button" className="btn" onClick={onDone}>
              Batal
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-2 xl:sticky xl:top-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Pratinjau</span>
        <VoucherCardView card={{ code: previewCode, brand, logo, starts_at: startIso, ends_at: endIso, rules: previewRules }} compact />
      </div>
    </form>
  );
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("ok", done);
  } catch {
    toast("error", "Tidak bisa menyalin otomatis. Salin manual dari halaman voucher.");
  }
}

// Tombol kirim voucher: salin kode, salin pesan WA lengkap, unduh gambar, buka halaman voucher.
export function VoucherShare({ code, brand, message }: { code: string; brand: string; message: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-sm" onClick={() => copy(code, `Kode ${code} disalin.`)}>
        Salin kode
      </button>
      <button type="button" className="btn btn-sm" onClick={() => copy(message, `Pesan voucher untuk ${brand} disalin. Tempel di WhatsApp.`)}>
        Salin pesan WA
      </button>
      <a className="btn btn-sm" href={`/voucher/${code}/gambar?unduh=1`} download={`voucher-${code}.png`}>
        Unduh gambar
      </a>
      <a className="btn btn-sm" href={`/voucher/${code}`} target="_blank" rel="noreferrer">
        Lihat halaman voucher ↗
      </a>
    </div>
  );
}

export function VoucherEdit({ packages, draft }: { packages: PackageOption[]; draft: VoucherDraft }) {
  const [open, setOpen] = useState(false);
  const { pending, act } = useAction();
  if (open) return <VoucherForm packages={packages} initial={draft} onDone={() => setOpen(false)} />;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Ubah
      </button>
      <button
        type="button"
        className="btn btn-sm text-bad"
        disabled={pending}
        onClick={() => {
          if (confirm(`Batalkan voucher ${draft.code}? Kode ini tidak bisa dipakai lagi.`)) act(() => cancelVoucher({ id: draft.id }), `Voucher ${draft.code} dibatalkan.`);
        }}
      >
        Batalkan voucher
      </button>
    </div>
  );
}
