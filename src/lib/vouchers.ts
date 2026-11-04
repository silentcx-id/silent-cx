import { rupiah } from "./format";

// Potongan voucher per paket, sama dengan kolom rules di database.
export type VoucherRule = { package: string; pct?: number; amount?: number };
export type VoucherState = "active" | "scheduled" | "expired" | "claimed" | "used" | "cancelled";

// Kartu voucher publik dari voucher_card().
export type VoucherCard = {
  code: string;
  brand: string;
  logo: string;
  starts_at: string;
  ends_at: string;
  state: VoucherState;
  rules: { package: string; name: string; pct: number | null; amount: number | null; price: number | null }[];
};

export const VOUCHER_STATE_LABEL: Record<VoucherState, string> = {
  active: "Berlaku",
  scheduled: "Belum mulai",
  expired: "Berakhir",
  claimed: "Dipasang di tagihan",
  used: "Terpakai",
  cancelled: "Dibatalkan",
};

// Pratinjau kode sebelum disimpan, mengikuti voucher_code_base di database: huruf dan angka nama brand (maks. 12).
export function voucherCodePreview(brand: string): string {
  const base = brand.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "SCX";
  return `${base}-XXXX`;
}

export const ruleText = (r: { pct?: number | null; amount?: number | null }) => (r.pct ? `Hemat ${r.pct}%` : `Hemat ${rupiah(r.amount ?? 0)}`);

// Tanggal berakhir disimpan eksklusif (00.00 WIB hari berikutnya); yang ditampilkan adalah hari terakhirnya.
export const lastDay = (endsAt: string) => new Date(new Date(endsAt).getTime() - 1000);

// Potongan yang sama digabung: "Hemat 50%" untuk "Essential & Insight".
export function groupedRules(card: { rules: { name: string; pct?: number | null; amount?: number | null }[] }) {
  const groups = new Map<string, string[]>();
  for (const r of card.rules) {
    const text = ruleText(r);
    groups.set(text, [...(groups.get(text) ?? []), r.name.replace(/^SilentCX\s+/i, "")]);
  }
  return [...groups].map(([text, names]) => ({ text, names: names.join(" & ") }));
}

export type VoucherDraft = { id?: string; brand: string; logo: string; code: string; rules: VoucherRule[]; starts: string; ends: string; note: string };

// Promo launching: Essential & Insight 50%, Performance hemat Rp999.000, 5 Nov–5 Des 2026.
export const LAUNCH_DRAFT: Omit<VoucherDraft, "brand" | "logo" | "code" | "note"> = {
  rules: [
    { package: "essential", pct: 50 },
    { package: "insight", pct: 50 },
    { package: "performance", amount: 999000 },
  ],
  starts: "2026-11-05",
  ends: "2026-12-05",
};

// Tanggal (YYYY-MM-DD, WIB) untuk input tanggal.
export const wibDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
export const wibLastDay = (iso: string) => wibDay(lastDay(iso).toISOString());


// Kode voucher dari halaman /voucher/KODE, disimpan supaya otomatis terisi di Tagihan.
export const VOUCHER_COOKIE = "scx_voucher";
