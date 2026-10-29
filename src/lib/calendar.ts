// Tanggal kalender dalam WIB. Hari ditulis "YYYY-MM-DD", bulan "YYYY-MM".
const WIB = 7 * 3_600_000;

export function wibDay(value: string | Date): string {
  return new Date(new Date(value).getTime() + WIB).toISOString().slice(0, 10);
}

export function wibTime(value: string | Date): string {
  return new Date(new Date(value).getTime() + WIB).toISOString().slice(11, 16);
}

export function todayWib(): string {
  return wibDay(new Date());
}

// Awal hari (atau jam tertentu) WIB sebagai ISO UTC.
export function wibInstant(day: string, time = "00:00"): string {
  return new Date(`${day}T${time}:00+07:00`).toISOString();
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// Hari-hari yang tampil di kalender bulanan: mulai Senin, termasuk sisa hari bulan sebelum/sesudahnya.
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -weekday);
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const days: string[] = [];
  for (let d = start; d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

// Rentang ISO dari awal hari pertama sampai akhir hari terakhir di kalender bulan itu.
export function gridRange(month: string): { from: string; to: string } {
  const days = monthGrid(month);
  return { from: wibInstant(days[0]), to: wibInstant(addDays(days[days.length - 1], 1)) };
}

// Pilihan jam tiap 30 menit untuk form jadwal.
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

// Waktu saat halaman server dirender (sekali per permintaan), untuk menghitung kedaluwarsa dan batas 24 jam.
export function requestTime(): number {
  return Date.now();
}
