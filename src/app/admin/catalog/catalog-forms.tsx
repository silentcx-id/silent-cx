"use client";

import { useState } from "react";
import { addCity, createAddon, createPackage, deleteCity, prepareQrisUpload, saveAddon, savePackage, savePaymentSettings, setCityActive } from "./actions";
import { StatusText, useAction } from "@/components/use-action";
import type { Addon, City, Package, PaymentSettings } from "@/lib/catalog-types";
import { rupiah, toWibInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const input = "min-h-10 w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm";
const label = "grid gap-1 text-sm font-semibold";

type PromoItem = { promo_pct: number | null; promo_starts_at: string | null; promo_ends_at: string | null };

function usePromo(item: PromoItem) {
  const [pct, setPct] = useState(item.promo_pct?.toString() ?? "");
  const [starts, setStarts] = useState(toWibInput(item.promo_starts_at));
  const [ends, setEnds] = useState(toWibInput(item.promo_ends_at));
  return { value: { promo_pct: pct, promo_starts_at: starts, promo_ends_at: ends }, pct, setPct, starts, setStarts, ends, setEnds };
}

function PromoFields({ id, promo }: { id: string; promo: ReturnType<typeof usePromo> }) {
  return (
    <fieldset className="grid gap-3 rounded-xl border border-dashed border-line p-3 sm:grid-cols-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Promo (opsional, waktu WIB)</legend>
      <label className={label} htmlFor={`${id}-pct`}>
        Diskon %
        <input id={`${id}-pct`} className={input} inputMode="numeric" placeholder="kosong = tanpa promo" value={promo.pct} onChange={(e) => promo.setPct(e.target.value)} />
      </label>
      <label className={label} htmlFor={`${id}-start`}>
        Mulai
        <input id={`${id}-start`} type="datetime-local" className={input} value={promo.starts} onChange={(e) => promo.setStarts(e.target.value)} />
      </label>
      <label className={label} htmlFor={`${id}-end`}>
        Selesai
        <input id={`${id}-end`} type="datetime-local" className={input} value={promo.ends} onChange={(e) => promo.setEnds(e.target.value)} />
      </label>
    </fieldset>
  );
}

function Toggle({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" className="size-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function PackageForm({ pkg }: { pkg: Package }) {
  const { pending, status, act } = useAction();
  const [f, setF] = useState({
    name: pkg.name,
    tagline: pkg.tagline,
    indicators: pkg.indicators,
    features: pkg.features.join("\n"),
    visits: String(pkg.visits),
    purchase_allowance: String(pkg.purchase_allowance),
    recommended: pkg.recommended,
    active: pkg.active,
    sort_order: String(pkg.sort_order),
  });
  const [prices, setPrices] = useState(pkg.prices.map((p) => ({ outlets: String(p.outlets), price: String(p.price) })));
  const promo = usePromo(pkg);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(
          () =>
            savePackage({
              id: pkg.id,
              ...f,
              features: f.features.split("\n").map((s) => s.trim()).filter(Boolean),
              prices,
              promo: promo.value,
            }),
          "Paket disimpan.",
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Nama paket
          <input className={input} value={f.name} onChange={set("name")} required />
        </label>
        <label className={label}>
          Ringkasan indikator
          <input className={input} value={f.indicators} onChange={set("indicators")} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Tagline
          <input className={input} value={f.tagline} onChange={set("tagline")} />
        </label>
        <label className={label}>
          Kunjungan per outlet
          <input className={input} inputMode="numeric" value={f.visits} onChange={set("visits")} />
        </label>
        <label className={label}>
          Batas biaya pembelian per kunjungan (Rp)
          <input className={input} inputMode="numeric" value={f.purchase_allowance} onChange={set("purchase_allowance")} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Fitur (satu per baris)
          <textarea className={`${input} min-h-36`} value={f.features} onChange={set("features")} />
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Harga per jumlah outlet (sudah termasuk PPN)</legend>
        {prices.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Jumlah outlet"
              className={`${input} w-24`}
              inputMode="numeric"
              value={row.outlets}
              onChange={(e) => setPrices(prices.map((r, j) => (j === i ? { ...r, outlets: e.target.value } : r)))}
            />
            <span className="text-sm text-muted">outlet =</span>
            <input
              aria-label="Harga"
              className={`${input} w-40`}
              inputMode="numeric"
              value={row.price}
              onChange={(e) => setPrices(prices.map((r, j) => (j === i ? { ...r, price: e.target.value } : r)))}
            />
            <span className="text-sm text-muted tabular-nums">{rupiah(Number(row.price) || 0)}</span>
            {prices.length > 1 && (
              <button type="button" className="btn btn-sm" onClick={() => setPrices(prices.filter((_, j) => j !== i))}>
                Hapus
              </button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-sm w-fit" onClick={() => setPrices([...prices, { outlets: "", price: "" }])}>
          + Tambah baris harga
        </button>
      </fieldset>

      <PromoFields id={`pkg-${pkg.id}`} promo={promo} />

      <div className="flex flex-wrap items-center gap-4">
        <Toggle id={`active-${pkg.id}`} checked={f.active} onChange={(v) => setF({ ...f, active: v })}>
          Aktif (tampil ke client)
        </Toggle>
        <Toggle id={`rec-${pkg.id}`} checked={f.recommended} onChange={(v) => setF({ ...f, recommended: v })}>
          Tandai rekomendasi
        </Toggle>
        <label className="flex items-center gap-2 text-sm">
          Urutan
          <input className={`${input} w-20`} inputMode="numeric" value={f.sort_order} onChange={set("sort_order")} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan paket"}
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}

export function AddonForm({ addon, packageKeys }: { addon: Addon; packageKeys: { key: string; name: string }[] }) {
  const { pending, status, act } = useAction();
  const [f, setF] = useState({
    name: addon.name,
    description: addon.description,
    unit: addon.unit,
    pricing: addon.pricing,
    price: String(addon.price),
    max_qty: String(addon.max_qty),
    adds_outlets: addon.adds_outlets,
    requires_review: addon.requires_review,
    applicable_packages: addon.applicable_packages,
    active: addon.active,
    sort_order: String(addon.sort_order),
  });
  const promo = usePromo(addon);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => saveAddon({ id: addon.id, ...f, promo: promo.value }), "Add-on disimpan.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Nama
          <input className={input} value={f.name} onChange={set("name")} required />
        </label>
        <label className={label}>
          Satuan (contoh: per outlet)
          <input className={input} value={f.unit} onChange={set("unit")} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          Deskripsi
          <input className={input} value={f.description} onChange={set("description")} />
        </label>
        <label className={label}>
          Cara harga
          <select className={input} value={f.pricing} onChange={set("pricing")}>
            <option value="fixed">Harga pasti</option>
            <option value="quote">Dikonfirmasi admin</option>
          </select>
        </label>
        <label className={label}>
          {f.pricing === "fixed" ? "Harga (Rp)" : "Perkiraan mulai dari (Rp, 0 = tanpa perkiraan)"}
          <input className={input} inputMode="numeric" value={f.price} onChange={set("price")} />
        </label>
        <label className={label}>
          Jumlah maksimal per pesanan
          <input className={input} inputMode="numeric" value={f.max_qty} onChange={set("max_qty")} />
        </label>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">Berlaku untuk paket (tidak dicentang semua = semua paket)</legend>
        <div className="flex flex-wrap gap-4">
          {packageKeys.map((p) => (
            <Toggle
              key={p.key}
              id={`${addon.id}-${p.key}`}
              checked={f.applicable_packages.includes(p.key)}
              onChange={(v) => setF({ ...f, applicable_packages: v ? [...f.applicable_packages, p.key] : f.applicable_packages.filter((k) => k !== p.key) })}
            >
              {p.name}
            </Toggle>
          ))}
        </div>
      </fieldset>

      <PromoFields id={`addon-${addon.id}`} promo={promo} />

      <div className="flex flex-wrap items-center gap-4">
        <Toggle id={`a-active-${addon.id}`} checked={f.active} onChange={(v) => setF({ ...f, active: v })}>
          Aktif
        </Toggle>
        <Toggle id={`a-outlets-${addon.id}`} checked={f.adds_outlets} onChange={(v) => setF({ ...f, adds_outlets: v })}>
          Menambah jumlah outlet
        </Toggle>
        <Toggle id={`a-review-${addon.id}`} checked={f.requires_review} onChange={(v) => setF({ ...f, requires_review: v })}>
          Perlu persetujuan admin
        </Toggle>
        <label className="flex items-center gap-2 text-sm">
          Urutan
          <input className={`${input} w-20`} inputMode="numeric" value={f.sort_order} onChange={set("sort_order")} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan add-on"}
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}

export function NewItemForm({ kind }: { kind: "package" | "addon" }) {
  const { pending, status, act } = useAction();
  const [f, setF] = useState({ key: "", name: "", outlets: "1", price: "" });
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => (kind === "package" ? createPackage(f) : createAddon(f)), `${kind === "package" ? "Paket" : "Add-on"} dibuat (nonaktif). Lengkapi lalu aktifkan.`, () =>
          setF({ key: "", name: "", outlets: "1", price: "" }),
        );
      }}
    >
      <label className={label}>
        Kode (huruf kecil, contoh: promo_lebaran)
        <input className={input} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} required />
      </label>
      <label className={label}>
        Nama
        <input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </label>
      {kind === "package" && (
        <label className={label}>
          Outlet
          <input className={`${input} w-20`} inputMode="numeric" value={f.outlets} onChange={(e) => setF({ ...f, outlets: e.target.value })} />
        </label>
      )}
      <label className={label}>
        Harga (Rp)
        <input className={`${input} w-36`} inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        Tambah
      </button>
      <div className="sm:col-span-5">
        <StatusText status={status} />
      </div>
    </form>
  );
}

export function CityManager({ cities }: { cities: City[] }) {
  const { pending, status, act } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          act(() => addCity({ name }), "Kota ditambahkan.", () => setName(""));
        }}
      >
        <label className={label} htmlFor="new-city">
          Tambah kota
          <input id="new-city" className={`${input} w-64`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Jakarta" required />
        </label>
        <button className="btn btn-primary" disabled={pending}>
          Tambah
        </button>
      </form>
      <StatusText status={status} />
      {cities.length === 0 ? (
        <p className="rounded-xl border border-warn/50 bg-warn/10 p-4 text-sm">
          Belum ada kota. Selama daftar ini kosong, setiap pesanan otomatis masuk antrian review.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => (
            <li key={c.id} className={`card flex items-center justify-between gap-3 p-3 ${c.active ? "" : "opacity-60"}`}>
              <span className="font-semibold">{c.name}</span>
              <span className="flex gap-2">
                <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => setCityActive({ id: c.id, active: !c.active }))}>
                  {c.active ? "Nonaktifkan" : "Aktifkan"}
                </button>
                <button type="button" className="btn btn-sm" disabled={pending} onClick={() => act(() => deleteCity({ id: c.id }), "Kota dihapus.")}>
                  Hapus
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PaymentForm({ settings }: { settings: PaymentSettings }) {
  const { pending, status, setStatus, act } = useAction();
  const [f, setF] = useState(settings);
  const [uploading, setUploading] = useState(false);

  async function uploadQris(file: File) {
    setStatus(null);
    setUploading(true);
    try {
      const prep = await prepareQrisUpload({ type: file.type, size: file.size });
      if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Gagal menyiapkan unggahan." : prep.error);
      const { error } = await createClient().storage.from("site-assets").uploadToSignedUrl(prep.data.path, prep.data.token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const next = { ...f, qris_url: prep.data.publicUrl };
      setF(next);
      act(() => savePaymentSettings(next), "Gambar QRIS diunggah dan disimpan.");
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "Unggahan gagal." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        act(() => savePaymentSettings(f), "Pengaturan pembayaran disimpan.");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Nama bank
          <input className={input} value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} placeholder="Contoh: BCA" />
        </label>
        <label className={label}>
          Nomor rekening
          <input className={input} inputMode="numeric" value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} />
        </label>
        <label className={label}>
          Atas nama
          <input className={input} value={f.account_holder} onChange={(e) => setF({ ...f, account_holder: e.target.value })} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[200px_1fr] sm:items-start">
        <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-line bg-white">
          {f.qris_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- gambar dari Supabase Storage milik admin
            <img src={f.qris_url} alt="QRIS SilentCX" className="size-full object-contain" />
          ) : (
            <span className="p-4 text-center text-sm text-neutral-500">Belum ada QRIS</span>
          )}
        </div>
        <div className="grid gap-2">
          <label className={label} htmlFor="qris-file">
            Gambar QRIS statis (JPG, PNG, atau WEBP, maks. 2 MB)
          </label>
          <input
            id="qris-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
            disabled={uploading || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadQris(file);
              e.target.value = "";
            }}
          />
          <p className="text-sm text-muted">QRIS ini tampil di halaman tagihan client. Unduh gambar QRIS resmi dari aplikasi bank atau merchant Anda.</p>
          {f.qris_url && (
            <button type="button" className="btn btn-sm w-fit" disabled={pending} onClick={() => act(() => savePaymentSettings({ ...f, qris_url: "" }), "QRIS dihapus.", () => setF({ ...f, qris_url: "" }))}>
              Hapus QRIS
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending || uploading}>
          {uploading ? "Mengunggah…" : pending ? "Menyimpan…" : "Simpan rekening"}
        </button>
        <StatusText status={status} />
      </div>
    </form>
  );
}
