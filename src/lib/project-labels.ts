import type { ProjectStatus } from "./orders";

// Label dan warna status proyek untuk layar admin.
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  awaiting_review: "Perlu review",
  awaiting_payment: "Menunggu pembayaran",
  verifying: "Verifikasi bukti",
  active: "Aktif",
  reporting: "Pelaporan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};

export const PROJECT_STATUS_TONE: Record<ProjectStatus, string> = {
  awaiting_review: "border-warn/50 text-warn",
  awaiting_payment: "text-muted",
  verifying: "border-accent text-mark",
  active: "border-good/50 text-good",
  reporting: "border-good/50 text-good",
  completed: "border-good/50 text-good",
  cancelled: "border-bad/50 text-bad",
  expired: "border-bad/50 text-bad",
};
