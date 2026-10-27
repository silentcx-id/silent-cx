import type { Lang } from "./i18n";

export const ROLES = ["client", "shopper", "admin"] as const;
export type Role = (typeof ROLES)[number];
export type AccountStatus = "pending" | "active" | "rejected" | "suspended";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Beranda tiap role.
export const ROLE_HOME: Record<Role, string> = {
  client: "/app",
  shopper: "/shopper",
  admin: "/admin",
};

export type IconName = "home" | "box" | "wallet" | "store" | "eye" | "report" | "chat" | "task" | "check" | "user" | "users" | "layers" | "calendar" | "settings";

type Label = Record<Lang, string>;

// Menu tiap role. `phase` = fase pembangunan yang mengisi halaman tersebut; menu yang belum dibangun
// tetap tampil supaya alurnya terlihat, dengan keterangan fasenya.
// `activeOnly` = shopper baru bisa membuka menu ini setelah lamaran disetujui.
// `entitlement` = menu client yang hanya terbuka kalau paket atau add-on yang aktif memuat fitur itu.
export type MenuItem = { slug: string; label: Label; icon: IconName; phase: number; activeOnly?: boolean; entitlement?: string };

export const ROLE_MENU: Record<Role, MenuItem[]> = {
  client: [
    { slug: "", label: { id: "Beranda", en: "Home" }, icon: "home", phase: 0 },
    { slug: "paket", label: { id: "Paket & add-on", en: "Packages & add-ons" }, icon: "box", phase: 1 },
    { slug: "billing", label: { id: "Tagihan", en: "Billing" }, icon: "wallet", phase: 1 },
    { slug: "outlets", label: { id: "Outlet & data", en: "Outlets & details" }, icon: "store", phase: 1 },
    { slug: "audits", label: { id: "Audit berjalan", en: "Audits" }, icon: "eye", phase: 3 },
    { slug: "reports", label: { id: "Laporan", en: "Reports" }, icon: "report", phase: 4 },
    { slug: "benchmark", label: { id: "Benchmark outlet", en: "Outlet benchmark" }, icon: "layers", phase: 4, entitlement: "benchmarking" },
    { slug: "competitor", label: { id: "Benchmark kompetitor", en: "Competitor benchmark" }, icon: "eye", phase: 4, entitlement: "competitor" },
    { slug: "consultation", label: { id: "Konsultasi", en: "Consultation" }, icon: "chat", phase: 5 },
  ],
  shopper: [
    { slug: "", label: { id: "Beranda", en: "Home" }, icon: "home", phase: 0 },
    { slug: "profile", label: { id: "Profil & lamaran", en: "Profile & application" }, icon: "user", phase: 2 },
    { slug: "assignments", label: { id: "Tugas", en: "Assignments" }, icon: "task", phase: 3, activeOnly: true },
    { slug: "submissions", label: { id: "Riwayat & QC", en: "History & QC" }, icon: "check", phase: 4, activeOnly: true },
    { slug: "payments", label: { id: "Pembayaran", en: "Payments" }, icon: "wallet", phase: 5, activeOnly: true },
  ],
  admin: [
    { slug: "", label: { id: "Antrian kerja", en: "Work queue" }, icon: "home", phase: 0 },
    { slug: "accounts", label: { id: "Akun", en: "Accounts" }, icon: "users", phase: 0 },
    { slug: "catalog", label: { id: "Katalog", en: "Catalog" }, icon: "box", phase: 1 },
    { slug: "projects", label: { id: "Proyek & verifikasi", en: "Projects & verification" }, icon: "layers", phase: 1 },
    { slug: "questionnaires", label: { id: "Kuesioner", en: "Questionnaires" }, icon: "check", phase: 3 },
    { slug: "qc", label: { id: "Quality control", en: "Quality control" }, icon: "eye", phase: 4 },
    { slug: "reports", label: { id: "Laporan", en: "Reports" }, icon: "report", phase: 4 },
    { slug: "payouts", label: { id: "Keuangan", en: "Finance" }, icon: "wallet", phase: 5 },
    { slug: "consultations", label: { id: "Konsultasi", en: "Consultations" }, icon: "calendar", phase: 5 },
  ],
};

export function menuItem(role: Role, slug: string): MenuItem | undefined {
  return ROLE_MENU[role].find((m) => m.slug === slug);
}

// Milestone tiap role sesuai dokumen spesifikasi, ditampilkan sebagai timeline di dashboard.
export type Milestone = { title: Label; goal: Label };

export const MILESTONES: Record<Role, Milestone[]> = {
  client: [
    { title: { id: "Akun", en: "Account" }, goal: { id: "Akun terverifikasi", en: "Verified account" } },
    { title: { id: "Pilih paket", en: "Choose package" }, goal: { id: "Paket, outlet, dan add-on dipilih", en: "Package, outlets, and add-ons chosen" } },
    { title: { id: "Pembayaran", en: "Payment" }, goal: { id: "Bukti transfer diverifikasi admin", en: "Transfer proof verified by admin" } },
    { title: { id: "Lengkapi data", en: "Complete details" }, goal: { id: "Data outlet dan perusahaan lengkap", en: "Outlet and company details complete" } },
    { title: { id: "Audit berjalan", en: "Audits running" }, goal: { id: "Semua kunjungan lolos QC", en: "All visits pass QC" } },
    { title: { id: "Laporan", en: "Report" }, goal: { id: "Laporan terbit", en: "Report published" } },
    { title: { id: "Tindak lanjut", en: "Follow-up" }, goal: { id: "Konsultasi atau audit ulang", en: "Consultation or re-audit" } },
  ],
  shopper: [
    { title: { id: "Pendaftaran", en: "Sign-up" }, goal: { id: "Lamaran terkirim", en: "Application sent" } },
    { title: { id: "Seleksi", en: "Review" }, goal: { id: "Disetujui admin", en: "Approved by admin" } },
    { title: { id: "Terima tugas", en: "Accept assignment" }, goal: { id: "Tugas diterima sebelum batas waktu", en: "Assignment accepted before the deadline" } },
    { title: { id: "Kunjungan", en: "Visit" }, goal: { id: "Kuesioner dan bukti lengkap", en: "Questionnaire and evidence complete" } },
    { title: { id: "Submit & QC", en: "Submit & QC" }, goal: { id: "Lolos QC", en: "Passes QC" } },
    { title: { id: "Pembayaran", en: "Payment" }, goal: { id: "Fee dan reimburse dibayar", en: "Fee and reimbursement paid" } },
  ],
  admin: [
    { title: { id: "Setup sistem", en: "System setup" }, goal: { id: "Katalog dan kuesioner siap", en: "Catalog and questionnaires ready" } },
    { title: { id: "Intake", en: "Intake" }, goal: { id: "Pembayaran dan pelamar diputuskan", en: "Payments and applicants decided" } },
    { title: { id: "Penjadwalan", en: "Scheduling" }, goal: { id: "Setiap outlet punya kunjungan", en: "Every outlet has a visit" } },
    { title: { id: "Quality control", en: "Quality control" }, goal: { id: "Hanya data valid yang lolos", en: "Only valid data passes" } },
    { title: { id: "Laporan", en: "Report" }, goal: { id: "Laporan terbit", en: "Report published" } },
    { title: { id: "Keuangan", en: "Finance" }, goal: { id: "Payout dan pembayaran tercatat", en: "Payouts and payments recorded" } },
  ],
};
