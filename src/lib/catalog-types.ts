// Tipe katalog dan perhitungan promo untuk tampilan; dipakai di server dan browser.
import { dateTime, rupiah } from "./format";
import type { Lang } from "./i18n";

export type PackagePrice = { outlets: number; price: number };

export type Package = {
  id: string;
  key: string;
  name: string;
  tagline: string;
  indicators: string;
  features: string[];
  visits: number;
  purchase_allowance: number;
  // Durasi sesi konsultasi gratis yang termasuk paket (menit); 0 = tidak termasuk.
  consultation_minutes: number;
  entitlements: string[];
  recommended: boolean;
  active: boolean;
  sort_order: number;
  promo_pct: number | null;
  promo_amount: number | null;
  // Gratis 1 outlet: bayar harga paket untuk satu outlet lebih sedikit (paket multi-outlet).
  promo_free_outlet: boolean;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
  prices: PackagePrice[];
};

export type Addon = {
  id: string;
  key: string;
  name: string;
  description: string;
  unit: string;
  pricing: "fixed" | "quote";
  price: number;
  max_qty: number;
  adds_outlets: boolean;
  requires_review: boolean;
  entitlement: string | null;
  applicable_packages: string[];
  active: boolean;
  sort_order: number;
  promo_pct: number | null;
  promo_amount: number | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
  // Hanya dipesan dari halaman laporan setelah terbit (Audit ulang).
  after_report: boolean;
  // Promo di atas berasal dari promo global add-on (diisi withAddonPromo).
  promo_global?: boolean;
};

// Promo global untuk semua add-on berharga pasti, diatur admin sekali di Katalog.
export type AddonPromo = { promo_pct: number | null; promo_amount: number | null; promo_starts_at: string | null; promo_ends_at: string | null };

export type City = { id: string; name: string; active: boolean };

// Format kode jenis usaha, sama dengan constraint di database.
export const BUSINESS_KEY = /^[a-z0-9_]{2,40}$/;

// Jenis usaha yang diatur admin di Katalog. `key` disimpan di data; nama tampil sesuai bahasa.
export type BusinessType = { key: string; label_id: string; label_en: string; sort_order: number; active: boolean };

// Nama jenis usaha sesuai bahasa. Isian lama yang bukan kode dari daftar tampil apa adanya.
export function businessTypeLabel(types: BusinessType[], key: string | null | undefined, lang: "id" | "en"): string {
  if (!key) return "—";
  const t = types.find((x) => x.key === key);
  if (!t) return key;
  return (lang === "en" && t.label_en) || t.label_id;
}

export type PaymentSettings = { bank_name: string; account_number: string; account_holder: string; qris_url: string };

// Promo persen (promo_pct), potongan nominal per unit (promo_amount), atau gratis 1 outlet (paket), salah satu saja.
export type Promo = { promo_pct: number | null; promo_amount?: number | null; promo_free_outlet?: boolean; promo_starts_at: string | null; promo_ends_at: string | null };

// Untuk tampilan saja (harga dicoret). Total pesanan selalu dihitung ulang database lewat quote_order (promo_price).
export function promoActive(item: Promo, now = new Date()) {
  return Boolean((item.promo_pct || item.promo_amount || item.promo_free_outlet) && item.promo_starts_at && item.promo_ends_at && now >= new Date(item.promo_starts_at) && now < new Date(item.promo_ends_at));
}

// Harga satuan setelah promo. Gratis 1 outlet tidak mengubah harga per jumlah outlet (lihat freeOutletSaving).
export function displayPrice(price: number, item: Promo) {
  if (!promoActive(item) || item.promo_free_outlet) return price;
  if (item.promo_pct) return Math.round((price * (100 - item.promo_pct)) / 100);
  return Math.max(price - (item.promo_amount ?? 0), 0);
}

// "Hemat 20%", "Hemat Rp300.000", atau "Gratis 1 outlet".
export function promoSaving(item: Promo, lang: Lang) {
  if (item.promo_free_outlet) return lang === "en" ? "1 outlet free" : "Gratis 1 outlet";
  const word = lang === "en" ? "Save" : "Hemat";
  return item.promo_pct ? `${word} ${item.promo_pct}%` : `${word} ${rupiah(item.promo_amount ?? 0)}`;
}

// Akhir periode promo, misalnya "Promo s.d. 15 Nov 2026 23.59 WIB".
export function promoUntil(item: Promo, lang: Lang) {
  return `${lang === "en" ? "Promo until" : "Promo s.d."} ${dateTime(item.promo_ends_at, lang)}`;
}

// Potongan gratis 1 outlet untuk pilihan jumlah outlet: selisih harga dengan pilihan satu outlet lebih sedikit.
// Sama dengan quote_order; 0 kalau promo tidak berlaku atau pilihan itu yang terkecil.
export function freeOutletSaving(pkg: Pick<Package, "prices"> & Promo, outlets: number) {
  if (!pkg.promo_free_outlet || !promoActive(pkg)) return 0;
  const now = pkg.prices.find((p) => p.outlets === outlets);
  const less = pkg.prices.find((p) => p.outlets === outlets - 1);
  return now && less ? Math.max(now.price - less.price, 0) : 0;
}

// Add-on dengan promo yang berlaku untuk client: promo add-on itu sendiri kalau sedang berlaku, kalau tidak promo
// global (hanya add-on berharga pasti). Sama dengan addon_unit_price di database.
export function withAddonPromo<T extends Pick<Addon, "pricing"> & Promo>(addons: T[], global: AddonPromo | null): (T & { promo_global?: boolean })[] {
  return addons.map((a) => {
    if (a.pricing === "quote" || promoActive(a) || !global || !promoActive(global)) return a;
    return { ...a, ...global, promo_global: true };
  });
}
