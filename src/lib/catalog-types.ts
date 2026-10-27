// Tipe katalog dan perhitungan promo untuk tampilan; dipakai di server dan browser.

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
  entitlements: string[];
  recommended: boolean;
  active: boolean;
  sort_order: number;
  promo_pct: number | null;
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
  promo_starts_at: string | null;
  promo_ends_at: string | null;
};

export type City = { id: string; name: string; active: boolean };

export type PaymentSettings = { bank_name: string; account_number: string; account_holder: string; qris_url: string };

// Untuk tampilan saja (harga dicoret). Total pesanan selalu dihitung ulang database lewat quote_order.
export function promoActive(item: { promo_pct: number | null; promo_starts_at: string | null; promo_ends_at: string | null }, now = new Date()) {
  return Boolean(item.promo_pct && item.promo_starts_at && item.promo_ends_at && now >= new Date(item.promo_starts_at) && now < new Date(item.promo_ends_at));
}

export function displayPrice(price: number, item: { promo_pct: number | null; promo_starts_at: string | null; promo_ends_at: string | null }) {
  return promoActive(item) ? Math.round((price * (100 - (item.promo_pct ?? 0))) / 100) : price;
}
