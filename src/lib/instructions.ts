// Instruksi kunjungan untuk shopper (Putaran 16).
// Template instruksi disimpan per kuesioner; admin memilihnya saat membuat tugas per outlet, lalu menyesuaikan isinya.
// Draf otomatis disusun dari isi kuesioner: alur bagian, foto wajib, dan petunjuk pertanyaan.

export type InstructionTemplate = { name: string; scenario: string; purchase: string };

type SnapshotQuestion = { prompt: string; help?: string | null; kind?: string; photo_required?: boolean };
export type QuestionnaireLike = { name?: string; photo_limit?: number; sections?: { title: string; questions?: SnapshotQuestion[] | null }[] | null };

export const INSTRUCTION_MAX = 4000;
export const PURCHASE_MAX = 500;
export const TEMPLATE_LIMIT = 12;
export const DRAFT_NAME = "Susun otomatis dari kuesioner";

// Penanda yang diganti saat template dipakai untuk outlet tertentu.
export const PLACEHOLDERS = [
  { key: "{outlet}", label: "nama outlet" },
  { key: "{kota}", label: "kota" },
  { key: "{alamat}", label: "alamat outlet" },
  { key: "{brand}", label: "nama brand" },
] as const;

export type OutletInfo = { outlet: string; city: string; address: string; brand: string };

export function fillPlaceholders(text: string, info: OutletInfo): string {
  return text
    .replaceAll("{outlet}", info.outlet || "outlet")
    .replaceAll("{kota}", info.city || "kota outlet")
    .replaceAll("{alamat}", info.address || "alamat di aplikasi")
    .replaceAll("{brand}", info.brand || "brand");
}

const tidy = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\r\n/g, "\n").trim().slice(0, max) : "");

// Template dari database (jsonb) dibaca dengan aman: yang rusak atau kosong dibuang.
export function cleanTemplates(raw: unknown): InstructionTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { name: tidy(o.name, 60), scenario: tidy(o.scenario, INSTRUCTION_MAX), purchase: tidy(o.purchase, PURCHASE_MAX) };
    })
    .filter((r) => r.name && r.scenario)
    .slice(0, TEMPLATE_LIMIT);
}

const sentence = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");

// Draf instruksi dari isi kuesioner. Petunjuk pertanyaan dibuang lebih dulu kalau teksnya terlalu panjang.
export function draftFromQuestionnaire(q: QuestionnaireLike): InstructionTemplate {
  const sections = (q.sections ?? []).filter((s) => s.title?.trim());
  const questions = sections.flatMap((s) => s.questions ?? []);
  const photos = questions.filter((x) => x.photo_required).map((x) => sentence(x.prompt) + (x.help?.trim() ? ` (${sentence(x.help)})` : ""));
  const seen = new Set<string>();
  const hints = questions
    .filter((x) => !x.photo_required && x.help?.trim())
    .map((x) => sentence(x.help!))
    .filter((h) => {
      const k = h.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const head = [
    "Datang sebagai pelanggan biasa di {outlet}, {kota}. Jangan memberi tahu staf bahwa Anda sedang menilai, dan jangan memotret wajah staf dari dekat.",
  ];
  const flow = sections.length ? ["", "Alur kunjungan:", ...sections.map((s, i) => `${i + 1}. ${sentence(s.title)}`)] : [];
  const photoBlock = [
    "",
    "Foto yang wajib diambil:",
    "- Foto check-in di depan outlet",
    "- Struk pembelian",
    ...photos.map((p) => `- ${p}`),
    ...(q.photo_limit ? [`Maksimal ${q.photo_limit} foto per kunjungan, termasuk check-in dan struk.`] : []),
  ];
  const tail = ["", "Isi kuesioner segera setelah keluar dari outlet, selagi masih ingat detailnya."];

  const build = (n: number) =>
    [...head, ...flow, ...photoBlock, ...(n > 0 ? ["", "Perhatikan selama kunjungan:", ...hints.slice(0, n).map((h) => `- ${h}`)] : []), ...tail].join("\n");
  let n = Math.min(hints.length, 10);
  let text = build(n);
  while (text.length > INSTRUCTION_MAX && n > 0) text = build(--n);
  return { name: DRAFT_NAME, scenario: text.slice(0, INSTRUCTION_MAX), purchase: "" };
}
