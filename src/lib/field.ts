// Kuesioner, tugas, dan kunjungan (Fase 3). Aman dipakai di server maupun browser.
// Nilai harus sama dengan check constraint dan enum di migrasi 20261028000005_field_audits.sql.

export const QUESTION_KINDS = [
  { value: "yes_no", label: "Ya / Tidak" },
  { value: "scale", label: "Skala 1–5" },
  { value: "text", label: "Isian teks (tidak dinilai)" },
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number]["value"];
export const QUESTION_KIND_VALUES = QUESTION_KINDS.map((k) => k.value) as [QuestionKind, ...QuestionKind[]];

export type SnapshotQuestion = { id: string; prompt: string; help: string; kind: QuestionKind; photo_required: boolean };
export type SnapshotSection = { id: string; title: string; weight: number; questions: SnapshotQuestion[] };
export type QuestionnaireSnapshot = { id?: string; name?: string; photo_limit: number; sections: SnapshotSection[] };

// { "<id pertanyaan>": { value, na, note } }
export type Answer = { value?: "yes" | "no" | number | string | null; na?: boolean; note?: string };
export type Answers = Record<string, Answer>;

export type TaskStatus = "open" | "offered" | "accepted" | "in_progress" | "submitted" | "revision" | "approved" | "rejected" | "cancelled";

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Belum ada shopper",
  offered: "Ditawarkan",
  accepted: "Diterima",
  in_progress: "Sedang dikunjungi",
  submitted: "Menunggu QC",
  revision: "Revisi",
  approved: "Lolos QC",
  rejected: "Ditolak QC",
  cancelled: "Dibatalkan",
};

export const TASK_STATUS_TONE: Record<TaskStatus, string> = {
  open: "border-warn/50 text-warn",
  offered: "border-accent text-mark",
  accepted: "border-good/50 text-good",
  in_progress: "border-good/50 text-good",
  submitted: "border-accent text-mark",
  revision: "border-warn/50 text-warn",
  approved: "border-good/50 text-good",
  rejected: "border-bad/50 text-bad",
  cancelled: "text-muted",
};

export type VisitPhoto = { id: string; kind: "checkin" | "receipt" | "evidence"; question_id: string | null; path: string };

// Tugas seperti yang dilihat shopper (fungsi shopper_task). Tanpa data client selain outlet.
export type ShopperTaskDetail = {
  id: string;
  code: string;
  status: TaskStatus;
  outlet: { name: string; address: string; city: string; maps_url: string };
  window_start: string;
  window_end: string;
  hours_start: string | null;
  hours_end: string | null;
  fee: number;
  reimburse_cap: number;
  scenario: string;
  mandatory_purchase: string;
  respond_by: string | null;
  urgent: boolean;
  checkin_at: string | null;
  answers: Answers;
  purchase_amount: number | null;
  purchase_note: string;
  submitted_at: string | null;
  revision: { items: string[]; note: string | null; due: string | null; round: number } | null;
  qc: { note: string | null; fee: "full" | "reimburse_only" | "none" | null; decided_at: string | null } | null;
  questionnaire: QuestionnaireSnapshot | null;
  photos: VisitPhoto[];
};

export type ShopperTaskRow = {
  id: string;
  code: string;
  status: TaskStatus;
  city: string;
  outlet_name: string;
  address: string;
  window_start: string;
  window_end: string;
  hours_start: string | null;
  hours_end: string | null;
  fee: number;
  respond_by: string | null;
  urgent: boolean;
  submitted_at: string | null;
  revision_due: string | null;
  qc_note: string | null;
  fee_decision: "full" | "reimburse_only" | "none" | null;
  qc_decided_at: string | null;
};

// "2026-10-28" → "28 Okt 2026"; tanggal tanpa jam, jadi tidak digeser zona waktu.
export function dayLabel(value: string, lang: "id" | "en" = "id"): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function windowLabel(t: { window_start: string; window_end: string; hours_start: string | null; hours_end: string | null }, lang: "id" | "en" = "id"): string {
  const days = t.window_start === t.window_end ? dayLabel(t.window_start, lang) : `${dayLabel(t.window_start, lang)} – ${dayLabel(t.window_end, lang)}`;
  return t.hours_start && t.hours_end ? `${days}, ${t.hours_start.slice(0, 5)}–${t.hours_end.slice(0, 5)} WIB` : days;
}

// Pesan WhatsApp follow up: hanya kode, kota, batas respons, dan tautan; tanpa nama client atau outlet.
export function followupMessage(code: string, city: string, respondBy: string, link: string): string {
  return `Halo, ada tugas kunjungan SilentCX ${code} di ${city} untuk Anda. Mohon dijawab sebelum ${respondBy}: ${link}`;
}

export function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// Tanggal hari ini (WIB) ditambah n hari, format YYYY-MM-DD untuk <input type="date">.
export function wibDate(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}

// Penanda revisi untuk nominal pembelian dan struk (bukan id pertanyaan).
export const PURCHASE_ITEM = "__purchase";

export const FEE_DECISION_LABEL = { full: "Fee dan reimburse dibayar", reimburse_only: "Hanya reimburse pembelian", none: "Tidak dibayar" } as const;

// Arti tiap nilai skala 1–5, dari terendah ke tertinggi.
export const SCALE_LABEL = ["Sangat buruk", "Buruk", "Cukup", "Baik", "Sangat baik"];

export function answerLabel(q: SnapshotQuestion, a: Answer | undefined): string {
  if (!a) return "Belum dijawab";
  if (a.na) return "Tidak teramati";
  if (q.kind === "yes_no") return a.value === "yes" ? "Ya" : a.value === "no" ? "Tidak" : "Belum dijawab";
  if (q.kind === "scale") return typeof a.value === "number" ? `${a.value} dari 5 (${SCALE_LABEL[a.value - 1] ?? ""})` : "Belum dijawab";
  return typeof a.value === "string" && a.value.trim() ? a.value : "Belum dijawab";
}
