import type { Lang } from "./i18n";

export function rupiah(value: number | null | undefined): string {
  if (value == null) return "—";
  return `Rp${new Intl.NumberFormat("id-ID").format(value)}`;
}

const locale = (lang: Lang) => (lang === "en" ? "en-GB" : "id-ID");

// Semua tanggal ditampilkan dalam WIB.
export function dateTime(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";
}

export function date(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

// Nilai untuk <input type="datetime-local"> dalam WIB, dan sebaliknya.
export function toWibInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() + 7 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

export function fromWibInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return new Date(`${value}:00+07:00`).toISOString();
}
