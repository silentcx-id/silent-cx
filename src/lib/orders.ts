import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type ProjectStatus = "awaiting_review" | "awaiting_payment" | "verifying" | "active" | "reporting" | "completed" | "cancelled" | "expired";
export type InvoiceStatus = "draft" | "unpaid" | "verifying" | "paid" | "expired" | "cancelled";

export type InvoiceLine = {
  id: string;
  position: number;
  kind: "package" | "addon";
  item_key: string;
  label: string;
  quantity: number;
  unit_price: number | null;
  amount: number | null;
  list_price: number | null;
};

export type PaymentProof = {
  id: string;
  method: "transfer" | "qris";
  file_path: string;
  payer_name: string;
  amount: number;
  status: "pending" | "accepted" | "rejected";
  review_note: string | null;
  uploaded_at: string;
};

export type Invoice = {
  id: string;
  code: string;
  status: InvoiceStatus;
  total: number;
  due_at: string | null;
  paid_at: string | null;
  status_note: string | null;
  created_at: string;
  // order = pesanan paket; excess = tagihan tambahan kelebihan pembelian (Fase 4); consultation = sesi konsultasi tambahan.
  kind: "order" | "excess" | "consultation";
  invoice_lines: InvoiceLine[];
  payment_proofs: PaymentProof[];
};

export type ProjectOutlet = { id: string; position: number; city: string; name: string; address: string; maps_url: string; notes: string; is_competitor: boolean; paired_outlet_id: string | null };

export type Project = {
  id: string;
  code: string;
  client_id: string;
  status: ProjectStatus;
  package_snapshot: { key: string; name: string; outlets: number; visits: number; purchase_allowance: number };
  addons_snapshot: { item_key: string; label: string; quantity: number }[];
  outlet_count: number;
  entitlements: string[];
  review_reasons: ("quote" | "city" | "addon")[];
  status_note: string | null;
  objectives: string;
  details_completed_at: string | null;
  activated_at: string | null;
  created_at: string;
  invoices: Invoice[];
  project_outlets: ProjectOutlet[];
};

export const OPEN_STATUSES: ProjectStatus[] = ["awaiting_review", "awaiting_payment", "verifying"];
export const LIVE_STATUSES: ProjectStatus[] = ["active", "reporting", "completed"];

const PROJECT_SELECT = "*, invoices(*, invoice_lines(*), payment_proofs(*)), project_outlets(*)";

// Satu proyek punya satu invoice (project_id unik), jadi Supabase mengembalikannya sebagai objek, bukan daftar.
export function asList<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function sortProject(p: Project): Project {
  return {
    ...p,
    project_outlets: [...(p.project_outlets ?? [])].sort((a, b) => a.position - b.position),
    // Invoice pesanan selalu pertama; tagihan tambahan menyusul.
    invoices: asList<Invoice>(p.invoices).sort((a, b) => (a.kind === b.kind ? a.created_at.localeCompare(b.created_at) : a.kind === "order" ? -1 : 1)).map((i) => ({
      ...i,
      invoice_lines: [...(i.invoice_lines ?? [])].sort((a, b) => a.position - b.position),
      payment_proofs: [...(i.payment_proofs ?? [])].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    })),
  };
}

// Pesanan client, terbaru dulu. Invoice yang lewat batas bayar ditandai kedaluwarsa oleh jadwal database
// (pg_cron, setiap 5 menit); pembayaran invoice yang sudah lewat batas tetap ditolak database.
export const getClientProjects = cache(async (clientId: string): Promise<Project[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select(PROJECT_SELECT).eq("client_id", clientId).order("created_at", { ascending: false });
  return ((data ?? []) as Project[]).map(sortProject);
});

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select(PROJECT_SELECT).eq("id", id).maybeSingle();
  return data ? sortProject(data as Project) : null;
}

export type ClientStage = "prospect" | "verifying" | "active";

// Tahap dashboard client dihitung dari pesanan terbaru yang masih berjalan.
export function clientState(projects: Project[]) {
  const open = projects.find((p) => OPEN_STATUSES.includes(p.status)) ?? null;
  const live = projects.find((p) => LIVE_STATUSES.includes(p.status)) ?? null;
  const current = open ?? live;
  const lastClosed = !current ? (projects.find((p) => p.status === "cancelled" || p.status === "expired") ?? null) : null;
  const stage: ClientStage = open ? "verifying" : live ? "active" : "prospect";
  // Milestone client: 2 pilih paket, 3 pembayaran, 4 lengkapi data, 5 audit berjalan, 7 tindak lanjut (laporan terbit).
  const milestone = open ? 3 : live ? (live.status === "completed" ? 7 : live.details_completed_at ? 5 : 4) : 2;
  const entitlements = [...new Set(projects.filter((p) => LIVE_STATUSES.includes(p.status)).flatMap((p) => p.entitlements))];
  return { open, live, current, lastClosed, stage, milestone, entitlements };
}
