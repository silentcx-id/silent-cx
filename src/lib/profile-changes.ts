// Riwayat perubahan data akun (tabel profile_changes) dan pilihan hari/jam berkunjung shopper.
// Nama kolom harus sama dengan trigger di migrasi 20261104000022_questionnaire_review_profile_edit.sql.
import type { Lang } from "./i18n";
import { GENDERS, optionLabel, VEHICLES } from "./shopper-application";

export const DAYS = [
  { value: "mon", label: { id: "Senin", en: "Monday" } },
  { value: "tue", label: { id: "Selasa", en: "Tuesday" } },
  { value: "wed", label: { id: "Rabu", en: "Wednesday" } },
  { value: "thu", label: { id: "Kamis", en: "Thursday" } },
  { value: "fri", label: { id: "Jumat", en: "Friday" } },
  { value: "sat", label: { id: "Sabtu", en: "Saturday" } },
  { value: "sun", label: { id: "Minggu", en: "Sunday" } },
] as const;

export const TIMES = [
  { value: "morning", label: { id: "Pagi (08.00–12.00)", en: "Morning (08:00–12:00)" } },
  { value: "afternoon", label: { id: "Siang–sore (12.00–17.00)", en: "Afternoon (12:00–17:00)" } },
  { value: "evening", label: { id: "Malam (17.00–21.00)", en: "Evening (17:00–21:00)" } },
] as const;

export type ProfileChange = { id: number; field: string; old_value: string; new_value: string; changed_by: string | null; changed_at: string };

const FIELD_LABEL: Record<string, string> = {
  full_name: "Nama",
  phone: "Nomor HP/WA",
  email: "Email",
  domicile: "Kota domisili",
  reachable_cities: "Kota yang bisa dijangkau",
  birth_date: "Tanggal lahir",
  gender: "Jenis kelamin",
  occupation: "Pekerjaan",
  vehicle: "Kendaraan",
  industries: "Jenis bisnis diminati",
  available_days: "Hari bisa berkunjung",
  available_times: "Jam bisa berkunjung",
  bank_name: "Bank",
  account_number: "Nomor rekening",
  account_holder: "Nama pemilik rekening",
  company_name: "Nama usaha",
  company_industry: "Jenis usaha",
  company_city: "Kota usaha",
  company_address: "Alamat usaha",
};

export const changeFieldLabel = (field: string) => FIELD_LABEL[field] ?? field;

// Nilai tersimpan ditampilkan dengan label yang dibaca manusia (kode jenis kelamin, hari, dan seterusnya).
export function changeValue(field: string, value: string, lang: Lang, industryLabel: (key: string) => string = (k) => k): string {
  if (!value) return "—";
  const list = (labels: readonly { value: string; label: Record<Lang, string> }[]) =>
    value
      .split(", ")
      .map((v) => labels.find((o) => o.value === v)?.label[lang] ?? v)
      .join(", ");
  if (field === "gender") return optionLabel(GENDERS, value, lang);
  if (field === "vehicle") return optionLabel(VEHICLES, value, lang);
  if (field === "available_days") return list(DAYS);
  if (field === "available_times") return list(TIMES);
  if (field === "industries" || field === "company_industry") return value.split(", ").map(industryLabel).join(", ");
  return value;
}

// Nama untuk dibandingkan: huruf kecil, tanpa gelar dan tanda baca.
const TITLES = new Set(["ir", "dr", "drs", "dra", "h", "hj", "se", "sh", "st", "skom", "spd", "mm", "mba", "ssi", "amd", "bapak", "ibu", "bpk"]);
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));
}

// Nama pemilik rekening dianggap sesuai kalau semua kata di salah satu nama ada di nama lainnya
// (bank sering memotong nama panjang). Kosong tidak ditandai.
export function holderMismatch(accountName: string, holder: string): boolean {
  const a = nameWords(accountName);
  const b = nameWords(holder);
  if (!a.length || !b.length) return false;
  const inA = new Set(a);
  const inB = new Set(b);
  return !(b.every((w) => inA.has(w)) || a.every((w) => inB.has(w)));
}
