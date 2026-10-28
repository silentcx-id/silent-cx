import type { Lang } from "./i18n";

// Pilihan formulir lamaran shopper, kuis etika, dan pakta kerahasiaan.
// Nilai pilihan harus sama dengan check constraint di migrasi 20261028000004_shopper_applications.sql.

type Label = Record<Lang, string>;
type Option<T extends string> = { value: T; label: Label };

export const GENDERS = [
  { value: "female", label: { id: "Perempuan", en: "Female" } },
  { value: "male", label: { id: "Laki-laki", en: "Male" } },
] as const satisfies readonly Option<string>[];

export const VEHICLES = [
  { value: "none", label: { id: "Tidak ada", en: "None" } },
  { value: "motorcycle", label: { id: "Motor", en: "Motorcycle" } },
  { value: "car", label: { id: "Mobil", en: "Car" } },
  { value: "both", label: { id: "Motor dan mobil", en: "Motorcycle and car" } },
] as const satisfies readonly Option<string>[];

export const EXPERIENCE = [
  { value: "none", label: { id: "Belum pernah", en: "None yet" } },
  { value: "under_1y", label: { id: "Kurang dari 1 tahun", en: "Less than 1 year" } },
  { value: "1_3y", label: { id: "1–3 tahun", en: "1–3 years" } },
  { value: "over_3y", label: { id: "Lebih dari 3 tahun", en: "More than 3 years" } },
] as const satisfies readonly Option<string>[];

export type Gender = (typeof GENDERS)[number]["value"];
export type Vehicle = (typeof VEHICLES)[number]["value"];
export type Experience = (typeof EXPERIENCE)[number]["value"];

const values = <T extends string>(list: readonly Option<T>[]) => list.map((o) => o.value) as [T, ...T[]];
export const GENDER_VALUES = values(GENDERS);
export const VEHICLE_VALUES = values(VEHICLES);
export const EXPERIENCE_VALUES = values(EXPERIENCE);

export function optionLabel(list: readonly Option<string>[], value: string | null | undefined, lang: Lang): string {
  return list.find((o) => o.value === value)?.label[lang] ?? "—";
}

// Kuis etika dan kerahasiaan. Kunci jawabannya hanya ada di database (submit_shopper_application),
// jadi urutan soal dan pilihan di sini tidak boleh diubah tanpa mengubah kunci di migrasi baru.
export const QUIZ: { question: Label; options: Label[] }[] = [
  {
    question: {
      id: "Saat kunjungan, staf outlet bertanya apakah Anda sedang menilai mereka. Apa yang Anda lakukan?",
      en: "During a visit, a staff member asks whether you are evaluating them. What do you do?",
    },
    options: [
      { id: "Mengaku sebagai shopper SilentCX supaya jujur", en: "Admit you are a SilentCX shopper to be honest" },
      { id: "Tetap bersikap sebagai pelanggan biasa dan tidak membuka identitas", en: "Stay a regular customer and do not reveal your role" },
      { id: "Membatalkan kunjungan tanpa memberi tahu siapa pun", en: "Cancel the visit without telling anyone" },
    ],
  },
  {
    question: {
      id: "Anda mendapat tugas di outlet milik kerabat atau tempat teman Anda bekerja. Apa yang Anda lakukan?",
      en: "You are assigned to an outlet owned by a relative or where a friend works. What do you do?",
    },
    options: [
      { id: "Memberi tahu admin SilentCX dan menolak tugas itu", en: "Tell the SilentCX admin and decline the assignment" },
      { id: "Tetap berkunjung karena Anda yakin bisa objektif", en: "Visit anyway because you are sure you can stay objective" },
      { id: "Memberi tahu teman itu jadwal kunjungan supaya siap", en: "Tell your friend the visit schedule so they are ready" },
    ],
  },
  {
    question: {
      id: "Foto, rekaman, dan isi kuesioner kunjungan boleh dibagikan ke mana?",
      en: "Where may visit photos, recordings, and questionnaire answers be shared?",
    },
    options: [
      { id: "Media sosial pribadi, setelah laporan terbit", en: "Your personal social media, after the report is published" },
      { id: "Teman sesama shopper, untuk belajar bersama", en: "Fellow shoppers, to learn together" },
      { id: "Tidak ke mana pun, hanya dikirim lewat aplikasi SilentCX", en: "Nowhere; only submitted through the SilentCX app" },
    ],
  },
  {
    question: {
      id: "Ada satu pertanyaan kuesioner yang tidak sempat Anda amati. Apa yang Anda isi?",
      en: "You could not observe one questionnaire item. What do you fill in?",
    },
    options: [
      { id: "Jawaban perkiraan supaya kuesioner lengkap", en: "A best guess so the questionnaire is complete" },
      { id: "Tandai tidak teramati dan jelaskan di catatan", en: "Mark it as not observed and explain in the notes" },
      { id: "Jawaban dari kunjungan Anda sebelumnya", en: "The answer from your previous visit" },
    ],
  },
  {
    question: {
      id: "Struk pembelian dari kunjungan hilang. Apa yang Anda lakukan?",
      en: "You lost the purchase receipt from a visit. What do you do?",
    },
    options: [
      { id: "Melapor apa adanya ke admin dan melampirkan bukti lain yang ada", en: "Report it honestly to the admin and attach any other proof you have" },
      { id: "Membuat struk pengganti sendiri", en: "Make a replacement receipt yourself" },
      { id: "Menulis nominal perkiraan tanpa memberi tahu admin", en: "Write an estimated amount without telling the admin" },
    ],
  },
];

// Pakta kerahasiaan versi v1 (versi yang disetujui tersimpan di lamaran).
export const PACT: { title: Label; points: Label[]; agree: Label } = {
  title: { id: "Pakta kerahasiaan shopper SilentCX", en: "SilentCX shopper confidentiality pact" },
  points: [
    { id: "Saya tidak membuka identitas sebagai shopper SilentCX kepada outlet, staf, atau siapa pun.", en: "I will not reveal that I am a SilentCX shopper to the outlet, its staff, or anyone." },
    { id: "Saya tidak membagikan nama client, jadwal, foto, rekaman, atau hasil kunjungan di luar aplikasi SilentCX.", en: "I will not share client names, schedules, photos, recordings, or visit results outside the SilentCX app." },
    { id: "Saya melaporkan apa yang benar-benar saya alami, tanpa mengarang atau menyalin jawaban.", en: "I will report only what I actually experienced, without inventing or copying answers." },
    { id: "Saya menolak tugas di outlet yang memiliki hubungan pribadi atau bisnis dengan saya.", en: "I will decline assignments at outlets I have a personal or business connection with." },
    { id: "Saya mengerti pelanggaran pakta ini bisa membuat akun saya ditangguhkan dan fee tidak dibayarkan.", en: "I understand that breaking this pact can get my account suspended and my fee withheld." },
  ],
  agree: { id: "Saya sudah membaca dan menyetujui pakta kerahasiaan ini.", en: "I have read and agree to this confidentiality pact." },
};

export type ApplicationStatus = "draft" | "submitted" | "approved" | "rejected";

export type ShopperApplication = {
  id: string;
  status: ApplicationStatus;
  domicile: string;
  reachable_cities: string[];
  birth_date: string | null;
  gender: Gender | null;
  occupation: string;
  vehicle: Vehicle | null;
  experience: Experience | null;
  experience_note: string;
  // Kode jenis usaha dari daftar yang diatur admin (business_types).
  industries: string[];
  quiz_attempts: number;
  submitted_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

export const APPLICATION_COLUMNS =
  "id, status, domicile, reachable_cities, birth_date, gender, occupation, vehicle, experience, experience_note, industries, quiz_attempts, submitted_at, decided_at, decision_note, created_at";

export const REAPPLY_DAYS = 30;

// Tanggal paling cepat boleh melamar lagi setelah ditolak.
export function reapplyDate(decidedAt: string | null): Date | null {
  return decidedAt ? new Date(new Date(decidedAt).getTime() + REAPPLY_DAYS * 24 * 60 * 60 * 1000) : null;
}

// Usia dalam tahun penuh dari tanggal lahir YYYY-MM-DD.
export function age(birthDate: string | null, now = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  let years = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) years--;
  return years;
}
